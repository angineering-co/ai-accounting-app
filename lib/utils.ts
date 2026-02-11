import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export function normalizeDateInput(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.replace(/-/g, "/");
  const parts = normalized.split("/");
  if (parts.length !== 3) return undefined;

  const [y, m, d] = parts.map((part) => part.trim());
  if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) {
    return undefined;
  }

  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return formatDateToYYYYMMDD(date);
}

export function parseNormalizedDate(dateValue: string | undefined): Date | undefined {
  if (!dateValue) return undefined;
  const normalized = normalizeDateInput(dateValue);
  if (!normalized) return undefined;

  const [year, month, day] = normalized.split("/").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Converts a date string (YYYY/MM/DD) to ROC YearMonth format (YYYMM)
 * e.g., "2024/09/01" -> "11309"
 */
export function toRocYearMonth(dateStr?: string): string {
  if (!dateStr) return "     ";
  // Support YYYY/MM/DD or YYYY-MM-DD
  const separator = dateStr.includes("/") ? "/" : "-";
  const parts = dateStr.split(separator);
  if (parts.length < 2) return "     ";
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  
  if (isNaN(year) || isNaN(month)) return "     ";
  
  const rocYear = year - 1911;
  return `${rocYear.toString().padStart(3, "0")}${month
    .toString()
    .padStart(2, "0")}`;
}

export function toGregorianDate(rocYearMonth: string): Date {
  if (!rocYearMonth || !/^\d{5}$/.test(rocYearMonth)) {
    throw new Error("Invalid YYYMM format: must be a 5-digit string (YYYMM).");
  }
  const rocYear = parseInt(rocYearMonth.substring(0, 3), 10);
  const month = parseInt(rocYearMonth.substring(3, 5), 10);
  return new Date(rocYear + 1911, month - 1, 1);
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
