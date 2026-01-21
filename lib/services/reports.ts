"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import {
  type ExtractedInvoiceData,
  type TetUConfig,
} from "@/lib/domain/models";
import { getInvoiceRanges } from "./invoice-range";
import { toRocYearMonth } from "@/lib/utils";
import { RocPeriod } from "@/lib/domain/roc-period";
import iconv from "iconv-lite";

function formatX(value: string, length: number): string {
  // Format X(n) - Alphanumeric field
  // Left-aligned, space-padded on right
  // Treated as character length in the example
  if (value.length > length) {
    return value.substring(0, length);
  }
  return value.padEnd(length, " ");
}

/**
 * Format C(n) - Character field (can contain Chinese/Full-width characters)
 *
 * WHY BIG5 FOR LENGTH CALCULATION:
 * In COBOL-based systems and Taiwanese government electronic filing specs (TET_U, .TXT),
 * the length 'n' for Type C variables is traditionally defined by a 1:2 byte ratio:
 * - Half-width (ASCII/Alphanumeric): 1 unit
 * - Full-width (Chinese/Punctuation): 2 units
 *
 * Using Big5 (CP950) to calculate the byte length is the most accurate way to
 * respect this legacy constraint because Big5 consistently maps Chinese characters
 * to exactly 2 bytes.
 *
 * If we used UTF-8 for calculation (where Chinese characters are 3 bytes), a field
 * like C(10) would only allow 3 Chinese characters before truncating, whereas
 * the specification expects 5. Thus, we calculate length via Big5 even if the
 * final file output is UTF-8.
 *
 * @param value The string to be formatted.
 * @param length The target byte length defined in the specification.
 * @returns The string truncated or space-padded to meet the byte length requirement.
 */
function formatC(value: string, length: number): string {
  // Helper to calculate length using Big5 (1:2 ratio logic)
  const getBig5ByteLength = (str: string): number =>
    iconv.encode(str, "big5").length;

  const currentByteLength = getBig5ByteLength(value);

  if (currentByteLength > length) {
    // Truncate the string character by character until the Big5 byte length fits
    let result = value;
    while (getBig5ByteLength(result) > length && result.length > 0) {
      result = result.substring(0, result.length - 1);
    }
    return result;
  }

  // Calculate required padding based on the difference in Big5 byte length
  const spacesNeeded = length - currentByteLength;
  return value + " ".repeat(spacesNeeded);
}

function format9(value: number, length: number): string {
  // Format 9(n) - Unsigned numeric field
  // Right-aligned, zero-padded on left
  const str = Math.abs(Math.round(value)).toString();
  if (str.length > length) {
    return str.substring(str.length - length);
  }
  return str.padStart(length, "0");
}

function formatS9(value: number, length: number): string {
  // Format S9(n) - Signed numeric field with COBOL encoding
  // Right-aligned, zero-padded on left, last digit encodes sign
  const absValue = Math.abs(Math.round(value));
  const isNegative = value < 0;

  // Pad with zeros
  let paddedStr = absValue.toString().padStart(length, "0");

  if (paddedStr.length > length) {
    paddedStr = paddedStr.substring(paddedStr.length - length);
  }

  // Get last digit
  const lastDigit = parseInt(paddedStr[paddedStr.length - 1], 10);

  // COBOL encoding maps
  const positiveMap = ["{", "A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const negativeMap = ["}", "J", "K", "L", "M", "N", "O", "P", "Q", "R"];

  // Replace last digit with encoded character
  const encodedChar = isNegative
    ? negativeMap[lastDigit]
    : positiveMap[lastDigit];
  return paddedStr.substring(0, length - 1) + encodedChar;
}

// Keeping original helpers for generateTxtReport to minimize side effects on that function
// although they could likely be replaced by the above if carefully checked.
function padNumber(num: number, length: number): string {
  return format9(num, length);
}

function padString(str: string, length: number): string {
  // Spec says spaces for padding strings. 
  // Assuming ASCII for Tax IDs etc in TXT report.
  const b = Buffer.alloc(length, ' ');
  b.write(str, 0, 'ascii');
  return b.toString('ascii');
}

function sortBySerialCodeNum(a: ExtractedInvoiceData, b: ExtractedInvoiceData) {
  // Compare the whole serial number alphanumerically including the prefix
  const aCode = a.invoiceSerialCode || '';
  const bCode = b.invoiceSerialCode || '';
  if (aCode < bCode) return -1;
  if (aCode > bCode) return 1;
  return 0;
}

/**
 * .TXT Report Generation (81-byte format)
 */
