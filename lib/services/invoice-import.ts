'use server';

import { createClient } from "@/lib/supabase/server";
import { type ExtractedInvoiceData } from "@/lib/domain/models";
import { type TablesInsert, type Json } from "@/supabase/database.types";
import iconv from "iconv-lite";
import { RocPeriod } from "@/lib/domain/roc-period";
import { toGregorianDate } from "@/lib/utils";
import * as XLSX from 'xlsx';

// Helper to parse byte string
function substringBytes(buffer: Buffer, start: number, length: number): string {
  // start is 1-based index from spec, convert to 0-based
  const chunk = buffer.subarray(start - 1, start - 1 + length);
  return iconv.decode(chunk, 'big5').trim();
}

interface ImportResult {
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function processElectronicInvoiceFile(
  clientId: string,
  firmId: string,
  storagePath: string,
  filename: string
): Promise<ImportResult> {
  const supabase = await createClient();
  const result: ImportResult = {
    total: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 1. Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('electronic-invoices')
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message || 'No data'}`);
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error("Unauthorized");

    let invoicesToInsert: TablesInsert<'invoices'>[] = [];

    // Check file extension
    const isExcel = filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls');

    if (isExcel) {
      invoicesToInsert = await processExcelFile(buffer, clientId, firmId, storagePath, filename, user.id, result);
    } else {
      // Assume TXT
      invoicesToInsert = await processTxtFile(buffer, clientId, firmId, storagePath, filename, user.id, result);
    }
    
    // Batch insert with duplicate check
    const uniqueInvoices = [];
    
    for (const inv of invoicesToInsert) {
      const extracted = inv.extracted_data as { invoiceSerialCode?: string }; // Cast for access
      if (!extracted || !extracted.invoiceSerialCode) {
        uniqueInvoices.push(inv);
        continue;
      }

      // Check against DB
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('firm_id', firmId)
        .eq('client_id', clientId)
        .contains('extracted_data', { invoiceSerialCode: extracted.invoiceSerialCode })
        .limit(1)
        .maybeSingle();

      if (!existing) {
        uniqueInvoices.push(inv);
      } else {
        result.skipped++;
      }
    }

    if (uniqueInvoices.length > 0) {
      const { error: insertError } = await supabase
        .from('invoices')
        .insert(uniqueInvoices);
        
      if (insertError) {
        throw insertError;
      }
      
      result.inserted = uniqueInvoices.length;
    }

  } catch (error) {
    console.error("Import error:", error);
    throw error;
  }

  return result;
}

async function processTxtFile(
    buffer: Buffer,
    clientId: string,
    firmId: string,
    storagePath: string,
    filename: string,
    userId: string,
    result: ImportResult
): Promise<TablesInsert<'invoices'>[]> {
    const invoicesToInsert: TablesInsert<'invoices'>[] = [];

    // Calculate total lines first
    const content = iconv.decode(buffer, 'big5');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    result.total = lines.length;

    let currentLine = 0;
    let offset = 0;
    while (offset < buffer.length) {
      currentLine++;
      let lineEnd = buffer.indexOf('\n', offset);
      if (lineEnd === -1) lineEnd = buffer.length;
      
      // Handle CR if present
      let lineContentEnd = lineEnd;
      if (lineContentEnd > offset && buffer[lineContentEnd - 1] === 0x0D) { // \r
        lineContentEnd--;
      }
      
      const lineBuffer = buffer.subarray(offset, lineContentEnd);
      offset = lineEnd + 1;

      if (lineBuffer.length === 0) continue;
      
      // Strict 81 bytes check? Some systems might not pad correctly or might strip trailing spaces.
      let processingBuffer = lineBuffer;
      if (lineBuffer.length < 81) {
          const padding = Buffer.alloc(81 - lineBuffer.length, ' '); // Space char
          processingBuffer = Buffer.concat([lineBuffer, padding]);
      }

      try {
        const invoiceData = parseTxtRow(processingBuffer, clientId, firmId, storagePath, filename, userId);
        if (invoiceData) {
          invoicesToInsert.push(invoiceData as TablesInsert<'invoices'>);
        }
      } catch (e) {
        result.failed++;
        result.errors.push(`Line ${currentLine}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }
    return invoicesToInsert;
}

