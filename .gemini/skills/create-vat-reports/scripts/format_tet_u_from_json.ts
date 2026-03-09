import * as fs from "fs";
import iconv from "iconv-lite";

function formatX(value: string, length: number): string {
  if (value.length > length) {
    return value.substring(0, length);
  }
  return value.padEnd(length, " ");
}

function formatC(value: string, length: number): string {
  const getBig5ByteLength = (str: string): number => iconv.encode(str, "big5").length;
  const currentByteLength = getBig5ByteLength(value);

  if (currentByteLength > length) {
    let result = value;
    while (getBig5ByteLength(result) > length && result.length > 0) {
      result = result.substring(0, result.length - 1);
    }
    return result;
  }

  const spacesNeeded = length - currentByteLength;
  return value + " ".repeat(spacesNeeded);
}

function format9(value: number | string, length: number): string {
  const str = Math.abs(Math.round(Number(value))).toString();
  if (str.length > length) {
    return str.substring(str.length - length);
  }
  return str.padStart(length, "0");
}

function formatS9(value: number | string, length: number): string {
  const numValue = Number(value);
  const absValue = Math.abs(Math.round(numValue));
  const isNegative = numValue < 0;

  let paddedStr = absValue.toString().padStart(length, "0");
  if (paddedStr.length > length) {
    paddedStr = paddedStr.substring(paddedStr.length - length);
  }

  const lastDigit = parseInt(paddedStr[paddedStr.length - 1], 10);
  const positiveMap = ["{", "A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const negativeMap = ["}", "J", "K", "L", "M", "N", "O", "P", "Q", "R"];

  const encodedChar = isNegative ? negativeMap[lastDigit] : positiveMap[lastDigit];
  return paddedStr.substring(0, length - 1) + encodedChar;
}

type FieldDef = {
  value: string | number;
  format: "X" | "C" | "9" | "S9";
  length: number;
};

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    console.error("Usage: tsx format_tet_u_from_json.ts <input_json> <output_tet_u>");
    process.exit(1);
  }

  const data: FieldDef[] = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!Array.isArray(data)) {
    console.error("Input JSON must be an array of field definitions.");
    process.exit(1);
  }

  const formattedFields = data.map((field, index) => {
    const val = field.value !== undefined && field.value !== null ? field.value : "";
    switch (field.format) {
      case "X":
        return formatX(String(val), field.length);
      case "C":
        return formatC(String(val), field.length);
      case "9":
        return format9(val, field.length);
      case "S9":
        return formatS9(val, field.length);
      default:
        console.warn(`Unknown format ${field.format} for field ${index + 1}, using raw value.`);
        return String(val);
    }
  });

  const row = formattedFields.join("|");
  fs.writeFileSync(outputPath, row);
  console.log(`✅ Saved TET_U row with ${formattedFields.length} fields to ${outputPath}`);
}

main().catch(console.error);