export async function generateTxtReport(clientId: string, serializedReportPeriod: string) {
  const supabase = await createSupabaseClient();
  
  const period = RocPeriod.fromYYYMM(serializedReportPeriod);

  // 1. Fetch Client
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (clientError || !client) throw new Error("Client not found");

  // 2. Fetch Invoices for the period (Confirmed status)
  const gregorianYear = period.gregorianYear;

  const prefix1 = `${gregorianYear}/${period.startMonth.toString().padStart(2, '0')}`;
  const prefix2 = `${gregorianYear}/${period.endMonth.toString().padStart(2, '0')}`;

  const { data: invoicesData, error: invoicesError } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", clientId)
    .eq("year_month", period.toString())
    .eq("status", "confirmed");
  
  if (invoicesError) throw new Error("Error fetching invoices");

  const invoices = (invoicesData || [])
    .map(inv => inv.extracted_data as ExtractedInvoiceData)
    .filter(data => data && data.date && (data.date.startsWith(prefix1) || data.date.startsWith(prefix2)));

  if (invoicesData && invoicesData.length !== invoices.length) {
    throw new Error(
      `Invoice data mismatch for period ${period.toString()}. The database has ${
        invoicesData.length
      } invoices for this period, but only ${
        invoices.length
      } have a matching date in their extracted data. Please review the invoices.`
    );
  }

  // 3. Fetch Invoice Ranges
  const ranges = await getInvoiceRanges(clientId, period.toString());

  // 4. Generate Rows
  const rows: string[] = [];
  let currentRowNum = 1;

  // Split into input and output
  const inputInvoices = invoices
    .filter((i) => i.inOrOut === "進項")
    .filter((i) => i.deductible === true) // Only deductible input invoices are included
    .sort(sortBySerialCodeNum);
  const outputInvoices = invoices
    .filter((i) => i.inOrOut === "銷項") // All output invoices are included regardless of deductible
    .sort(sortBySerialCodeNum);

  // Sort input invoices
  inputInvoices.forEach(inv => {
    rows.push(generateTxtRow(inv, currentRowNum++, client.tax_payer_id));
  });

  // Group output by type for range calculation
  const groupedOutput = new Map<string, ExtractedInvoiceData[]>();
  outputInvoices.forEach(inv => {
    const type = inv.invoiceType || 'Unknown';
    if (!groupedOutput.has(type)) groupedOutput.set(type, []);
    groupedOutput.get(type)!.push(inv);
  });

  const allTypes = new Set([...groupedOutput.keys(), ...ranges.map(r => r.invoice_type)]);

  allTypes.forEach(type => {
    const typeInvoices = groupedOutput.get(type) || [];
    typeInvoices.sort(sortBySerialCodeNum);

    typeInvoices.forEach(inv => {
      rows.push(generateTxtRow(inv, currentRowNum++, client.tax_payer_id));
    });

    // Unused ranges
    const relevantRanges = ranges.filter(r => r.invoice_type === type);
    relevantRanges.forEach(range => {
      const getPrefix = (s: string) => s.substring(0, 2);
      const getNum = (s: string) => parseInt(s.substring(2), 10);

      const rangePrefix = getPrefix(range.start_number);
      const rangeStartNum = getNum(range.start_number);
      const rangeEndNum = getNum(range.end_number);

      const invoicesInRange = typeInvoices.filter(inv => {
        const s = inv.invoiceSerialCode;
        if (!s || s.length !== 10) return false;
        return getPrefix(s) === rangePrefix && getNum(s) >= rangeStartNum && getNum(s) <= rangeEndNum;
      });

      let nextUnusedNum = rangeStartNum;
      if (invoicesInRange.length > 0) {
        const maxNum = Math.max(...invoicesInRange.map(inv => getNum(inv.invoiceSerialCode || '')));
        nextUnusedNum = maxNum + 1;
      }

      if (nextUnusedNum <= rangeEndNum) {
        const unusedStart = `${rangePrefix}${padNumber(nextUnusedNum, 8)}`;
        const unusedEnd = range.end_number;

        // Pseudo-invoice for unused
        const item: ExtractedInvoiceData = {
          inOrOut: "銷項",
          invoiceType:
            range.invoice_type as ExtractedInvoiceData["invoiceType"],
          date: `${gregorianYear}/${period.startMonth.toString().padStart(2, '0')}/01`,
          buyerTaxId: unusedEnd.substring(2),
          sellerTaxId: client.tax_id,
          invoiceSerialCode: unusedStart,
          taxType: "彙加",
          totalSales: 0,
          tax: 0,
          totalAmount: 0,
        };
        rows.push(
          generateTxtRow(item, currentRowNum++, client.tax_payer_id)
        );
      }
    });
  });

  return rows.join('\n');
}

const COUNTY_CITY_CODES: Record<string, string> = {
  '臺北市': 'A', '臺中市': 'B', '基隆市': 'C', '臺南市': 'D', '高雄市': 'E',
  '新北市': 'F', '宜蘭縣': 'G', '桃園市': 'H', '嘉義市': 'I', '新竹縣': 'J',
  '苗栗縣': 'K', '南投縣': 'M', '彰化縣': 'N', '新竹市': 'O', '雲林縣': 'P',
  '嘉義縣': 'Q', '屏東縣': 'T', '花蓮縣': 'U', '臺東縣': 'V', '金門縣': 'W',
  '澎湖縣': 'X', '連江縣': 'Z'
};