function parseTxtRow(
  buffer: Buffer, 
  clientId: string, 
  firmId: string, 
  storagePath: string, 
  filename: string,
  userId: string
): TablesInsert<'invoices'> {

  // A: Format Code (1-2)
  const formatCode = substringBytes(buffer, 1, 2);
  
  // D: YearMonth (19-23)
  const yearMonthStr = substringBytes(buffer, 19, 5);
  
  const taxType = substringBytes(buffer, 62, 1); // P
  const taxAmountStr = substringBytes(buffer, 63, 10); // Q
  const salesAmountStr = substringBytes(buffer, 50, 12); // O/N
  
  const inOrOut = formatCode.startsWith('2') ? 'in' : 'out';
  const invoiceTypeStr = getInvoiceTypeFromCode(formatCode);
  
  const S = substringBytes(buffer, 80, 1);
  let buyerTaxId = substringBytes(buffer, 24, 8);
  let sellerTaxId = substringBytes(buffer, 32, 8);
  
  if (S === 'A' && inOrOut === 'out') {
    buyerTaxId = ""; 
  }
  
  if (S === 'A' && inOrOut === 'in') {
    sellerTaxId = ""; // Aggregate input
  }
  
  let invoiceSerial = "";
  let invoiceNo = "";
  
  if (formatCode === '28' || formatCode === '29') {
     invoiceNo = substringBytes(buffer, 36, 14);
  } else {
     invoiceSerial = substringBytes(buffer, 40, 2);
     invoiceNo = substringBytes(buffer, 42, 8);
  }
  
  const fullInvoiceNumber = invoiceSerial + invoiceNo;
  
  // Tax Type mapping
  const taxTypeMap: Record<string, string> = {
    '1': '應稅',
    '2': '零稅率',
    '3': '免稅',
    'F': '作廢',
  };
  
  let mappedTaxType = taxTypeMap[taxType] || '應稅';
  if (S === 'A') mappedTaxType = '彙加';
  if (taxType === 'F') mappedTaxType = '作廢';
  
  // Amounts
  const sales = parseInt(salesAmountStr) || 0;
  const tax = parseInt(taxAmountStr) || 0;
  
  // Date conversion
  const period = RocPeriod.fromYYYMM(yearMonthStr);
  const date = toGregorianDate(yearMonthStr);
  const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

  // Extracted Data
  const extractedData: ExtractedInvoiceData & { source: string } = {
    invoiceSerialCode: fullInvoiceNumber,
    date: dateStr,
    sellerTaxId: sellerTaxId,
    buyerTaxId: buyerTaxId,
    totalSales: sales,
    tax: tax,
    totalAmount: sales + tax,
    taxType: mappedTaxType as ExtractedInvoiceData['taxType'],
    invoiceType: invoiceTypeStr as ExtractedInvoiceData['invoiceType'],
    inOrOut: inOrOut === 'in' ? '進項' : '銷項',
    deductible: true, // Note we don't have deductible information in the TXT file, so we assume it's true.
    source: 'import-txt'
  };

  return {
    firm_id: firmId,
    client_id: clientId,
    storage_path: storagePath,
    filename: filename,
    in_or_out: inOrOut,
    status: 'processed',
    extracted_data: extractedData as unknown as Json,
    year_month: period.toString(),
    uploaded_by: userId,
  };
}

interface ExcelRow {
    [key: string]: unknown;
}

// Helper to get value with fuzzy key matching (trim) to avoid issues with dirty headers
function getRowValue(row: ExcelRow, key: string): unknown {
  if (row[key] !== undefined) return row[key];
  // try trimmed key
  const foundKey = Object.keys(row).find(k => k.trim() === key);
  return foundKey ? row[foundKey] : undefined;
}

function getString(row: ExcelRow, key: string): string {
  const val = getRowValue(row, key);
  return val !== undefined && val !== null ? String(val).trim() : '';
}

function getNumber(row: ExcelRow, key: string): number {
  const val = getRowValue(row, key);
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val.replace(/,/g, '')) || 0;
  return 0;
}

