'use server';

import { createClient } from "@/lib/supabase/server";
import { type ExtractedInvoiceData, type ExtractedAllowanceData, type TaxFilingPeriod } from "@/lib/domain/models";
import { type Database, type TablesInsert, type Json } from "@/supabase/database.types";
import { type SupabaseClient } from "@supabase/supabase-js";
import { RocPeriod } from "@/lib/domain/roc-period";
import { ALLOWANCE_FORMAT_CODE_MAP } from "@/lib/domain/format-codes";
import { formatDateToYYYYMMDD } from "@/lib/utils";
import * as XLSX from 'xlsx';
import { getTaxPeriodByYYYMM } from "@/lib/services/tax-period";

interface ImportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  // Optional breakdown by type (for aggregated reporting)
  fileType?: 'invoice' | 'allowance';
}

type FileType = 'invoice' | 'allowance';

/**
 * Detect file type by examining Excel headers.
 * Allowance files have '折讓單號碼' column, invoice files don't.
 */
function detectFileType(workbook: XLSX.WorkBook): FileType {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    const firstRowValues: string[] = [];

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
      if (cell && cell.v) firstRowValues.push(String(cell.v));
    }

    // Allowance files have 折讓單號碼 header
    if (firstRowValues.some(v => v.includes('折讓單號碼'))) {
      return 'allowance';
    }
  }

  // Default to invoice (existing behavior)
  return 'invoice';
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

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const fileType = detectFileType(workbook);
    result.fileType = fileType;

    if (fileType === 'allowance') {
      // Process as allowance file
      return await processAllowanceExcelFile(
        workbook,
        clientId,
        firmId,
        storagePath,
        filename,
        userId,
        period,
        supabase
      );
    }

    // Process as invoice file (existing logic)
    const invoicesToInsert = await processInvoiceExcelFile(
      workbook,
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

async function processInvoiceExcelFile(
    workbook: XLSX.WorkBook,
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
  result.fileType = 'invoice';
  
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
        
        const dateVal = getRowValue(row, '發票日期');
        const dateObj = parseDate(dateVal, `invoice ${invoiceNo}`);
        const rocPeriod = RocPeriod.fromDate(dateObj);
        const dateStr = formatDate(dateVal);
        
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

// ===== Allowance Excel Processing =====

/**
 * Process an allowance Excel file.
 * Groups rows by 折讓單號碼 and inserts into allowances table.
 */
async function processAllowanceExcelFile(
  workbook: XLSX.WorkBook,
  clientId: string,
  firmId: string,
  storagePath: string,
  filename: string,
  userId: string,
  filingPeriod: TaxFilingPeriod,
  supabase: SupabaseClient<Database>
): Promise<ImportResult> {
  const result: ImportResult = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    fileType: 'allowance',
  };

  // Allowance files have a single sheet
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(workbook.Sheets[sheetName]);

  // Group rows by 折讓單號碼
  const groupedRows = new Map<string, ExcelRow[]>();
  for (const row of rows) {
    const serialCode = getString(row, '折讓單號碼');
    if (!serialCode) continue;

    if (!groupedRows.has(serialCode)) {
      groupedRows.set(serialCode, []);
    }
    groupedRows.get(serialCode)!.push(row);
  }

  result.total = groupedRows.size;
  const allowancesToInsert: TablesInsert<'allowances'>[] = [];

  for (const [serialCode, itemRows] of groupedRows) {
    try {
      const allowance = parseAllowanceFromRows(
        serialCode,
        itemRows,
        clientId,
        firmId,
        storagePath,
        filename,
        filingPeriod.id,
        userId
      );
      allowancesToInsert.push(allowance);
    } catch (e) {
      result.failed++;
      result.errors.push(`折讓單 ${serialCode}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  // Batch upsert
  if (allowancesToInsert.length > 0) {
    // Check existing
    const serialCodes = allowancesToInsert
      .map(a => a.allowance_serial_code)
      .filter((code): code is string => Boolean(code));

    let existingCount = 0;
    if (serialCodes.length > 0) {
      const { data: existingAllowances, error: existingError } = await supabase
        .from('allowances')
        .select('allowance_serial_code')
        .eq('client_id', clientId)
        .in('allowance_serial_code', serialCodes);

      if (existingError) {
        throw existingError;
      }

      existingCount = existingAllowances?.length || 0;
    }

    const { data, error } = await supabase
      .from('allowances')
      .upsert(allowancesToInsert, {
        onConflict: 'client_id, allowance_serial_code',
      })
      .select('id');

    if (error) {
      result.failed += allowancesToInsert.length;
      result.errors.push(error.message);
    } else {
      const upsertedCount = data?.length || 0;
      result.updated = Math.min(existingCount, upsertedCount);
      result.inserted = Math.max(upsertedCount - existingCount, 0);

      // Attempt to link to original invoices
      const allowanceIds = data?.map(a => a.id) || [];
      await linkAllowancesToInvoices(clientId, allowanceIds, supabase);
    }
  }

  return result;
}

/**
 * Parse allowance data from grouped Excel rows.
 * Multiple rows with the same 折讓單號碼 are combined into one record.
 */
function parseAllowanceFromRows(
  serialCode: string,
  itemRows: ExcelRow[],
  clientId: string,
  firmId: string,
  storagePath: string,
  filename: string,
  periodId: string,
  userId: string
): TablesInsert<'allowances'> {
  // Take common fields from first row
  const firstRow = itemRows[0];
  const formatCode = getString(firstRow, '格式代號');

  const formatMapping = ALLOWANCE_FORMAT_CODE_MAP[formatCode];
  if (!formatMapping) {
    throw new Error(`Unknown format code: ${formatCode}`);
  }
  const { inOrOut, allowanceType } = formatMapping;

  const originalSerialCode = getString(firstRow, '發票號碼');
  const dateVal = getRowValue(firstRow, '折讓單日期');
  const dateStr = formatDate(dateVal);

  // Combine line items into summary text (similar to invoice details)
  const summary = itemRows
    .map(row => {
      const desc = getString(row, '品項名稱');
      const amt = getNumber(row, '品項折讓金額(不含稅)');
      return `品名：${desc}, 折讓金額：${amt}`;
    })
    .join('\n');

  const items = itemRows.map(row => ({
    amount: getNumber(row, '品項折讓金額(不含稅)'),
    taxAmount: getNumber(row, '品項折讓稅額'),
    description: getString(row, '品項名稱'),
  }));

  const sellerTaxId = getString(firstRow, '賣方統一編號');
  const sellerName = getString(firstRow, '賣方名稱');
  const buyerTaxId = getString(firstRow, '買方統一編號');
  const buyerName = getString(firstRow, '買方名稱');

  const extractedData: ExtractedAllowanceData = {
    allowanceType,
    amount: getNumber(firstRow, '折讓金額(不含稅)'),
    taxAmount: getNumber(firstRow, '折讓稅額'),
    date: dateStr,
    sellerTaxId,
    sellerName,
    buyerTaxId: buyerTaxId === "0000000000" ? undefined : buyerTaxId, // B2C：賣方填入統一編號，買方填入 10 個"0"
    buyerName,
    originalInvoiceSerialCode: originalSerialCode,
    summary,
    items,
    source: 'import-excel',
    account: inOrOut === 'out' ? '4202 銷貨折讓' : '5023 進貨折讓',
  };

  return {
    firm_id: firmId,
    client_id: clientId,
    storage_path: storagePath,
    filename: filename,
    tax_filing_period_id: periodId,
    allowance_serial_code: serialCode,
    original_invoice_serial_code: originalSerialCode,
    in_or_out: inOrOut,
    status: 'uploaded',
    uploaded_by: userId,
    extracted_data: extractedData as unknown as Json,
  };
}

/**
 * Parse date value from Excel to Date object.
 * Throws if the date is invalid.
 */
function parseDate(dateVal: unknown, context?: string): Date {
  if (!dateVal) {
    throw new Error(`Missing date${context ? ` for ${context}` : ''}`);
  }

  if (dateVal instanceof Date) {
    return dateVal;
  }

  const dateObj = new Date(String(dateVal));
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date${context ? ` for ${context}` : ''}: ${dateVal}`);
  }

  return dateObj;
}

/**
 * Format date value from Excel to YYYY/MM/DD string.
 */
function formatDate(dateVal: unknown): string {
  if (!dateVal) return '';

  try {
    const dateObj = parseDate(dateVal);
    return formatDateToYYYYMMDD(dateObj);
  } catch {
    return String(dateVal);
  }
}

/**
 * Attempts to link a single allowance to its original invoice.
 * Use this for manual updates or when a single allowance needs re-linking.
 */
export async function tryLinkOriginalInvoice(
  clientId: string,
  allowanceId: string,
  originalSerialCode: string,
  supabaseClient?: SupabaseClient<Database>
): Promise<{ linked: boolean; invoiceId?: string }> {
  const supabase = supabaseClient ?? await createClient();

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('client_id', clientId)
    .eq('invoice_serial_code', originalSerialCode)
    .maybeSingle();

  if (invoice) {
    await supabase
      .from('allowances')
      .update({ original_invoice_id: invoice.id })
      .eq('id', allowanceId);

    return { linked: true, invoiceId: invoice.id };
  }

  return { linked: false };
}

/**
 * Batch link multiple allowances after import.
 * Optimized to use bulk queries instead of N+1.
 */
async function linkAllowancesToInvoices(
  clientId: string,
  allowanceIds: string[],
  supabase: SupabaseClient<Database>
): Promise<{ linked: number; unlinked: number }> {
  if (allowanceIds.length === 0) return { linked: 0, unlinked: 0 };

  // 1. Get all allowances needing linking (one query)
  const { data: allowances } = await supabase
    .from('allowances')
    .select('id, original_invoice_serial_code')
    .in('id', allowanceIds)
    .is('original_invoice_id', null)
    .not('original_invoice_serial_code', 'is', null);

  if (!allowances || allowances.length === 0) {
    return { linked: 0, unlinked: 0 };
  }

  // 2. Collect all unique serial codes
  const serialCodes = [...new Set(
    allowances
      .map(a => a.original_invoice_serial_code)
      .filter((code): code is string => Boolean(code))
  )];

  if (serialCodes.length === 0) {
    return { linked: 0, unlinked: allowances.length };
  }

  // 3. Query all matching invoices in one call
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_serial_code')
    .eq('client_id', clientId)
    .in('invoice_serial_code', serialCodes);

  if (!invoices || invoices.length === 0) {
    return { linked: 0, unlinked: allowances.length };
  }

  // 4. Build mapping: serial_code -> invoice_id
  const serialToInvoiceId = new Map<string, string>();
  for (const inv of invoices) {
    if (inv.invoice_serial_code) {
      serialToInvoiceId.set(inv.invoice_serial_code, inv.id);
    }
  }

  // 5. Group allowances by their target invoice_id for batch updates
  const invoiceIdToAllowanceIds = new Map<string, string[]>();
  let unlinkedCount = 0;

  for (const allowance of allowances) {
    const invoiceId = allowance.original_invoice_serial_code
      ? serialToInvoiceId.get(allowance.original_invoice_serial_code)
      : undefined;

    if (invoiceId) {
      if (!invoiceIdToAllowanceIds.has(invoiceId)) {
        invoiceIdToAllowanceIds.set(invoiceId, []);
      }
      invoiceIdToAllowanceIds.get(invoiceId)!.push(allowance.id);
    } else {
      unlinkedCount++;
    }
  }

  // 6. Batch update: one update per unique invoice_id
  let linkedCount = 0;
  for (const [invoiceId, allowanceIdsToUpdate] of invoiceIdToAllowanceIds) {
    const { error } = await supabase
      .from('allowances')
      .update({ original_invoice_id: invoiceId })
      .in('id', allowanceIdsToUpdate);

    if (!error) {
      linkedCount += allowanceIdsToUpdate.length;
    } else {
      unlinkedCount += allowanceIdsToUpdate.length;
    }
  }

  return { linked: linkedCount, unlinked: unlinkedCount };
}
