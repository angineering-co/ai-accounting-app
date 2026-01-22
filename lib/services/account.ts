import { ACCOUNT_LIST } from "@/lib/data/accounts";

/**
 * Convert account list to string format for Gemini prompt
 * Format: "5101 旅費", "5102 交際費", etc.
 */
export function getAccountListString(): string {
  return ACCOUNT_LIST.join("\n");
}
