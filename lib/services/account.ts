import { readFileSync } from "fs";
import { join } from "path";

export interface Account {
  code: string;
  name: string;
}

let cachedAccounts: Account[] | null = null;

/**
 * Get account list from account-lookup.csv file
 * Caches the parsed data in memory to avoid re-reading the file on every request
 */
export function getAccountList(): Account[] {
  if (cachedAccounts) {
    return cachedAccounts;
  }

  try {
    const csvPath = join(process.cwd(), "data", "account-lookup.csv");
    const csvContent = readFileSync(csvPath, "utf-8");
    const lines = csvContent.split("\n").filter((line) => line.trim());

    // Skip header row (科目編號,科目名稱)
    const dataLines = lines.slice(1);

    cachedAccounts = dataLines
      .map((line) => {
        const [code, name] = line.split(",").map((s) => s.trim());
        return { code, name };
      })
      .filter((account) => account.code && account.name);

    return cachedAccounts;
  } catch (error) {
    console.error("Error reading account-lookup.csv:", error);
    throw new Error("Failed to load account list from data/account-lookup.csv");
  }
}

/**
 * Convert account list to string format for Gemini prompt
 * Format: "5101 旅費", "5102 交際費", etc.
 */
export function getAccountListString(): string {
  const accounts = getAccountList();
  return accounts
    .map((account) => `${account.code} ${account.name}`)
    .join("\n");
}
