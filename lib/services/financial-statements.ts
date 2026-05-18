import type {
  JournalEntry,
  JournalEntryLine,
} from "@/lib/domain/journal-entry";
import { accountLabel } from "@/lib/data/accounts";

export type AccountClass =
  | "asset"
  | "liability"
  | "equity"
  | "operating_revenue"
  | "cogs"
  | "opex"
  | "non_operating_income"
  | "non_operating_expense"
  | "income_tax";

export function classifyAccount(code: string): AccountClass {
  switch (code[0]) {
    case "1":
      return "asset";
    case "2":
      return "liability";
    case "3":
      return "equity";
    case "4":
      return "operating_revenue";
    case "5":
      return "cogs";
    case "6":
      return "opex";
    case "7":
      return "non_operating_income";
    case "8":
      return "non_operating_expense";
    case "9":
      return "income_tax";
    default:
      throw new Error(`Unknown account class for code "${code}"`);
  }
}

export interface ReportRow {
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface ReportSection {
  rows: ReportRow[];
  subtotal: number;
}

export interface IncomeStatement {
  fromDate: string;
  toDate: string;
  operatingRevenue: ReportSection;
  cogs: ReportSection;
  grossProfit: number;
  opex: ReportSection;
  operatingIncome: number;
  nonOperatingIncome: ReportSection;
  nonOperatingExpense: ReportSection;
  preTaxIncome: number;
  incomeTax: ReportSection;
  netIncome: number;
}

export interface BalanceSheet {
  asOfDate: string;
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  netIncomeToDate: number;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  imbalance: number;
}

interface ComputeIsInput {
  entries: readonly JournalEntry[];
  lines: readonly JournalEntryLine[];
  clientId: string;
  fromDate: string;
  toDate: string;
}

interface ComputeBsInput {
  entries: readonly JournalEntry[];
  lines: readonly JournalEntryLine[];
  clientId: string;
  asOfDate: string;
}

// Per-class "natural direction": each section's amounts come out positive when balances
// sit on their normal side, so any negative entry is itself a signal of something abnormal
// (e.g. a sales return reversing revenue).
function naturalAmount(cls: AccountClass, debit: number, credit: number): number {
  switch (cls) {
    case "operating_revenue":
    case "non_operating_income":
    case "liability":
    case "equity":
      return credit - debit;
    case "cogs":
    case "opex":
    case "non_operating_expense":
    case "income_tax":
    case "asset":
      return debit - credit;
  }
}

type AccountTotals = Map<string, { debit: number; credit: number }>;

function buildSection(totals: AccountTotals, cls: AccountClass): ReportSection {
  const rows: ReportRow[] = [];
  for (const [accountCode, { debit, credit }] of totals) {
    if (classifyAccount(accountCode) !== cls) continue;
    const amount = naturalAmount(cls, debit, credit);
    if (amount === 0) continue;
    rows.push({ accountCode, accountName: accountLabel(accountCode), amount });
  }
  rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  const subtotal = rows.reduce((acc, r) => acc + r.amount, 0);
  return { rows, subtotal };
}

// Both `posted` and `reversed` entries contribute to totals. `reversed` is a UI marker
// meaning "this entry has a matching reversal" — not "exclude from sums." The reversal
// entry is itself `posted` with flipped sides, so summing the pair cancels arithmetically
// to zero. This matches standard accounting practice where both entries stay on the books
// for audit. Only `draft` (never posted) is excluded.
function aggregateBookedLines(
  entries: readonly JournalEntry[],
  lines: readonly JournalEntryLine[],
  clientId: string,
  predicate: (entryDate: string) => boolean,
): AccountTotals {
  const bookedEntryIds = new Set<string>();
  for (const e of entries) {
    if (e.client_id !== clientId) continue;
    if (e.status === "draft") continue;
    if (!predicate(e.entry_date)) continue;
    bookedEntryIds.add(e.id);
  }

  const totals: AccountTotals = new Map();
  for (const l of lines) {
    if (!bookedEntryIds.has(l.journal_entry_id)) continue;
    const cur = totals.get(l.account_code);
    if (cur) {
      cur.debit += l.debit;
      cur.credit += l.credit;
    } else {
      totals.set(l.account_code, { debit: l.debit, credit: l.credit });
    }
  }
  return totals;
}

function buildIncomeStatementFromTotals(
  totals: AccountTotals,
  fromDate: string,
  toDate: string,
): IncomeStatement {
  const operatingRevenue = buildSection(totals, "operating_revenue");
  const cogs = buildSection(totals, "cogs");
  const opex = buildSection(totals, "opex");
  const nonOperatingIncome = buildSection(totals, "non_operating_income");
  const nonOperatingExpense = buildSection(totals, "non_operating_expense");
  const incomeTax = buildSection(totals, "income_tax");

  const grossProfit = operatingRevenue.subtotal - cogs.subtotal;
  const operatingIncome = grossProfit - opex.subtotal;
  const preTaxIncome =
    operatingIncome + nonOperatingIncome.subtotal - nonOperatingExpense.subtotal;
  const netIncome = preTaxIncome - incomeTax.subtotal;

  return {
    fromDate,
    toDate,
    operatingRevenue,
    cogs,
    grossProfit,
    opex,
    operatingIncome,
    nonOperatingIncome,
    nonOperatingExpense,
    preTaxIncome,
    incomeTax,
    netIncome,
  };
}

export function computeIncomeStatement(input: ComputeIsInput): IncomeStatement {
  const { entries, lines, clientId, fromDate, toDate } = input;
  const totals = aggregateBookedLines(
    entries,
    lines,
    clientId,
    (entryDate) => entryDate >= fromDate && entryDate <= toDate,
  );
  return buildIncomeStatementFromTotals(totals, fromDate, toDate);
}

// v1 has no Phase 11 closing entry, so 4/5/6/7/8/9 balances stay on the P&L accounts.
// BS must absorb the entire cumulative P&L into equity to balance; this synthetic 3440
// row is what carries it. The IS range used to compute it (see below) is intentionally
// all-time, not current-fiscal-year, because no prior-year P&L has rolled into retained
// earnings yet — if we only summed the current year, prior-year P&L would have nowhere
// to live and the BS would not balance.
export const SYNTHETIC_NET_INCOME_CODE = "3440";

// PHASE 11 MIGRATION: when closing entries become real, they will move each fiscal year's
// P&L into 3432 累積盈虧 (prior years' retained earnings) and 3440 本期損益 (current
// year). At that point, narrow the IS range below from "0001-01-01" to
// `${asOfDate.slice(0,4)}-01-01` so this synthetic 3440 only carries the current fiscal
// year — otherwise prior years would be double-counted (once in real 3432, once here).

export function computeBalanceSheet(input: ComputeBsInput): BalanceSheet {
  const { entries, lines, clientId, asOfDate } = input;

  const totals = aggregateBookedLines(
    entries,
    lines,
    clientId,
    (entryDate) => entryDate <= asOfDate,
  );

  // Hard-skip any stale 3440 balance so it doesn't double-count with the synthetic row.
  totals.delete(SYNTHETIC_NET_INCOME_CODE);

  const assets = buildSection(totals, "asset");
  const liabilities = buildSection(totals, "liability");
  const equityFace = buildSection(totals, "equity");

  const is = buildIncomeStatementFromTotals(totals, "0001-01-01", asOfDate);
  const netIncomeToDate = is.netIncome;

  const equityRows = [...equityFace.rows];
  if (netIncomeToDate !== 0) {
    equityRows.push({
      accountCode: SYNTHETIC_NET_INCOME_CODE,
      accountName: accountLabel(SYNTHETIC_NET_INCOME_CODE),
      amount: netIncomeToDate,
    });
  }
  const equity: ReportSection = {
    rows: equityRows,
    subtotal: equityFace.subtotal + netIncomeToDate,
  };

  const totalAssets = assets.subtotal;
  const totalLiabilitiesAndEquity = liabilities.subtotal + equity.subtotal;
  const imbalance = totalAssets - totalLiabilitiesAndEquity;

  return {
    asOfDate,
    assets,
    liabilities,
    equity,
    netIncomeToDate,
    totalAssets,
    totalLiabilitiesAndEquity,
    isBalanced: imbalance === 0,
    imbalance,
  };
}
