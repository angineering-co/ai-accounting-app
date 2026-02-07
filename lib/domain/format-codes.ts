import { type AllowanceType, type InvoiceType, type InvoiceInOrOut } from "@/lib/domain/models";

/**
 * Derive the format code from in_or_out and allowanceType.
 * The format code is used in TXT report generation.
 */
export function getAllowanceFormatCode(
  inOrOut: InvoiceInOrOut,
  allowanceType: AllowanceType
): string {
  const isTriplicateFamily =
    allowanceType === '三聯式折讓' ||
    allowanceType === '電子發票折讓';

  if (inOrOut === "銷項") {
    return isTriplicateFamily ? "33" : "34";
  } else {
    return isTriplicateFamily ? "23" : "24";
  }
}

export function getInvoiceFormatCode(
  inOrOut: InvoiceInOrOut,
  invoiceType?: InvoiceType // TODO: this should be non-nullable once we do server-side validation
): string {
  const isInput = inOrOut === "進項";
  switch (invoiceType) {
    case "手開三聯式":
      return isInput ? "21" : "31";
    case "手開二聯式":
      return isInput ? "22" : "32";
    case "電子發票":
      return isInput ? "25" : "35";
    case "二聯式收銀機":
      return isInput ? "22" : "32";
    case "三聯式收銀機":
      return isInput ? "25" : "35";
    default:
      return isInput ? "21" : "35";
  }
}

/**
 * Check if a format code is an allowance format code.
 */
export function isAllowanceFormatCode(formatCode: string): boolean {
  return ["23", "24", "33", "34"].includes(formatCode);
}

/**
 * Reverse mapping for Excel imports.
 * Given a format code, returns the in_or_out and allowanceType.
 */
export const ALLOWANCE_FORMAT_CODE_MAP: Record<
  string,
  {
    inOrOut: "in" | "out";
    allowanceType: AllowanceType;
  }
> = {
  "23": { inOrOut: "in", allowanceType: "電子發票折讓" },
  "24": { inOrOut: "in", allowanceType: "二聯式折讓" },
  "33": { inOrOut: "out", allowanceType: "電子發票折讓" },
  "34": { inOrOut: "out", allowanceType: "二聯式折讓" },
};
