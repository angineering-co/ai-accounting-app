import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
