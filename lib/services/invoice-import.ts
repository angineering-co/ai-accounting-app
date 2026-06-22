'use server';

import { createClient } from "@/lib/supabase/server";
import { type ExtractedInvoiceData, type ExtractedAllowanceData, type TaxFilingPeriod } from "@/lib/domain/models";
import { type Database, type TablesInsert, type Json } from "@/supabase/database.types";
import { type SupabaseClient } from "@supabase/supabase-js";
import { RocPeriod } from "@/lib/domain/roc-period";
import { ALLOWANCE_FORMAT_CODE_MAP } from "@/lib/domain/format-codes";
import { formatDateToISO, formatDateToYYYYMMDD } from "@/lib/utils";
import * as XLSX from 'xlsx';
import { getTaxPeriodByYYYMM } from "@/lib/services/tax-period";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db/drizzle";
import { assertCallerCanAccessClient } from "@/lib/db/rls";
import { isBusinessBuyer } from "@/lib/domain/tax-id";
import {
  documents as documentsTable,
  invoices as invoicesTable,
  allowances as allowancesTable,
} from "@/lib/db/schema";

// PostgREST encodes .in() values as URL query params. With thousands of
// values the URL exceeds the ~8 KB server limit → "URL too long".
// We split large arrays into chunks that stay safely under the limit.
const DEFAULT_CHUNK_SIZE_QUERY = 300;
const DEFAULT_CHUNK_SIZE_UPSERT = 500;

type SupabaseFrom = ReturnType<SupabaseClient<Database>['from']>;
type SupabaseSelect = ReturnType<SupabaseFrom['select']>;

/**
 * Execute a Supabase `.in()` query in chunks to avoid URL-length limits.
 * Returns the merged result rows from all chunks.
 */
export async function chunkedIn<T extends Record<string, unknown>>(
  buildQuery: () => SupabaseFrom,
  selectColumns: string,
  column: string,
  values: string[],
  extraFilters?: (q: SupabaseSelect) => SupabaseSelect,
  chunkSize = DEFAULT_CHUNK_SIZE_QUERY,
): Promise<T[]> {
  if (values.length === 0) return [];

  const results: T[] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    let query = buildQuery().select(selectColumns).in(column, chunk);
    if (extraFilters) {
      query = extraFilters(query);
    }
    const { data, error } = await query;
    if (error) throw error;
    if (data) results.push(...(data as T[]));
  }
  return results;
}

/**
 * Upsert rows in chunks to avoid oversized POST bodies.
 * Returns all upserted rows (with selected columns).
 */
export async function chunkedUpsert<T extends Record<string, unknown>>(
  supabase: SupabaseClient<Database>,
  table: 'invoices' | 'allowances',
  rows: Record<string, unknown>[],
  onConflict: string,
  selectColumns: string,
  chunkSize = DEFAULT_CHUNK_SIZE_UPSERT,
): Promise<T[]> {
  if (rows.length === 0) return [];

  const results: T[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await (supabase.from(table) as SupabaseFrom)
      .upsert(chunk, { onConflict })
      .select(selectColumns);
    if (error) throw error;
    if (data) results.push(...(data as T[]));
  }
  return results;
}

interface ImportResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: string[];
  // Optional breakdown by type (for aggregated reporting)
  fileType?: 'invoice' | 'allowance';
}

