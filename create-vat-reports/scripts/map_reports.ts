import * as fs from "fs";
import * as path from "path";

// Helpers
function getPrefix(s: string) { return s.substring(0, 2); }
function getNum(s: string) { return parseInt(s.substring(2), 10); }

// Load data
const client = JSON.parse(fs.readFileSync("reports/temp/client.json", "utf8"));
const invoices = JSON.parse(fs.readFileSync("reports/temp/invoices.json", "utf8")).map((i: any) => i.extracted_data);
const allowancesRaw = JSON.parse(fs.readFileSync("reports/temp/allowances.json", "utf8"));
const ranges = JSON.parse(fs.readFileSync("reports/temp/ranges.json", "utf8"));

const config = {
  declarationType: "1",
  countyCity: "臺北市",
  declarationMethod: "2",
  declarerId: "A126032549",
  declarerName: "黃勝平",
  declarerPhoneAreaCode: "04",
  declarerPhone: "23758628",
  declarerPhoneExtension: "",
  agentRegistrationNumber: "104台財稅登字第4656號",
  consolidatedDeclarationCode: "0",
  fileNumber: "        ",
  midYearClosureTaxPayable: 0,
  midYearClosureTaxRefundable: 0,
  previousPeriodCarryForwardTax: 0
};

// 1. Generate TXT Data
const txtRows: any[] = [];
let seqNum = 1;

// Helper to determine format code for invoices
function getInvoiceFormatCode(inOrOut: string, type: string) {
  if (inOrOut === "進項") {
    if (type === "手開三聯式") return "21";
    if (type === "手開二聯式" || type.includes("二聯式")) return "22";
    if (type === "電子發票" || type === "三聯式收銀機") return "25";
    if (type === "海關代徵") return "28";
  } else {
    if (type === "手開三聯式") return "31";
    if (type === "手開二聯式" || type.includes("二聯式")) return "32";
    if (type === "電子發票" || type === "三聯式收銀機") return "35";
    if (type === "免用發票") return "36";
  }
  return inOrOut === "進項" ? "21" : "31"; // default
}

function getAllowanceFormatCode(inOrOut: string, type: string) {
  if (inOrOut === "進項") {
    if (type === "電子發票折讓" || type === "三聯式折讓") return "23";
    if (type === "二聯式折讓") return "24";
    if (type === "海關退還") return "29";
  } else {
    if (type === "電子發票折讓" || type === "三聯式折讓") return "33";
    if (type === "二聯式折讓") return "34";
  }
  return inOrOut === "進項" ? "23" : "33";
}

// Convert "YYYY/MM/DD" to ROC "YYYMM"
function toYYYMM(dateStr: string) {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length >= 2) {
    const year = parseInt(parts[0], 10) - 1911;
    const month = parts[1].padStart(2, "0");
    return `${year}${month}`;
  }
  return "";
}

// Process Invoices for TXT
for (const inv of invoices) {
  if (inv.inOrOut === "進項" && !inv.deductible) continue; // Skip non-deductible inputs for TXT

  let taxType = "1";
  if (inv.taxType === "零稅率") taxType = "2";
  else if (inv.taxType === "免稅") taxType = "3";
  else if (inv.taxType === "作廢") taxType = "F";

  const isOutput = inv.inOrOut === "銷項";

  txtRows.push({
    formatCode: getInvoiceFormatCode(inv.inOrOut, inv.invoiceType),
    taxPayerId: client.tax_payer_id,
    sequenceNumber: 0, // will assign later based on sort
    yearMonth: toYYYMM(inv.date),
    buyerTaxId: taxType === "F" ? "" : (inv.buyerTaxId || ""),
    sellerTaxId: inv.sellerTaxId || "",
    invoiceSerialCode: inv.invoiceSerialCode || "",
    salesAmount: taxType === "F" ? 0 : (inv.totalSales || 0),
    taxType: taxType,
    taxAmount: taxType === "F" ? 0 : (inv.tax || 0),
    deductionCode: isOutput ? " " : (inv.deductionCode || "1"),
    reserved: "",
    specialTaxRate: " ",
    aggregateMark: " ",
    customsMark: " "
  });
}