function generateTxtRow(inv: ExtractedInvoiceData, rowNum: number, taxPayerId: string): string {
  let row = '';

  // Bytes 1-2: Format Code
  const type = inv.invoiceType || '';
  if (inv.inOrOut === '進項') {
    if (type.includes('三聯') && type.includes('收銀機')) row += '25';
    else if (type.includes('三聯')) row += '21';
    else if (type.includes('二聯')) row += '22';
    else if (type.includes('電子發票')) row += '25';
    else row += '21';
  } else {
    if (type.includes('三聯') && type.includes('收銀機')) row += '35';
    else if (type.includes('三聯')) row += '31';
    else if (type.includes('二聯')) row += '32';
    else if (type.includes('電子發票')) row += '35';
    else row += '35';
  }

  // Bytes 3-11: Tax Payer ID
  row += padString(taxPayerId, 9);

  // Bytes 12-18: Sequence Number
  row += padNumber(rowNum, 7);

  // Bytes 19-23: YearMonth
  row += toRocYearMonth(inv.date);

  // Bytes 24-31: Buyer Tax ID (or End Number for unused)
  if (inv.taxType === '作廢') row += padString('', 8);
  else row += padString(inv.buyerTaxId || '', 8);

  // Bytes 32-39: Seller Tax ID
  row += padString(inv.sellerTaxId || '', 8);

  // Bytes 40-49: Serial Number
  row += padString(inv.invoiceSerialCode || '', 10);

  // Bytes 50-61: Sales Amount
  if (inv.taxType === '作廢') row += padNumber(0, 12);
  else row += padNumber(inv.totalSales || 0, 12);

  // Byte 62: Tax Type
  switch (inv.taxType) {
    case '應稅': row += '1'; break;
    case '零稅率': row += '2'; break;
    case '免稅': row += '3'; break;
    case '作廢': row += 'F'; break;
    case '彙加': row += 'D'; break;
    default: row += '1';
  }

  // Bytes 63-72: Tax Amount
  if (inv.taxType === '作廢') row += padNumber(0, 10);
  else row += padNumber(inv.tax || 0, 10);

  // Byte 73: Deduction Code
  if (inv.inOrOut === '銷項') row += ' ';
  else row += '1'; // Default to進貨及費用可抵扣

  // Byte 74-78: Reserved
  row += '     ';

  // Byte 79: Special Tax Rate
  row += ' ';

  // Byte 80: Aggregate Mark
  row += inv.taxType === '彙加' ? 'A' : ' ';

  // Byte 81: Customs Mark
  row += ' ';

  return row;
}

/**
 * .TET_U Report Generation (112-field pipe-separated)
 */