async function processExcelFile(
    buffer: Buffer,
    clientId: string,
    firmId: string,
    storagePath: string,
    filename: string,
    userId: string,
    result: ImportResult
): Promise<TablesInsert<'invoices'>[]> {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  
  let headerSheetName: string | undefined;
  let detailSheetName: string | undefined;

  // Check columns to identify sheets
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    const firstRowValues: string[] = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
      if (cell && cell.v) firstRowValues.push(String(cell.v));
    }

    if (
      firstRowValues.some(
        (v) => v.includes("買受人註記") || v.includes("格式代號")
      )
    ) {
      headerSheetName = name;
    } else if (
      firstRowValues.some((v) => v.includes("品名") || v.includes("序號"))
    ) {
      detailSheetName = name;
    }
  }

  if (!headerSheetName || !detailSheetName) {
    throw new Error(
      'Invalid Excel format. Expected two separate sheets: one with header information (containing "格式代號" or "買受人註記") and one with details (containing "品名" or "序號").'
    );
  }

  const headerRows = XLSX.utils.sheet_to_json<ExcelRow>(workbook.Sheets[headerSheetName]);
  const detailRows = detailSheetName ? XLSX.utils.sheet_to_json<ExcelRow>(workbook.Sheets[detailSheetName]) : [];
  
  result.total = headerRows.length;

  // Group details by invoice number
  const detailsMap = new Map<string, ExcelRow[]>();
  for (const row of detailRows) {
    const invNum = getString(row, '發票號碼');
    if (invNum) {
        if (!detailsMap.has(invNum)) detailsMap.set(invNum, []);
        detailsMap.get(invNum)?.push(row);
    }
  }
  
  const invoices: TablesInsert<'invoices'>[] = [];
  
  for (let i = 0; i < headerRows.length; i++) {
    try {
        const row = headerRows[i];
        const invoiceNo = getString(row, '發票號碼');
        if (!invoiceNo) continue;
        
        const status = getString(row, '發票狀態');
        
        let dateObj: Date;
        const dateVal = getRowValue(row, '發票日期');
        
        if (dateVal instanceof Date) {
            dateObj = dateVal;
        } else {
            // Try parsing YYYY/MM/DD or YYYY-MM-DD
            // If string is "2025-11-10 12:00:00", new Date() usually parses it correctly in JS
            dateObj = new Date(String(dateVal));
            if (isNaN(dateObj.getTime())) {
                console.warn(`Invalid date for invoice ${invoiceNo}: ${dateVal}`);
                dateObj = new Date(); 
            }
        }
        
        const rocPeriod = RocPeriod.fromDate(dateObj);
        const yyyy = dateObj.getFullYear();
        const mm = dateObj.getMonth() + 1;
        const dd = dateObj.getDate();
        const dateStr = `${yyyy}/${mm}/${dd}`;
        
        const formatCode = getString(row, '格式代號');
        const inOrOut = formatCode.startsWith('2') ? 'in' : 'out';
        
        const sellerTaxId = getString(row, '賣方統一編號');
        const sellerName = getString(row, '賣方名稱');
        const buyerTaxId = getString(row, '買方統一編號');
        const buyerName = getString(row, '買方名稱');
        
        const salesAmount = getNumber(row, '銷售額合計');
        const taxAmount = getNumber(row, '營業稅');
        const totalAmount = getNumber(row, '總計');
        
        const taxTypeRaw = getString(row, '課稅別');
        let taxType = '應稅';
        if (taxTypeRaw === '應稅' || taxTypeRaw === '1') taxType = '應稅';
        else if (taxTypeRaw === '零稅率' || taxTypeRaw === '2') taxType = '零稅率';
        else if (taxTypeRaw === '免稅' || taxTypeRaw === '3') taxType = '免稅';
        else if (status.includes('作廢') || taxTypeRaw === '作廢' || taxTypeRaw === 'F') taxType = '作廢';

        const invoiceType = getInvoiceTypeFromCode(formatCode);
        
        // Items
        const items = detailsMap.get(invoiceNo)?.map(d => ({
            description: getString(d, '品名'),
            quantity: getNumber(d, '數量'),
            unit: getString(d, '單位'),
            unitPrice: getNumber(d, '單價'),
            amount: getNumber(d, '金額')
        })) || [];
        
        const extractedData: ExtractedInvoiceData & { source: string } = {
            invoiceSerialCode: invoiceNo,
            date: dateStr,
            sellerTaxId,
            sellerName,
            buyerTaxId,
            buyerName,
            totalSales: salesAmount,
            tax: taxAmount,
            totalAmount: totalAmount,
            taxType: taxType as ExtractedInvoiceData['taxType'],
            invoiceType: invoiceType as ExtractedInvoiceData['invoiceType'],
            inOrOut: inOrOut === 'in' ? '進項' : '銷項',
            deductible: true,
            source: 'import-excel',
            summary: items.map(item => `品名：${item.description} 數量：${item.quantity} 單位：${item.unit} 單價：${item.unitPrice} 金額：${item.amount}`).join('\n'),
            account: inOrOut === 'out' ? '4101 營業收入' : undefined,
        };
        
        invoices.push({
            firm_id: firmId,
            client_id: clientId,
            storage_path: storagePath,
            filename: filename,
            in_or_out: inOrOut,
            status: 'processed',
            extracted_data: extractedData as unknown as Json,
            year_month: rocPeriod.toString(),
            uploaded_by: userId,
        });
    } catch (e) {
        result.failed++;
        result.errors.push(`Row ${i + 2}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }
  
  return invoices;
}

function getInvoiceTypeFromCode(code: string): string {
  // Mapping based on common knowledge or spec if available
  // 21: 進項三聯式
  // 22: 進項二聯式
  // 25: 進項三聯式收銀機 / 電子發票
  // 31: 銷項三聯式
  // 32: 銷項二聯式
  // 35: 銷項三聯式收銀機 / 電子發票
  
  switch (code) {
    case '21': return '手開三聯式';
    case '22': return '手開二聯式';
    case '25': return '電子發票'; // Or 三聯式收銀機
    case '31': return '手開三聯式';
    case '32': return '手開二聯式';
    case '35': return '電子發票';
    default: return '電子發票'; // Fallback
  }
}