// Process Allowances for TXT
for (const allow of allowancesRaw) {
  const isOutput = allow.in_or_out === "out";
  const inOrOut = isOutput ? "銷項" : "進項";
  const ext = allow.extracted_data;
  
  const items = ext.items && ext.items.length > 0 ? ext.items : [{ amount: ext.amount, taxAmount: ext.taxAmount }];
  
  for (const item of items) {
    txtRows.push({
      formatCode: getAllowanceFormatCode(inOrOut, ext.allowanceType || "電子發票折讓"),
      taxPayerId: client.tax_payer_id,
      sequenceNumber: 0,
      yearMonth: toYYYMM(ext.date),
      buyerTaxId: ext.buyerTaxId || "",
      sellerTaxId: ext.sellerTaxId || "",
      invoiceSerialCode: allow.original_invoice_serial_code || ext.originalInvoiceSerialCode || "",
      salesAmount: item.amount || ext.amount || 0,
      taxType: "1", // 折讓通常算應稅處理 (spec rule)
      taxAmount: item.taxAmount || ext.taxAmount || 0,
      deductionCode: isOutput ? " " : (ext.deductionCode || "1"),
      reserved: "",
      specialTaxRate: " ",
      aggregateMark: " ",
      customsMark: " "
    });
  }
}

// Unused ranges
const outputInvoices = invoices.filter((i: any) => i.inOrOut === "銷項");
for (const range of ranges) {
  const formatCode = getInvoiceFormatCode("銷項", range.invoice_type);
  const prefix = getPrefix(range.start_number);
  const startNum = getNum(range.start_number);
  const endNum = getNum(range.end_number);

  const rangeInvoices = outputInvoices.filter((i: any) => 
    i.invoiceSerialCode && getPrefix(i.invoiceSerialCode) === prefix &&
    getNum(i.invoiceSerialCode) >= startNum && getNum(i.invoiceSerialCode) <= endNum
  );

  const maxUsed = rangeInvoices.length > 0 ? Math.max(...rangeInvoices.map((i: any) => getNum(i.invoiceSerialCode))) : startNum - 1;
  const nextUnused = maxUsed + 1;

  if (nextUnused <= endNum) {
    const isSingle = nextUnused === endNum;
    txtRows.push({
      formatCode: formatCode,
      taxPayerId: client.tax_payer_id,
      sequenceNumber: 0,
      yearMonth: "11411", // Period YYMM for ranges is usually the period end or start month
      buyerTaxId: isSingle ? "" : range.end_number.substring(2),
      sellerTaxId: client.tax_id,
      invoiceSerialCode: `${prefix}${nextUnused.toString().padStart(8, '0')}`,
      salesAmount: 0,
      taxType: "D",
      taxAmount: 0,
      deductionCode: " ",
      reserved: "",
      specialTaxRate: " ",
      aggregateMark: isSingle ? " " : "A",
      customsMark: " "
    });
  }
}

// Sort TXT rows
txtRows.sort((a, b) => {
  if (a.formatCode !== b.formatCode) return a.formatCode.localeCompare(b.formatCode);
  return a.invoiceSerialCode.localeCompare(b.invoiceSerialCode);
});

// Assign sequence number
txtRows.forEach((row, index) => {
  row.sequenceNumber = index + 1;
});

fs.writeFileSync("reports/temp/txt_data.json", JSON.stringify(txtRows, null, 2));


// 2. Generate TET_U Data
const fields: any[] = [];
for (let i = 0; i < 112; i++) fields.push({ value: 0, format: "S9", length: 12 }); // Init with default

function setField(idx: number, val: any, format: "X"|"C"|"9"|"S9", len: number) {
  fields[idx - 1] = { value: val, format, length: len };
}

// Calculate aggregations for TET_U
let outputCount = outputInvoices.filter((i: any) => i.taxType !== "作廢").length;
let outputTriplicateSales = 0, outputTriplicateTax = 0;
let outputElecSales = 0, outputElecTax = 0;
let outputDupSales = 0, outputDupTax = 0;
let outputExemptSales = 0, outputExemptTax = 0;
let outputReturnSales = 0, outputReturnTax = 0;
let outputZeroSalesWith = 0, outputZeroSalesWithout = 0, outputZeroReturn = 0;

let inputTriplicateSales = 0, inputTriplicateTax = 0;
let inputTriplicateFixed = 0, inputTriplicateFixedTax = 0;
let inputElecSales = 0, inputElecTax = 0;
let inputElecFixed = 0, inputElecFixedTax = 0;
let inputDupSales = 0, inputDupTax = 0;
let inputDupFixed = 0, inputDupFixedTax = 0;
let inputReturnSales = 0, inputReturnTax = 0;
let inputReturnFixed = 0, inputReturnFixedTax = 0;