export async function generateTetUReport(clientId: string, serializedReportPeriod: string, config: TetUConfig) {
  const supabase = await createSupabaseClient();
  
  const period = RocPeriod.fromYYYMM(serializedReportPeriod);

  // 1. Fetch Client
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (clientError || !client) throw new Error("Client not found");

  // 2. Fetch Invoices
  const gregorianYear = period.gregorianYear;

  const prefix1 = `${gregorianYear}/${period.startMonth.toString().padStart(2, '0')}`;
  const prefix2 = `${gregorianYear}/${period.endMonth.toString().padStart(2, '0')}`;

  const { data: invoicesData } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", clientId)
    .eq("year_month", period.toString())
    .eq("status", "confirmed");

  const invoices = (invoicesData || [])
    .map(inv => inv.extracted_data as ExtractedInvoiceData)
    .filter(data => data && data.date && (data.date.startsWith(prefix1) || data.date.startsWith(prefix2)));

  if (invoicesData && invoicesData.length !== invoices.length) {
    throw new Error(
      `Invoice data mismatch for period ${period.toString()}. The database has ${
        invoicesData.length
      } invoices for this period, but only ${
        invoices.length
      } have a matching date in their extracted data. Please review the invoices.`
    );
  }

  // Aggregate invoice data
  const aggregated = aggregateInvoiceData(invoices);

  // Field construction
  const fields: string[] = [];
  
  // Format helpers
  // Use formatX for alphanumeric, formatC for chinese/mixed text
  // The example uses formatX for most fields except name/registration which use formatC

  // Helper to get declaration code
  const getDeclarationCode = (cfg: TetUConfig) => {
    if (cfg.declarationCode) {
      return cfg.declarationCode;
    }
    return cfg.consolidatedDeclarationCode === '1' ? '5' : '1';
  };

  const getCountyCityCode = (name: string) => {
    return COUNTY_CITY_CODES[name] || 'A';
  };
  
  // Section 1: 檔案基本資訊
  fields.push(formatX('1', 1));                                   // Field 1: 資料別 (always '1' for 401)
  fields.push(formatX(config.fileNumber || '        ', 8));       // Field 2: 檔案編號
  fields.push(formatX(client.tax_id, 8));                         // Field 3: 統一編號
  fields.push(formatX(period.toEndYYYMM(), 5));                   // Field 4: 所屬年月
  fields.push(formatX(getDeclarationCode(config), 1));            // Field 5: 申報代號
  fields.push(formatX(config.taxPayerId, 9));                     // Field 6: 稅籍編號
  fields.push(formatX(config.consolidatedDeclarationCode, 1));    // Field 7: 總繳代號
  fields.push(format9(aggregated.invoiceCount, 10));              // Field 8: 使用發票份數
  
  // Section 2: 一般稅額銷項金額及稅額 (401/403 適用)
  fields.push(formatS9(aggregated.output.triplicate.sales, 12));                // Field 9: 三聯式發票(銷售額)
  fields.push(formatS9(aggregated.output.cashRegisterAndElectronic.sales, 12)); // Field 10: 收銀機發票(三聯式)及電子發票(銷售額)
  fields.push(formatS9(aggregated.output.duplicateCashRegister.sales, 12));     // Field 11: 二聯式收銀機(二聯式)發票(銷售額)
  fields.push(formatS9(aggregated.output.exemptFromIssuance.sales, 12));        // Field 12: 免用發票(銷售額)
  fields.push(formatS9(aggregated.output.returnsAndAllowances.sales, 12));      // Field 13: 退回及折讓(銷售額)
  fields.push(formatS9(aggregated.output.totalSales, 12));                      // Field 14: 合計(銷售額)
  fields.push(formatS9(aggregated.output.triplicate.tax, 10));                  // Field 15: 三聯式發票(稅額)
  fields.push(formatS9(aggregated.output.cashRegisterAndElectronic.tax, 10));   // Field 16: 收銀機發票(三聯式)及電子發票(稅額)
  fields.push(formatS9(aggregated.output.duplicateCashRegister.tax, 10));       // Field 17: 二聯式收銀機(二聯式)發票(稅額)
  fields.push(formatS9(aggregated.output.exemptFromIssuance.tax, 10));          // Field 18: 免用發票(稅額)
  fields.push(formatS9(aggregated.output.returnsAndAllowances.tax, 10));        // Field 19: 退回及折讓(稅額)
  fields.push(formatS9(aggregated.output.totalTax, 10));                        // Field 20: 合計(稅額)
  
  // Section 3: 銷項免開立發票銷售額 (401/403 適用)
  fields.push(formatS9(aggregated.output.salesWithoutInvoice, 12));             // Field 21: 免稅出口區等免開立統一發票銷售額
  
  // Section 4: 零稅率銷售額
  fields.push(formatS9(aggregated.output.zeroTax.withDocuments, 12));          // Field 22: 非經海關出口應附證明文件者
  fields.push(formatS9(aggregated.output.zeroTax.withoutDocuments, 12));       // Field 23: 經海關出口免附證明文件者
  fields.push(formatS9(aggregated.output.zeroTax.returnsAndAllowances, 12));   // Field 24: 退回及折讓
  fields.push(formatS9(aggregated.output.zeroTax.total, 12));                  // Field 25: 合計
  
  // Section 5: 免稅銷售額 (403 適用), fill with zeros for 401
  for (let i = 0; i < 6; i++) {
    fields.push(formatS9(0, 12));  // Fields 26-31
  }
  
  // Section 6: 特種稅額銷項 (403/404 適用), fill with zeros for 401
  fields.push(formatS9(0, 12));  // Field 32
  fields.push(formatS9(0, 10));  // Field 33
  fields.push(formatS9(0, 12));  // Field 34
  fields.push(formatS9(0, 10));  // Field 35
  fields.push(formatS9(0, 12));  // Field 36
  fields.push(formatS9(0, 10));  // Field 37
  fields.push(formatS9(0, 12));  // Field 38
  fields.push(formatS9(0, 10));  // Field 39
  fields.push(formatS9(0, 12));  // Field 40
  fields.push(formatS9(0, 10));  // Field 41
  fields.push(formatS9(0, 12));  // Field 42
  fields.push(formatS9(0, 12));  // Field 43
  fields.push(formatS9(0, 10));  // Field 44
  fields.push(formatS9(0, 12));  // Field 45
  fields.push(formatS9(0, 10));  // Field 46
  
  // Section 7: 銷售額分析
  fields.push(formatS9(aggregated.output.totalSales + aggregated.output.zeroTax.total, 12)); // Field 47: 銷售額總計
  fields.push(formatS9(aggregated.output.landSales, 12));                   // Field 48: 土地
  fields.push(formatS9(aggregated.output.fixedAssetSales, 12));             // Field 49: 其他固定資產
  
  // Section 8: 應比例計算得扣抵進項金額 (401/403 適用)
  fields.push(formatS9(aggregated.input.triplicate.purchasesAndExpenses, 12));      // Field 50: 統一發票扣抵聯-進貨及費用
  fields.push(formatS9(aggregated.input.triplicate.fixedAssets, 12));               // Field 51: 統一發票扣抵聯-固定資產
  fields.push(formatS9(aggregated.input.cashRegisterAndElectronic.purchasesAndExpenses, 12)); // Field 52: 三聯式收銀機發票扣抵聯及電子發票-進貨及費用
  fields.push(formatS9(aggregated.input.cashRegisterAndElectronic.fixedAssets, 12)); // Field 53: 三聯式收銀機發票扣抵聯及電子發票-固定資產
  fields.push(formatS9(aggregated.input.otherCertificates.purchasesAndExpenses, 12)); // Field 54: 載有稅額之其他憑證-進貨及費用
  fields.push(formatS9(aggregated.input.otherCertificates.fixedAssets, 12));        // Field 55: 載有稅額之其他憑證-固定資產
  fields.push(formatS9(aggregated.input.returnsAndAllowances.purchasesAndExpenses, 12)); // Field 56: 退出及折讓-進貨及費用
  fields.push(formatS9(aggregated.input.returnsAndAllowances.fixedAssets, 12));     // Field 57: 退出及折讓-固定資產
  fields.push(formatS9(aggregated.input.totalPurchasesAndExpenses, 12));            // Field 58: 合計-進貨及費用
  fields.push(formatS9(aggregated.input.totalFixedAssets, 12));                     // Field 59: 合計-固定資產
  
  // Section 9: 應比例計算得扣抵進項稅額 (401/403 適用)
  fields.push(formatS9(aggregated.input.triplicate.purchasesAndExpensesTax, 10));   // Field 60: 統一發票扣抵聯-進貨及費用(稅額)
  fields.push(formatS9(aggregated.input.triplicate.fixedAssetsTax, 10));            // Field 61: 統一發票扣抵聯-固定資產(稅額)
  fields.push(formatS9(aggregated.input.cashRegisterAndElectronic.purchasesAndExpensesTax, 10)); // Field 62: 三聯式收銀機發票扣抵聯及電子發票-進貨及費用(稅額)
  fields.push(formatS9(aggregated.input.cashRegisterAndElectronic.fixedAssetsTax, 10)); // Field 63: 三聯式收銀機發票扣抵聯及電子發票-固定資產(稅額)
  fields.push(formatS9(aggregated.input.otherCertificates.purchasesAndExpensesTax, 10)); // Field 64: 載有稅額之其他憑證-進貨及費用(稅額)
  fields.push(formatS9(aggregated.input.otherCertificates.fixedAssetsTax, 10));     // Field 65: 載有稅額之其他憑證-固定資產(稅額)
  fields.push(formatS9(aggregated.input.returnsAndAllowances.purchasesAndExpensesTax, 10)); // Field 66: 退出及折讓-進貨及費用(稅額)
  fields.push(formatS9(aggregated.input.returnsAndAllowances.fixedAssetsTax, 10));  // Field 67: 退出及折讓-固定資產(稅額)
  fields.push(formatS9(aggregated.input.totalPurchasesAndExpensesTax, 10));         // Field 68: 合計-進貨及費用(稅額)
  fields.push(formatS9(aggregated.input.totalFixedAssetsTax, 10));                  // Field 69: 合計-固定資產(稅額)
  
  // Section 10: 進項總金額
  fields.push(formatS9(aggregated.input.totalPurchasesAndExpensesAll, 12));         // Field 70: 進貨及費用進項總金額
  fields.push(formatS9(aggregated.input.totalFixedAssetsAll, 12));                  // Field 71: 固定資產進項總金額
  
  // Section 11: 兼營營業人查填及進口/國外勞務 (403 適用), fill with zeros for 401
  fields.push(format9(0, 3));    // Field 72: 不得扣抵比例
  fields.push(formatS9(0, 10));  // Field 73: 兼營營業人依98年修正前第19條第1項後段計算不得扣抵之進項稅額
  fields.push(formatS9(0, 12));  // Field 74: 進口貨物專案申請沖退稅額
  fields.push(formatS9(0, 12));  // Field 75: 購買國外勞務給付金額
  fields.push(formatS9(0, 12));  // Field 76: 進口應稅貨物金額
  fields.push(formatS9(0, 12));  // Field 77: 進口應稅貨物專案申請沖退稅額
  fields.push(formatS9(0, 10));  // Field 78: 海關代徵營業稅
  fields.push(formatS9(0, 10));  // Field 79: 固定資產海關代徵營業稅
  fields.push(formatS9(0, 10));  // Field 80: 進口貨物專案申請沖退稅額(稅額)
  fields.push(formatS9(0, 10));  // Field 81: 購買國外勞務應納稅額

  // Section 12: 稅額計算 (Fields 82-95)
  const isConsolidatedSeparate = config.consolidatedDeclarationCode === '2';
  const field82 = isConsolidatedSeparate ? 0 : aggregated.output.totalTax;  // Field 20
  const field83 = 0;  // Field 81 (for 401 always zero)
  const field84 = 0;  // Field 46 (for 401 always zero)
  const field85 = isConsolidatedSeparate ? 0 : config.midYearClosureTaxPayable;
  const field86 = field82 + field83 + field84 + field85;
  
  const field87 = isConsolidatedSeparate ? 0 : (aggregated.input.totalPurchasesAndExpensesTax + aggregated.input.totalFixedAssetsTax);
  const field88 = isConsolidatedSeparate ? 0 : config.previousPeriodCarryForwardTax;
  const field89 = isConsolidatedSeparate ? 0 : config.midYearClosureTaxRefundable;
  const field90 = field87 + field88 + field89;
  
  const field91 = isConsolidatedSeparate ? 0 : Math.max(0, field86 - field90);
  const field92 = isConsolidatedSeparate ? 0 : Math.max(0, field90 - field86);
  const field93 = isConsolidatedSeparate ? 0 : (Math.round(aggregated.output.zeroTax.total * 0.05) + aggregated.input.totalFixedAssetsTax);
  const field94 = isConsolidatedSeparate ? 0 : Math.min(field92, field93);
  const field95 = isConsolidatedSeparate ? 0 : (field92 - field94);
  
  fields.push(formatS9(field82, 10));  // Field 82: 本期(月)銷項稅額合計
  fields.push(formatS9(field83, 10));  // Field 83: 購買國外勞務應納稅額
  fields.push(formatS9(field84, 10));  // Field 84: 特種稅額計算應納稅額
  fields.push(formatS9(field85, 10));  // Field 85: 中途歇業年底調整補徵應繳稅額
  fields.push(formatS9(fields[0] === '1' ? 0 : field86, 10));  // Field 86: 401 不包含小計(1+3+4+5)欄位，403 才有
  fields.push(formatS9(field87, 10));  // Field 87: 得扣抵進項稅額合計
  fields.push(formatS9(field88, 10));  // Field 88: 上期(月)累積留抵稅額
  fields.push(formatS9(field89, 10));  // Field 89: 中途歇業或年底調整應退稅額
  fields.push(formatS9(field90, 10));  // Field 90: 小計(7+8+9)
  fields.push(formatS9(field91, 10));  // Field 91: 本期(月)應實繳稅額
  fields.push(formatS9(field92, 10));  // Field 92: 本期(月)申報留抵稅額
  fields.push(formatS9(field93, 10));  // Field 93: 得退稅限額合計
  fields.push(formatS9(field94, 10));  // Field 94: 本期(月)應退稅額
  fields.push(formatS9(field95, 10));  // Field 95: 本期(月)累積留抵稅額
  
  // Section 13: 申報人及代理人資訊
  fields.push(formatX(config.declarationType, 1));                        // Field 96: 申報種類
  fields.push(formatX(getCountyCityCode(config.countyCity), 1));          // Field 97: 縣市別
  fields.push(formatX(config.declarationMethod, 1));                      // Field 98: 自行或委託辦理申報註記
  fields.push(formatX(config.declarerId, 10));                            // Field 99: 申報人身分證統一編號
  fields.push(formatC(config.declarerName, 12));                          // Field 100: 申報人姓名
  fields.push(formatX(config.declarerPhoneAreaCode, 4));                  // Field 101: 申報人電話區域碼
  fields.push(formatX(config.declarerPhone, 11));                         // Field 102: 申報人電話
  fields.push(formatX(config.declarerPhoneExtension, 5));                 // Field 103: 申報人電話分機
  fields.push(formatC(config.agentRegistrationNumber || '', 50));         // Field 104: 代理申報人登錄(文)字號
  
  // Section 14: 購買國外勞務項目 (404 適用), fill with zeros for 401
  fields.push(formatS9(0, 12));  // Field 105: 外國保險業再保費收入給付金額
  fields.push(formatS9(0, 12));  // Field 106: 第11條各業專屬本業勞務給付金額
  fields.push(formatS9(0, 12));  // Field 107: 其他給付金額(含銀行/保險本業收入)
  fields.push(formatS9(0, 10));  // Field 108: 外國保險業再保費收入稅額
  fields.push(formatS9(0, 10));  // Field 109: 第11條各業專屬本業勞務稅額
  fields.push(formatS9(0, 10));  // Field 110: 其他稅額(含銀行/保險本業收入)
  
  // Section 15: 銀行業、保險業經營本業收入 (5%) (403/404 適用), fill with zeros for 401
  fields.push(formatS9(0, 12));  // Field 111: 銷售額
  fields.push(formatS9(0, 10));  // Field 112: 稅額
  
  return fields.join('|');
}

