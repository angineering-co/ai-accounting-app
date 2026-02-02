'use server';

import { createClient } from "@/lib/supabase/server";
import { type ExtractedInvoiceData, type TaxFilingPeriod } from "@/lib/domain/models";
import { type Database, type TablesInsert, type Json } from "@/supabase/database.types";
import { type SupabaseClient } from "@supabase/supabase-js";
import { RocPeriod } from "@/lib/domain/roc-period";
import * as XLSX from 'xlsx';
import { getTaxPeriodByYYYMM } from "@/lib/services/tax-period";

interface ImportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// This is for testing purposes only
interface ProcessElectronicInvoiceTestOptions {
  supabaseClient?: SupabaseClient<Database>;
  userId?: string;
}

export async function processElectronicInvoiceFile(
  clientId: string,
  firmId: string,
  storagePath: string,
  filename: string,
  filingYearMonth: string,
  options?: ProcessElectronicInvoiceTestOptions
): Promise<ImportResult> {
  const supabase = options?.supabaseClient ?? await createClient();
  const result: ImportResult = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 1. Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("electronic-invoices")
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(
        `Failed to download file: ${downloadError?.message || "No data"}`
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let userId = options?.userId;
    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Unauthorized");
      userId = user.id;
    }

    const period = await getTaxPeriodByYYYMM(clientId, filingYearMonth, { supabaseClient: supabase });

    if (!period) {
      throw new Error(`申報期別 ${filingYearMonth} 尚未建立，請先建立期別。`);
    }

    // Check if period is locked
    if (period.status === "locked" || period.status === "filed") {
      throw new Error("此期別已鎖定，無法匯入發票。");
    }

    // Only Excel files are supported
    const isExcel =
      filename.toLowerCase().endsWith(".xlsx") ||
      filename.toLowerCase().endsWith(".xls");

    if (!isExcel) {
      throw new Error("僅支援 Excel 檔案格式 (.xlsx, .xls)");
    }

    const invoicesToInsert = await processExcelFile(
      buffer,
      clientId,
      firmId,
      storagePath,
      filename,
      userId,
      result,
      period
    );

    // Batch upsert with ON CONFLICT (override duplicates)
    if (invoicesToInsert.length > 0) {
      const serialCodes = Array.from(
        new Set(
          invoicesToInsert
            .map((invoice) => invoice.invoice_serial_code)
            .filter((code): code is string => Boolean(code && code.trim()))
        )
      );

      let existingCount = 0;
      if (serialCodes.length > 0) {
        const { data: existingInvoices, error: existingError } = await supabase
          .from("invoices")
          .select("invoice_serial_code")
          .eq("client_id", clientId)
          .in("invoice_serial_code", serialCodes);

        if (existingError) {
          throw existingError;
        }

        existingCount = existingInvoices?.length || 0;
      }

      const { data: insertedData, error: insertError } = await supabase
        .from("invoices")
        .upsert(invoicesToInsert, {
          onConflict: "client_id, invoice_serial_code",
        })
        .select("id"); // We need to select to know how many were inserted

      if (insertError) {
        throw insertError;
      }

      const upsertedCount = insertedData?.length || 0;
      result.updated = Math.min(existingCount, upsertedCount);
      result.inserted = Math.max(upsertedCount - existingCount, 0);
      result.skipped = 0;
    }
  } catch (error) {
    console.error("Import error:", error);
    throw error;
  }

  return result;
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
    result: ImportResult,
    filingPeriod: TaxFilingPeriod
): Promise<TablesInsert<'invoices'>[]> {
  const filingPeriodRoc = RocPeriod.fromYYYMM(filingPeriod.year_month);
  const filingPeriodId = filingPeriod.id;
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
        
        let dateObj: Date;
        const dateVal = getRowValue(row, '發票日期');
        
        if (dateVal instanceof Date) {
            dateObj = dateVal;
        } else {
            // Try parsing YYYY/MM/DD or YYYY-MM-DD
            // If string is "2025-11-10 12:00:00", new Date() usually parses it correctly in JS
            dateObj = new Date(String(dateVal));
            if (isNaN(dateObj.getTime())) {
              throw new Error(`Invalid date for invoice ${invoiceNo}: ${dateVal}`);
            }
        }
        
        const rocPeriod = RocPeriod.fromDate(dateObj);
        const dateStr = `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
        
        const formatCode = getString(row, '格式代號');
        const inOrOut = formatCode.startsWith('2') ? 'in' : 'out';

        // Validate Date against Filing Period (if provided)
        if (filingPeriodRoc) {
            if (inOrOut === 'out') {
                // Output: Must match exactly
                if (rocPeriod.toString() !== filingPeriodRoc.toString()) {
                    throw new Error(`銷項發票日期 (${rocPeriod.format()}) 必須與申報期別 (${filingPeriodRoc.format()}) 一致`);
                }
            } else {
                // Input: Must not be in future
                if (parseInt(rocPeriod.toString()) > parseInt(filingPeriodRoc.toString())) {
                    throw new Error(`進項發票日期 (${rocPeriod.format()}) 不可晚於申報期別 (${filingPeriodRoc.format()})`);
                }
            }
        }
        
        const sellerTaxId = getString(row, '賣方統一編號');
        const sellerName = getString(row, '賣方名稱');
        const buyerTaxId = getString(row, '買方統一編號');
        const buyerName = getString(row, '買方名稱');
        
        const salesAmount = getNumber(row, '銷售額合計');
        const taxAmount = getNumber(row, '營業稅');
        const totalAmount = getNumber(row, '總計');
        
        const taxTypeRaw = getString(row, '課稅別');
        let taxType = '應稅';
        if (taxTypeRaw.includes("應稅")) {
          taxType = "應稅";
        } else if (taxTypeRaw.includes("零稅率")) {
          taxType = "零稅率";
        } else if (taxTypeRaw.includes("免稅")) {
          taxType = "免稅";
        }

        const status = getString(row, "發票狀態");
        if (status.includes("作廢")) {
          taxType = "作廢";
        }

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
            buyerTaxId: buyerTaxId === "0000000000" ? undefined : buyerTaxId, // B2C：賣方填入統一編號，買方填入 10 個"0"
            buyerName: buyerName,
            totalSales: salesAmount,
            tax: taxAmount,
            totalAmount: totalAmount,
            taxType: taxType as ExtractedInvoiceData['taxType'],
            invoiceType: invoiceType as ExtractedInvoiceData['invoiceType'],
            inOrOut: inOrOut === 'in' ? '進項' : '銷項',
            deductible: true,
            source: 'import-excel',
            summary: items.map(item => `品名：${item.description}, 數量：${item.quantity}, 金額：${item.amount}`).join('\n'),
            account: inOrOut === 'out' ? '4101 營業收入' : undefined,
        };
        
        invoices.push({
            firm_id: firmId,
            client_id: clientId,
            storage_path: storagePath,
            filename: filename,
            in_or_out: inOrOut,
            status: 'uploaded',
            extracted_data: extractedData as unknown as Json,
            year_month: rocPeriod.toString(),
            tax_filing_period_id: filingPeriodId,
            uploaded_by: userId,
            invoice_serial_code: invoiceNo,
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