let totalSalesWithoutBuyerTaxId = 0;

// Output
for (const inv of outputInvoices) {
  const sales = Math.round(inv.totalSales || 0);
  const tax = Math.round(inv.tax || 0);
  const type = inv.invoiceType || "";

  if (inv.taxType === "應稅") {
    if (!inv.buyerTaxId) totalSalesWithoutBuyerTaxId += sales;

    if (type === "手開三聯式") { outputTriplicateSales += sales; outputTriplicateTax += tax; }
    else if (type === "電子發票" || type === "三聯式收銀機") { outputElecSales += sales; outputElecTax += tax; }
    else if (type.includes("二聯式")) { outputDupSales += sales; outputDupTax += tax; }
  } else if (inv.taxType === "零稅率") {
    outputZeroSalesWithout += sales;
  } else if (inv.taxType === "免稅") {
    outputExemptSales += sales; outputExemptTax += tax;
  }
}

// B2C tax adjustment
const totalTaxWithoutBuyerId = Math.round(totalSalesWithoutBuyerTaxId / 1.05 * 0.05);
outputElecSales -= totalTaxWithoutBuyerId;
outputElecTax += totalTaxWithoutBuyerId;

// Input
const inputInvoices = invoices.filter((i: any) => i.inOrOut === "進項" && i.deductible);
for (const inv of inputInvoices) {
  const sales = Math.round(inv.totalSales || 0);
  const tax = Math.round(inv.tax || 0);
  const type = inv.invoiceType || "";
  const isFixed = inv.summary && (inv.summary.includes("固定資產") || inv.summary.includes("設備"));

  if (inv.taxType === "應稅") {
    if (type === "手開三聯式") {
      if (isFixed) { inputTriplicateFixed += sales; inputTriplicateFixedTax += tax; }
      else { inputTriplicateSales += sales; inputTriplicateTax += tax; }
    } else if (type === "電子發票" || type === "三聯式收銀機") {
      if (isFixed) { inputElecFixed += sales; inputElecFixedTax += tax; }
      else { inputElecSales += sales; inputElecTax += tax; }
    } else if (type.includes("二聯式")) {
      if (isFixed) { inputDupFixed += sales; inputDupFixedTax += tax; }
      else { inputDupSales += sales; inputDupTax += tax; }
    }
  }
}

// Allowances
for (const allow of allowancesRaw) {
  const ext = allow.extracted_data;
  const isOutput = allow.in_or_out === "out";
  const sales = Math.round(ext.amount || 0);
  const tax = Math.round(ext.taxAmount || 0);

  if (isOutput) {
    if (ext.taxType === "零稅率") outputZeroReturn += sales;
    else { outputReturnSales += sales; outputReturnTax += tax; }
  } else {
    const isFixed = ext.deductionCode === "2";
    if (isFixed) { inputReturnFixed += sales; inputReturnFixedTax += tax; }
    else { inputReturnSales += sales; inputReturnTax += tax; }
  }
}

// Fill Section 1
setField(1, "1", "X", 1);
setField(2, config.fileNumber, "X", 8);
setField(3, client.tax_id, "X", 8);
setField(4, "11411", "X", 5);
setField(5, "1", "X", 1);
setField(6, client.tax_payer_id, "X", 9);
setField(7, config.consolidatedDeclarationCode, "X", 1);
setField(8, outputCount, "9", 10);

// Fill Section 2
setField(9, outputTriplicateSales, "S9", 12);
setField(10, outputElecSales, "S9", 12);
setField(11, outputDupSales, "S9", 12);
setField(12, outputExemptSales, "S9", 12);
setField(13, outputReturnSales, "S9", 12);
const outTotalSales = outputTriplicateSales + outputElecSales + outputDupSales + outputExemptSales - outputReturnSales;
setField(14, outTotalSales, "S9", 12);
setField(15, outputTriplicateTax, "S9", 10);
setField(16, outputElecTax, "S9", 10);
setField(17, outputDupTax, "S9", 10);
setField(18, outputExemptTax, "S9", 10);
setField(19, outputReturnTax, "S9", 10);
const outTotalTax = outputTriplicateTax + outputElecTax + outputDupTax + outputExemptTax - outputReturnTax;
setField(20, outTotalTax, "S9", 10);

