import { extractAccountCode } from "@/lib/data/accounts";
import type { VoucherType } from "@/lib/domain/journal-entry";
import type { Allowance, Invoice } from "@/lib/domain/models";

// Fixed account codes referenced by §5.1 / §5.2.
// Source of truth: `lib/data/accounts.ts`.
export const ACCT_INPUT_TAX = "1144"; // 進項稅額
export const ACCT_OUTPUT_TAX = "2134"; // 銷項稅額
export const ACCT_REVENUE = "4101"; // 營業收入
export const ACCT_CASH = "1111"; // 現金
export const ACCT_BANK = "1112"; // 銀行存款

// §5.1 結算科目門檻：≤ 10,000 → 1111 現金；> 10,000 → 1112 銀行存款。
export const CASH_THRESHOLD = 10_000;

export function pickSettlementAccount(total: number): string {
  return total <= CASH_THRESHOLD ? ACCT_CASH : ACCT_BANK;
}

// A line in a *computed* (pre-insert) entry. Diverges from JournalEntryLine in
// two ways: (1) no journal_entry_id / id yet — those are assigned at insert
// time; (2) account_code may be null when the source document lacks an account
// (§5.2 特例：缺 extracted_data.account). The Phase 7 RPC must refuse to post
// a draft entry containing any null account_code (decision: 缺科目則不允許 post).
export interface ComputedEntryLine {
  account_code: string | null;
  debit: number;
  credit: number;
  description: string | null;
}

export interface ComputedEntry {
  voucher_type: VoucherType;
  entry_date: string; // YYYY-MM-DD
  description: string | null;
  lines: ComputedEntryLine[];
}

// ---------- helpers ----------

// Convert Gemini's YYYY/MM/DD into the YYYY-MM-DD format used by journal_entries.
// Falls back to the source row's created_at::date (UTC) when extracted date is
// missing, matching the Phase 6 backfill convention.
function resolveEntryDate(
  extractedDate: string | undefined,
  fallback: Date,
): string {
  if (extractedDate && extractedDate.length > 0) {
    return extractedDate.replace(/\//g, "-");
  }
  return fallback.toISOString().slice(0, 10);
}

function safeExtractAccountCode(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    return extractAccountCode(raw);
  } catch {
    // Defensive: if ACCOUNT_LIST format ever drifts, surface as "missing"
    // rather than crashing voucher generation for one bad row.
    return null;
  }
}

// ---------- invoice ----------

export function computeEntryFromInvoice(invoice: Invoice): ComputedEntry {
  const data = invoice.extracted_data ?? {};
  const totalSales = data.totalSales ?? 0;
  const tax = data.tax ?? 0;
  const totalAmount = data.totalAmount ?? totalSales + tax;
  const settlement = pickSettlementAccount(totalAmount);
  const entry_date = resolveEntryDate(data.date, invoice.created_at);

  if (invoice.in_or_out === "out") {
    // §5.2 銷項發票
    return {
      voucher_type: "收入",
      entry_date,
      description: buildInvoiceDescription(invoice, "銷項"),
      lines: [
        { account_code: settlement, debit: totalAmount, credit: 0, description: null },
        { account_code: ACCT_REVENUE, debit: 0, credit: totalSales, description: null },
        { account_code: ACCT_OUTPUT_TAX, debit: 0, credit: tax, description: null },
      ],
    };
  }

  // §5.2 進項發票
  const expenseAccount = safeExtractAccountCode(data.account);
  const deductible = data.deductible !== false; // default true when omitted

  if (!deductible) {
    // §5.3 範例 B：費用吸收稅額，只有 2 行
    return {
      voucher_type: "支出",
      entry_date,
      description: buildInvoiceDescription(invoice, "進項(不可扣抵)"),
      lines: [
        { account_code: expenseAccount, debit: totalAmount, credit: 0, description: null },
        { account_code: settlement, debit: 0, credit: totalAmount, description: null },
      ],
    };
  }

  // §5.3 範例 A：可扣抵 → 3 行
  return {
    voucher_type: "支出",
    entry_date,
    description: buildInvoiceDescription(invoice, "進項(可扣抵)"),
    lines: [
      { account_code: expenseAccount, debit: totalSales, credit: 0, description: null },
      { account_code: ACCT_INPUT_TAX, debit: tax, credit: 0, description: null },
      { account_code: settlement, debit: 0, credit: totalAmount, description: null },
    ],
  };
}

function buildInvoiceDescription(
  invoice: Invoice,
  kind: "銷項" | "進項(可扣抵)" | "進項(不可扣抵)",
): string {
  const data = invoice.extracted_data ?? {};
  const parts: string[] = [kind];
  if (data.sellerName) parts.push(data.sellerName);
  if (data.summary) parts.push(data.summary);
  if (data.invoiceSerialCode) parts.push(`(${data.invoiceSerialCode})`);
  return parts.join(" ");
}

// ---------- allowance ----------

// Allowance does not carry the original expense account; for 進項折讓 the caller
// (Phase 7 / staff) must resolve the expense account from the original invoice.
// This pure function emits null in that slot.
export function computeEntryFromAllowance(allowance: Allowance): ComputedEntry {
  const data = allowance.extracted_data ?? {};
  const amount = data.amount ?? 0;
  const taxAmount = data.taxAmount ?? 0;
  const total = amount + taxAmount;
  const settlement = pickSettlementAccount(total);
  const entry_date = resolveEntryDate(data.date, allowance.created_at);

  if (allowance.in_or_out === "in") {
    // §5.2 進項折讓
    return {
      voucher_type: "收入",
      entry_date,
      description: buildAllowanceDescription(allowance, "進項折讓"),
      lines: [
        { account_code: settlement, debit: total, credit: 0, description: null },
        { account_code: null, debit: 0, credit: amount, description: null },
        { account_code: ACCT_INPUT_TAX, debit: 0, credit: taxAmount, description: null },
      ],
    };
  }

  // §5.2 銷項折讓
  return {
    voucher_type: "支出",
    entry_date,
    description: buildAllowanceDescription(allowance, "銷項折讓"),
    lines: [
      { account_code: ACCT_REVENUE, debit: amount, credit: 0, description: null },
      { account_code: ACCT_OUTPUT_TAX, debit: taxAmount, credit: 0, description: null },
      { account_code: settlement, debit: 0, credit: total, description: null },
    ],
  };
}

function buildAllowanceDescription(
  allowance: Allowance,
  kind: "進項折讓" | "銷項折讓",
): string {
  const data = allowance.extracted_data ?? {};
  const parts: string[] = [kind];
  const counterpartyName = allowance.in_or_out === "in" ? data.sellerName : data.buyerName;
  if (counterpartyName) parts.push(counterpartyName);
  if (data.originalInvoiceSerialCode) parts.push(`原發票 ${data.originalInvoiceSerialCode}`);
  if (data.summary) parts.push(data.summary);
  return parts.join(" ");
}