// Row shape during the bulk-import flow, before `commitXxxRowsAtomically`
// resolves and assigns the `document_id`. After Phase 6b Work C the column
// is NOT NULL at the DB layer (and required by `TablesInsert<'invoices'>` /
// `TablesInsert<'allowances'>`), but the producers below build rows without
// it and the commit helpers fill it in inside the transaction.
type PreLinkInvoiceInsert = Omit<TablesInsert<'invoices'>, 'document_id'> & {
  document_id?: string;
};
type PreLinkAllowanceInsert = Omit<TablesInsert<'allowances'>, 'document_id'> & {
  document_id?: string;
};

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
    succeeded: 0,
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

    if (invoicesToInsert.length > 0) {
      result.succeeded = await commitInvoiceRowsAtomically(
        invoicesToInsert,
        clientId,
        userId,
      );
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
): Promise<PreLinkInvoiceInsert[]> {
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
  
  const invoices: PreLinkInvoiceInsert[] = [];
  
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
        
        const salesAmount = getNumber(row, '應稅銷售額');
        const taxAmount = getNumber(row, '營業稅');
        const totalAmount = salesAmount + taxAmount;
        
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
            buyerTaxId: isBusinessBuyer(buyerTaxId) ? buyerTaxId : undefined, // B2C：賣方填入統一編號，買方填入 10 個"0"
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
            status: inOrOut === 'out' ? 'confirmed' : 'uploaded',
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
    succeeded: 0,
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
  const allowancesToInsert: PreLinkAllowanceInsert[] = [];

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

  if (allowancesToInsert.length > 0) {
    try {
      const upsertedIds = await commitAllowanceRowsAtomically(
        allowancesToInsert,
        clientId,
        userId,
      );

      result.succeeded = upsertedIds.length;

      // Attempt to link to original invoices (outside the documents
      // transaction — this only writes to allowances.original_invoice_id
      // and is a separate concern from the documents-first guarantee).
      await linkAllowancesToInvoices(clientId, upsertedIds, supabase);
    } catch (error) {
      result.failed += allowancesToInsert.length;
      result.errors.push(error instanceof Error ? error.message : String(error));
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
): PreLinkAllowanceInsert {
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
    buyerTaxId: isBusinessBuyer(buyerTaxId) ? buyerTaxId : undefined, // B2C：賣方填入統一編號，買方填入 10 個"0"
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
    status: 'confirmed',
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

  // 1. Get all allowances needing linking (chunked to avoid URL-length limits)
  const allowances = await chunkedIn<{ id: string; original_invoice_serial_code: string | null }>(
    () => supabase.from('allowances'),
    'id, original_invoice_serial_code',
    'id',
    allowanceIds,
    (q) => q.is('original_invoice_id', null).not('original_invoice_serial_code', 'is', null),
  );

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

  // 3. Query all matching invoices (chunked to avoid URL-length limits)
  const invoices = await chunkedIn<{ id: string; invoice_serial_code: string | null }>(
    () => supabase.from('invoices'),
    'id, invoice_serial_code',
    'invoice_serial_code',
    serialCodes,
    (q) => q.eq('client_id', clientId),
  );

  if (invoices.length === 0) {
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

  // 6. Batch update: one update per unique invoice_id (chunked for safety)
  let linkedCount = 0;
  for (const [invoiceId, allowanceIdsToUpdate] of invoiceIdToAllowanceIds) {
    try {
      for (let i = 0; i < allowanceIdsToUpdate.length; i += DEFAULT_CHUNK_SIZE_QUERY) {
        const chunk = allowanceIdsToUpdate.slice(i, i + DEFAULT_CHUNK_SIZE_QUERY);
        const { error } = await supabase
          .from('allowances')
          .update({ original_invoice_id: invoiceId })
          .in('id', chunk);
        if (error) throw error;
      }
      linkedCount += allowanceIdsToUpdate.length;
    } catch (error) {
      console.error(`Failed to link allowances for invoice ${invoiceId}:`, error);
      unlinkedCount += allowanceIdsToUpdate.length;
    }
  }

  return { linked: linkedCount, unlinked: unlinkedCount };
}

// ===== documents-first commit helpers (Phase 6b) =====
//
// The two helpers below wrap document-row creation and the invoice/allowance
// upsert in a single Drizzle transaction. Each row in the input batch lands
// in one of three buckets:
//
//   (a) Row's serial code already exists in DB AND already has a document_id
//       (re-import case — e.g. user re-uploaded the same Excel to fix the
//       filing period, or Phase 6a backfill ran earlier). Reuse the existing
//       document_id so any audit_trails / journal_entries that already point
//       at it stay valid.
//
//   (b) Row's serial code is brand-new but appears multiple times in this
//       batch (rare; Excel duplicate). Build one document and point all
//       duplicate rows at it. Without this dedup we'd mint N documents, the
//       upsert's ON CONFLICT would resolve to one invoice row keeping one
//       document_id, and the other N-1 documents would be orphans.
//
//   (c) Row's serial code is brand-new and unique. One document, one row.
//
// Concurrency: a per-client `pg_advisory_xact_lock` at the top serializes
// imports for the same client so two writers can't each create a fresh
// document for the same brand-new serial code. The `.for('update')` row
// lock in fetchExistingDocLinks alone wouldn't help — it can only lock
// rows that exist. The COALESCE in the upsert's ON CONFLICT set clause is
// belt-and-braces: it preserves any existing document_id even if a race
// somehow slipped through.

const SERIAL_CHUNK_SIZE = 300;
const UPSERT_CHUNK_SIZE = 500;
// Postgres caps bind parameters at 65,535 per statement. Documents has ~9
// columns, so a single batch insert maxes out around ~7k rows. Match the
// upsert chunk size for symmetry and a safe margin (500 × 9 ≈ 4.5k params).
const DOC_INSERT_CHUNK_SIZE = UPSERT_CHUNK_SIZE;

/**
 * Parse `extracted_data.date` into a Postgres-friendly "YYYY-MM-DD".
 *
 * The import path always writes slash format via `formatDateToYYYYMMDD`, but
 * we accept dash too so that downstream consumers (single-row uploads, future
 * paths, hand-edited rows) keep working. Malformed input falls back to today
 * (local date via `formatDateToISO`, not UTC).
 */
function parseExtractedDataDate(raw: unknown): string {
  if (typeof raw === "string") {
    const m = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (m) {
      const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      const parsed = new Date(`${iso}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        const yy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, "0");
        const dd = String(parsed.getDate()).padStart(2, "0");
        if (`${yy}-${mm}-${dd}` === iso) return iso;
      }
    }
  }
  return formatDateToISO(new Date());
}

function computeInvoiceAmount(ed: Record<string, unknown>): number | null {
  return typeof ed.totalAmount === "number" ? Math.round(ed.totalAmount) : null;
}

function computeAllowanceAmount(ed: Record<string, unknown>): number | null {
  const net = typeof ed.amount === "number" ? ed.amount : undefined;
  const tax = typeof ed.taxAmount === "number" ? ed.taxAmount : undefined;
  if (net === undefined && tax === undefined) return null;
  return Math.round((net ?? 0) + (tax ?? 0));
}

/**
 * For each serial code in the input batch, find the existing row in
 * `invoices` / `allowances` (if any) and return its `document_id`. Used by
 * the commit helpers to decide which rows can reuse a document vs need a
 * fresh one. Rows we find are row-locked with `.for('update')` so
 * concurrent imports don't change them under us.
 *
 * Returned map values can be `null` — meaning "the row exists but its
 * document_id hasn't been backfilled". Treat that the same as "missing"
 * (needs a fresh document).
 */
async function fetchExistingDocLinks(
  tx: Tx,
  table: typeof invoicesTable | typeof allowancesTable,
  serialCol: typeof invoicesTable.invoice_serial_code | typeof allowancesTable.allowance_serial_code,
  clientId: string,
  serialCodes: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < serialCodes.length; i += SERIAL_CHUNK_SIZE) {
    const chunk = serialCodes.slice(i, i + SERIAL_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const rows = await tx
      .select({ serial: serialCol, document_id: table.document_id })
      .from(table)
      .where(and(eq(table.client_id, clientId), inArray(serialCol, chunk)))
      .for("update");
    for (const r of rows) {
      if (r.serial !== null) out.set(r.serial, r.document_id);
    }
  }
  return out;
}

/**
 * Atomically commit a batch of invoice rows along with their `documents`
 * parents. Either everything in the batch lands together or nothing does.
 * Returns the number of upserted invoice rows.
 *
 * See the file-level comment block above for the three buckets (reuse /
 * dedup-within-batch / fresh) each input row falls into.
 */
async function commitInvoiceRowsAtomically(
  rows: PreLinkInvoiceInsert[],
  clientId: string,
  userId: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    await assertCallerCanAccessClient(tx, userId, clientId);

    // `pg_advisory_xact_lock` is a Postgres co-operative lock keyed by a
    // 64-bit int. The `_xact_` flavour auto-releases at COMMIT/ROLLBACK so
    // it can't leak. We key it on (operation, client_id) so two imports for
    // the same client serialize — but different clients still run in
    // parallel. This closes the gap left by `.for('update')` in the
    // pre-fetch, which can only lock rows that already exist.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`import:invoice:${clientId}`}, 0))`,
    );

    const serialCodes = rows
      .map((r) => r.invoice_serial_code)
      .filter((c): c is string => Boolean(c));

    const existing = await fetchExistingDocLinks(
      tx,
      invoicesTable,
      invoicesTable.invoice_serial_code,
      clientId,
      serialCodes,
    );

    // Pick one row per "needs a new document" serial code to seed that
    // document's fields. Duplicate rows in the batch all end up pointing
    // at the single seed-row's document, avoiding orphan documents.
    const newDocIdBySerial = new Map<string, string>();
    const docSourceBySerial = new Map<string, PreLinkInvoiceInsert>();
    for (const r of rows) {
      const code = r.invoice_serial_code;
      if (!code) continue;
      if (existing.get(code)) continue;
      if (!docSourceBySerial.has(code)) docSourceBySerial.set(code, r);
    }

    if (docSourceBySerial.size > 0) {
      const seedEntries = [...docSourceBySerial.entries()];
      const docInserts = seedEntries.map(([, r]) => {
        const ed = (r.extracted_data ?? {}) as Record<string, unknown>;
        return {
          firm_id: r.firm_id!,
          client_id: r.client_id!,
          doc_type: "invoice" as const,
          type: "VAT" as const,
          ocr_status: "done" as const,
          doc_date: parseExtractedDataDate(ed.date),
          amount: computeInvoiceAmount(ed),
          // For batch imports `storage_path` is the shared Excel-batch file
          // (one path across all rows in the same import), not a per-invoice
          // PDF. We mirror it here to match `createInvoice` and Phase 6a
          // backfill — keeps documents.file_url uniformly populated across
          // every write path.
          file_url: r.storage_path ?? null,
          created_by: userId,
          status: "active" as const,
        };
      });
      // Chunk the insert: a single statement is capped by Postgres' 65,535
      // parameter limit. Without chunking, a batch of ~7,000+ unique new
      // serial codes would overflow and fail at runtime.
      for (let i = 0; i < docInserts.length; i += DOC_INSERT_CHUNK_SIZE) {
        const chunk = docInserts.slice(i, i + DOC_INSERT_CHUNK_SIZE);
        const inserted = await tx
          .insert(documentsTable)
          .values(chunk)
          .returning({ id: documentsTable.id });
        for (let j = 0; j < chunk.length; j++) {
          const [code] = seedEntries[i + j];
          newDocIdBySerial.set(code, inserted[j].id);
        }
      }
    }

    for (const row of rows) {
      if (row.document_id || !row.invoice_serial_code) continue;
      const reused = existing.get(row.invoice_serial_code);
      const fresh = newDocIdBySerial.get(row.invoice_serial_code);
      if (reused) row.document_id = reused;
      else if (fresh) row.document_id = fresh;
    }

    let total = 0;
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      const upserted = await tx
        .insert(invoicesTable)
        // Drizzle's TablesInsert and our supabase-generated TablesInsert
        // disagree on a few nullable columns; the runtime shape is identical.
        .values(chunk as unknown as typeof invoicesTable.$inferInsert[])
        // `excluded` is the standard Postgres alias inside ON CONFLICT for
        // "the row the INSERT was trying to write". So `excluded.<col>`
        // takes the incoming row's value — equivalent to Supabase JS's
        // `.upsert()` default (update every non-conflict column).
        .onConflictDoUpdate({
          target: [invoicesTable.client_id, invoicesTable.invoice_serial_code],
          set: {
            storage_path: sql`excluded.storage_path`,
            filename: sql`excluded.filename`,
            in_or_out: sql`excluded.in_or_out`,
            status: sql`excluded.status`,
            extracted_data: sql`excluded.extracted_data`,
            year_month: sql`excluded.year_month`,
            tax_filing_period_id: sql`excluded.tax_filing_period_id`,
            uploaded_by: sql`excluded.uploaded_by`,
            // COALESCE(a, b) returns `a` if non-null, else `b`. Here it
            // keeps the existing document_id whenever there is one, and
            // only takes the incoming value when the row had no prior FK.
            // Belt-and-braces — prevents a freshly-built document from
            // overwriting a stable FK that other tables may reference.
            document_id: sql`COALESCE(invoices.document_id, excluded.document_id)`,
          },
        })
        .returning({ id: invoicesTable.id });
      total += upserted.length;
    }
    return total;
  });
}

/**
 * Allowance mirror of `commitInvoiceRowsAtomically`. Returns the ids of the
 * upserted allowance rows so the caller can run `linkAllowancesToInvoices`
 * afterward.
 */
async function commitAllowanceRowsAtomically(
  rows: PreLinkAllowanceInsert[],
  clientId: string,
  userId: string,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    await assertCallerCanAccessClient(tx, userId, clientId);

    // See commitInvoiceRowsAtomically for the advisory-lock rationale.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`import:allowance:${clientId}`}, 0))`,
    );

    const serialCodes = rows
      .map((r) => r.allowance_serial_code)
      .filter((c): c is string => Boolean(c));

    const existing = await fetchExistingDocLinks(
      tx,
      allowancesTable,
      allowancesTable.allowance_serial_code,
      clientId,
      serialCodes,
    );

    // Pick one row per "needs a new document" serial code; duplicate rows
    // in the batch share that single document. See commitInvoiceRowsAtomically.
    const newDocIdBySerial = new Map<string, string>();
    const docSourceBySerial = new Map<string, PreLinkAllowanceInsert>();
    for (const r of rows) {
      const code = r.allowance_serial_code;
      if (!code) continue;
      if (existing.get(code)) continue;
      if (!docSourceBySerial.has(code)) docSourceBySerial.set(code, r);
    }

    if (docSourceBySerial.size > 0) {
      const seedEntries = [...docSourceBySerial.entries()];
      const docInserts = seedEntries.map(([, r]) => {
        const ed = (r.extracted_data ?? {}) as Record<string, unknown>;
        return {
          firm_id: r.firm_id!,
          client_id: r.client_id!,
          doc_type: "allowance" as const,
          type: "VAT" as const,
          ocr_status: "done" as const,
          doc_date: parseExtractedDataDate(ed.date),
          amount: computeAllowanceAmount(ed),
          // See commitInvoiceRowsAtomically for the parity rationale.
          file_url: r.storage_path ?? null,
          created_by: userId,
          status: "active" as const,
        };
      });
      // Chunk for Postgres' 65,535-parameter-per-statement cap. See
      // commitInvoiceRowsAtomically.
      for (let i = 0; i < docInserts.length; i += DOC_INSERT_CHUNK_SIZE) {
        const chunk = docInserts.slice(i, i + DOC_INSERT_CHUNK_SIZE);
        const inserted = await tx
          .insert(documentsTable)
          .values(chunk)
          .returning({ id: documentsTable.id });
        for (let j = 0; j < chunk.length; j++) {
          const [code] = seedEntries[i + j];
          newDocIdBySerial.set(code, inserted[j].id);
        }
      }
    }

    for (const row of rows) {
      if (row.document_id || !row.allowance_serial_code) continue;
      const reused = existing.get(row.allowance_serial_code);
      const fresh = newDocIdBySerial.get(row.allowance_serial_code);
      if (reused) row.document_id = reused;
      else if (fresh) row.document_id = fresh;
    }

    const allIds: string[] = [];
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      const upserted = await tx
        .insert(allowancesTable)
        .values(chunk as unknown as typeof allowancesTable.$inferInsert[])
        .onConflictDoUpdate({
          target: [allowancesTable.client_id, allowancesTable.allowance_serial_code],
          set: {
            storage_path: sql`excluded.storage_path`,
            filename: sql`excluded.filename`,
            in_or_out: sql`excluded.in_or_out`,
            status: sql`excluded.status`,
            extracted_data: sql`excluded.extracted_data`,
            tax_filing_period_id: sql`excluded.tax_filing_period_id`,
            original_invoice_serial_code: sql`excluded.original_invoice_serial_code`,
            uploaded_by: sql`excluded.uploaded_by`,
            // Same rationale as invoices: keep the existing FK stable on
            // re-imports. linkAllowancesToInvoices handles original_invoice_id
            // separately and is not in this transaction.
            document_id: sql`COALESCE(allowances.document_id, excluded.document_id)`,
          },
        })
        .returning({ id: allowancesTable.id });
      for (const r of upserted) allIds.push(r.id);
    }
    return allIds;
  });
}
