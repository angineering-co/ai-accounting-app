import { ACCOUNTS, ACCOUNT_LIST } from "@/lib/data/accounts";

export interface Account {
  code: string;
  name: string;
}

/**
 * Get account list from static constant
 */
export function getAccountList(): Account[] {
  return Object.entries(ACCOUNTS)
    .sort(([codeA], [codeB]) => codeA.localeCompare(codeB))
    .map(([code, { name }]) => ({
      code,
      name,
    }));
}

/**
 * Convert account list to string format for Gemini prompt
 * Format: "5101 旅費", "5102 交際費", etc.
 */
export function getAccountListString(): string {
  return ACCOUNT_LIST.join("\n");
}
