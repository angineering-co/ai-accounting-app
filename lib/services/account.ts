import { ACCOUNTS } from "@/lib/data/accounts";

export interface Account {
  code: string;
  name: string;
}

/**
 * Get account list from static constant
 */
export function getAccountList(): Account[] {
  return ACCOUNTS.map((accountStr) => {
    // accountStr format is "CODE NAME", e.g. "1111 現金"
    const spaceIndex = accountStr.indexOf(" ");
    if (spaceIndex === -1) {
      return { code: accountStr, name: "" };
    }
    const code = accountStr.substring(0, spaceIndex);
    const name = accountStr.substring(spaceIndex + 1);
    return { code, name };
  });
}

/**
 * Convert account list to string format for Gemini prompt
 * Format: "5101 旅費", "5102 交際費", etc.
 */
export function getAccountListString(): string {
  return ACCOUNTS.join("\n");
}