// Fill Section 3 & 4
setField(21, 0, "S9", 12);
setField(22, outputZeroSalesWith, "S9", 12);
setField(23, outputZeroSalesWithout, "S9", 12);
setField(24, outputZeroReturn, "S9", 12);
const zeroTotal = outputZeroSalesWith + outputZeroSalesWithout - outputZeroReturn;
setField(25, zeroTotal, "S9", 12);

// Fill Section 7 (47)
setField(47, outTotalSales + zeroTotal, "S9", 12);
setField(48, 0, "S9", 12);
setField(49, 0, "S9", 12);

// Fill Section 8
setField(50, inputTriplicateSales, "S9", 12);
setField(51, inputTriplicateFixed, "S9", 12);
setField(52, inputElecSales, "S9", 12);
setField(53, inputElecFixed, "S9", 12);
setField(54, inputDupSales, "S9", 12);
setField(55, inputDupFixed, "S9", 12);
setField(56, inputReturnSales, "S9", 12);
setField(57, inputReturnFixed, "S9", 12);
const inTotalSales = inputTriplicateSales + inputElecSales + inputDupSales - inputReturnSales;
const inTotalFixed = inputTriplicateFixed + inputElecFixed + inputDupFixed - inputReturnFixed;
setField(58, inTotalSales, "S9", 12);
setField(59, inTotalFixed, "S9", 12);

// Fill Section 9
setField(60, inputTriplicateTax, "S9", 10);
setField(61, inputTriplicateFixedTax, "S9", 10);
setField(62, inputElecTax, "S9", 10);
setField(63, inputElecFixedTax, "S9", 10);
setField(64, inputDupTax, "S9", 10);
setField(65, inputDupFixedTax, "S9", 10);
setField(66, inputReturnTax, "S9", 10);
setField(67, inputReturnFixedTax, "S9", 10);
const inTotalTax = inputTriplicateTax + inputElecTax + inputDupTax - inputReturnTax;
const inTotalFixedTax = inputTriplicateFixedTax + inputElecFixedTax + inputDupFixedTax - inputReturnFixedTax;
setField(68, inTotalTax, "S9", 10);
setField(69, inTotalFixedTax, "S9", 10);

// Fill Section 10
const totalInAllSales = invoices.filter((i: any) => i.inOrOut === "進項").reduce((sum: number, i: any) => sum + (i.totalSales || 0), 0);
setField(70, totalInAllSales, "S9", 12); // simple approximation
setField(71, inTotalFixed, "S9", 12); // simple approximation

// Fill Section 12 (82-95)
const field86 = outTotalTax;
const field90 = inTotalTax + inTotalFixedTax;
const field91 = Math.max(0, field86 - field90);
const field92 = Math.max(0, field90 - field86);
const field93 = Math.round(zeroTotal * 0.05) + inTotalFixedTax;
const field94 = Math.min(field92, field93);
const field95 = field92 - field94;

setField(82, outTotalTax, "S9", 10);
setField(83, 0, "S9", 10);
setField(84, 0, "S9", 10);
setField(85, 0, "S9", 10);
setField(86, 0, "S9", 10); // 401 should be 0 or empty, but spec says 0
setField(87, inTotalTax + inTotalFixedTax, "S9", 10);
setField(88, 0, "S9", 10);
setField(89, 0, "S9", 10);
setField(90, field90, "S9", 10);
setField(91, field91, "S9", 10);
setField(92, field92, "S9", 10);
setField(93, field93, "S9", 10);
setField(94, field94, "S9", 10);
setField(95, field95, "S9", 10);

// Fill Section 13
setField(96, config.declarationType, "X", 1);
setField(97, "A", "X", 1); // Taipei = A
setField(98, config.declarationMethod, "X", 1);
setField(99, config.declarerId, "X", 10);
setField(100, config.declarerName, "C", 12);
setField(101, config.declarerPhoneAreaCode, "X", 4);
setField(102, config.declarerPhone, "X", 11);
setField(103, config.declarerPhoneExtension, "X", 5);
setField(104, config.agentRegistrationNumber, "C", 50);

fs.writeFileSync("reports/temp/tet_u_data.json", JSON.stringify(fields, null, 2));
