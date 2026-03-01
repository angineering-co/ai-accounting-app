import * as fs from "fs";

function formatX(value: string, length: number): string {
  if (value.length > length) {
    return value.substring(0, length);
  }
  return value.padEnd(length, " ");
}

function format9(value: string | number, length: number): string {
  const str = Math.abs(Math.round(Number(value))).toString();
  if (str.length > length) {
    return str.substring(str.length - length);
  }
  return str.padStart(length, "0");
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    console.error("Usage: tsx format_txt_from_json.ts <input_json> <output_txt>");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!Array.isArray(data)) {
    console.error("Input JSON must be an array of objects.");
    process.exit(1);
  }

  const rows: string[] = [];

  for (const row of data) {
    let line = "";
    line += formatX(row.formatCode || "", 2);
    line += formatX(row.taxPayerId || "", 9);
    line += format9(row.sequenceNumber || 0, 7);
    line += formatX(row.yearMonth || "", 5);
    line += formatX(row.buyerTaxId || "", 8);
    line += formatX(row.sellerTaxId || "", 8);
    line += formatX(row.invoiceSerialCode || "", 10);
    line += format9(row.salesAmount || 0, 12);
    line += formatX(row.taxType || "1", 1);
    line += format9(row.taxAmount || 0, 10);
    line += formatX(row.deductionCode || " ", 1);
    line += formatX(row.reserved || "", 5);
    line += formatX(row.specialTaxRate || " ", 1);
    line += formatX(row.aggregateMark || " ", 1);
    line += formatX(row.customsMark || " ", 1);

    if (line.length !== 81) {
      console.warn(`Warning: Row length is ${line.length}, expected 81. Row data:`, row);
    }
    rows.push(line);
  }

  fs.writeFileSync(outputPath, rows.join("\n"));
  console.log(`✅ Saved ${rows.length} rows to ${outputPath}`);
}

main().catch(console.error);