function aggregateInvoiceData(invoices: ExtractedInvoiceData[]) {
  const result = {
    invoiceCount: 0,
    output: {
      triplicate: { sales: 0, tax: 0 },
      cashRegisterAndElectronic: { sales: 0, tax: 0 },
      duplicateCashRegister: { sales: 0, tax: 0 },
      exemptFromIssuance: { sales: 0, tax: 0 },
      returnsAndAllowances: { sales: 0, tax: 0 },
      totalSales: 0,
      totalTax: 0,
      salesWithoutInvoice: 0,
      zeroTax: {
        withDocuments: 0,
        withoutDocuments: 0,
        returnsAndAllowances: 0,
        total: 0
      },
      landSales: 0,
      fixedAssetSales: 0
    },
    input: {
      triplicate: { purchasesAndExpenses: 0, fixedAssets: 0, purchasesAndExpensesTax: 0, fixedAssetsTax: 0 },
      cashRegisterAndElectronic: { purchasesAndExpenses: 0, fixedAssets: 0, purchasesAndExpensesTax: 0, fixedAssetsTax: 0 },
      otherCertificates: { purchasesAndExpenses: 0, fixedAssets: 0, purchasesAndExpensesTax: 0, fixedAssetsTax: 0 },
      returnsAndAllowances: { purchasesAndExpenses: 0, fixedAssets: 0, purchasesAndExpensesTax: 0, fixedAssetsTax: 0 },
      totalPurchasesAndExpenses: 0,
      totalFixedAssets: 0,
      totalPurchasesAndExpensesTax: 0,
      totalFixedAssetsTax: 0,
      totalPurchasesAndExpensesAll: 0,
      totalFixedAssetsAll: 0
    }
  };
  
  // Count invoices (only output invoices, excluding voided)
  result.invoiceCount = invoices.filter(inv => inv.inOrOut === '銷項' && inv.taxType !== '作廢').length;
 
  let totalSalesWithoutBuyerTaxId = 0;

  // Process output (銷項) invoices
  const outputInvoices = invoices.filter(inv => inv.inOrOut === '銷項');
  outputInvoices.forEach(inv => {
    const isReturn = false; // TODO: 退回及折讓要再彙總計算
    const sales = Math.round(inv.totalSales || 0);
    const tax = Math.round(inv.tax || 0);
    
    // Safety check for invoiceType
    const invoiceType = inv.invoiceType || '';

    if (inv.taxType === '應稅') {
      if (isReturn) {
        result.output.returnsAndAllowances.sales += sales;
        result.output.returnsAndAllowances.tax += tax;
      } else {
        // B2C 二聯發票 (無買受人統一編號) 稅額要再彙總計算
        if (!inv.buyerTaxId) {
          totalSalesWithoutBuyerTaxId += sales;
        }

        // Categorize by invoice type
        if (invoiceType.includes('手開三聯式') || (invoiceType.includes('三聯式') && !invoiceType.includes('收銀機'))) {
          result.output.triplicate.sales += sales;
          result.output.triplicate.tax += tax;
        } else if (invoiceType.includes('電子發票') || (invoiceType.includes('三聯式') && invoiceType.includes('收銀機'))) {
          result.output.cashRegisterAndElectronic.sales += sales;
          result.output.cashRegisterAndElectronic.tax += tax;
        } else if (invoiceType.includes('二聯式')) {
          result.output.duplicateCashRegister.sales += sales;
          result.output.duplicateCashRegister.tax += tax;
        } else {
          // Note: this should not happen. 
          throw new Error(`Unsupported invoice type: ${invoiceType}`);
        }
      }
    } else if (inv.taxType === '零稅率') {
      // TODO: 零稅率銷售額
      if (isReturn) {
        result.output.zeroTax.returnsAndAllowances += sales;
      } else {
        // TODO: We need to identify the type of zero tax sales
        result.output.zeroTax.withoutDocuments += sales;
      }
    } else if (inv.taxType === '免稅') {
      // 免稅
      result.output.exemptFromIssuance.sales += sales;
      result.output.exemptFromIssuance.tax += tax;
    } else if (inv.taxType === '作廢') {
      console.log(`skipping voided invoice: ${inv.invoiceSerialCode}`);
    } else {
      throw new Error(`Unsupported tax type: ${inv.taxType}`);
    }
    
    // Check for land or fixed asset sales (simplified check)
    if (inv.summary && inv.summary.includes('土地')) {
      result.output.landSales += sales;
    } else if (inv.summary && (inv.summary.includes('固定資產') || inv.summary.includes('設備'))) {
      result.output.fixedAssetSales += sales;
    }
  });
 
  // 銷項統一發票之買受人為非營業人者，其發票所載金額應含營業稅額，於填寫申報書時，再彙總依下列公 式計算應申報之銷售額與稅額。 
  // 銷項稅額 = 當期開立統一發票總額 ÷（１+ 徵收率）× 徵收率（四捨五入）
  const totalTaxWithoutBuyerId = Math.round(totalSalesWithoutBuyerTaxId / 1.05 * 0.05);
  result.output.cashRegisterAndElectronic.sales -= totalTaxWithoutBuyerId;
  result.output.cashRegisterAndElectronic.tax += totalTaxWithoutBuyerId;

  // Calculate totals for output
  result.output.totalSales = result.output.triplicate.sales + 
                             result.output.cashRegisterAndElectronic.sales + 
                             result.output.duplicateCashRegister.sales + 
                             result.output.exemptFromIssuance.sales - 
                             result.output.returnsAndAllowances.sales;
  result.output.totalTax = result.output.triplicate.tax + 
                           result.output.cashRegisterAndElectronic.tax + 
                           result.output.duplicateCashRegister.tax + 
                           result.output.exemptFromIssuance.tax - 
                           result.output.returnsAndAllowances.tax;
  result.output.zeroTax.total = result.output.zeroTax.withDocuments + 
                                result.output.zeroTax.withoutDocuments - 
                                result.output.zeroTax.returnsAndAllowances;
  
  // Process input (進項) invoices
  // Only deductible input invoices are included
  const inputInvoices = invoices.filter(inv => inv.inOrOut === '進項').filter(inv => inv.deductible);
  inputInvoices.forEach(inv => {
    const isReturn = false; // TODO: 退回及折讓要再彙總計算
    const isFixedAsset = inv.summary && (inv.summary.includes('固定資產') || inv.summary.includes('設備'))
    const sales = Math.round(inv.totalSales || 0);
    const tax = Math.round(inv.tax || 0);
    
    // Safety check for invoiceType
    const invoiceType = inv.invoiceType || '';
    
    if (inv.taxType === '應稅') {
      if (isReturn) {
        if (isFixedAsset) {
          result.input.returnsAndAllowances.fixedAssets += sales;
          result.input.returnsAndAllowances.fixedAssetsTax += tax;
        } else {
          result.input.returnsAndAllowances.purchasesAndExpenses += sales;
          result.input.returnsAndAllowances.purchasesAndExpensesTax += tax;
        }
      } else {
        // Categorize by invoice type
        if (invoiceType.includes('手開三聯式') || (invoiceType.includes('三聯式') && !invoiceType.includes('收銀機'))) {
          if (isFixedAsset) {
            result.input.triplicate.fixedAssets += sales;
            result.input.triplicate.fixedAssetsTax += tax;
          } else {
            result.input.triplicate.purchasesAndExpenses += sales;
            result.input.triplicate.purchasesAndExpensesTax += tax;
          }
        } else if (invoiceType.includes('電子發票') || (invoiceType.includes('三聯式') && invoiceType.includes('收銀機'))) {
          if (isFixedAsset) {
            result.input.cashRegisterAndElectronic.fixedAssets += sales;
            result.input.cashRegisterAndElectronic.fixedAssetsTax += tax;
          } else {
            result.input.cashRegisterAndElectronic.purchasesAndExpenses += sales;
            result.input.cashRegisterAndElectronic.purchasesAndExpensesTax += tax;
          }
        } else if (invoiceType.includes('二聯式')) {
          if (isFixedAsset) {
            result.input.otherCertificates.fixedAssets += sales;
            result.input.otherCertificates.fixedAssetsTax += tax;
          } else {
            result.input.otherCertificates.purchasesAndExpenses += sales;
            result.input.otherCertificates.purchasesAndExpensesTax += tax;
          }
        }
      }
      
      // Add to total (all input amounts including non-deductible)
      if (isFixedAsset) {
        result.input.totalFixedAssetsAll += sales;
      } else {
        result.input.totalPurchasesAndExpensesAll += sales;
      }
    }
  });
  
  // Calculate totals for input
  result.input.totalPurchasesAndExpenses = result.input.triplicate.purchasesAndExpenses + 
                                           result.input.cashRegisterAndElectronic.purchasesAndExpenses + 
                                           result.input.otherCertificates.purchasesAndExpenses - 
                                           result.input.returnsAndAllowances.purchasesAndExpenses;
  result.input.totalFixedAssets = result.input.triplicate.fixedAssets + 
                                  result.input.cashRegisterAndElectronic.fixedAssets + 
                                  result.input.otherCertificates.fixedAssets - 
                                  result.input.returnsAndAllowances.fixedAssets;
  result.input.totalPurchasesAndExpensesTax = result.input.triplicate.purchasesAndExpensesTax + 
                                              result.input.cashRegisterAndElectronic.purchasesAndExpensesTax + 
                                              result.input.otherCertificates.purchasesAndExpensesTax - 
                                              result.input.returnsAndAllowances.purchasesAndExpensesTax;
  result.input.totalFixedAssetsTax = result.input.triplicate.fixedAssetsTax + 
                                     result.input.cashRegisterAndElectronic.fixedAssetsTax + 
                                     result.input.otherCertificates.fixedAssetsTax - 
                                     result.input.returnsAndAllowances.fixedAssetsTax;
  
  return result;
}

