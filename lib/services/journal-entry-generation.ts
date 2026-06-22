import { extractAccountCode } from "@/lib/data/accounts";
import type { VoucherType } from "@/lib/domain/journal-entry";
import type { Allowance, Invoice } from "@/lib/domain/models";
import { splitEmbeddedTax } from "@/lib/domain/vat";
import { isBusinessBuyer } from "@/lib/domain/tax-id";

// Fixed account codes referenced by §5.1 / §5.2.
// Source of truth: `lib/data/accounts.ts`.
export const ACCT_INPUT_TAX = "1144"; // 進項稅額
export const ACCT_OUTPUT_TAX = "2134"; // 銷項稅額
export const ACCT_REVENUE = "4101"; // 營業收入
export const ACCT_OTHER_INCOME = "7044"; // 其他收入
export const ACCT_CASH = "1111"; // 現金
export const ACCT_BANK = "1112"; // 銀行存款

// §5.1 結算科目門檻：≤ 10,000 → 1111 現金；> 10,000 → 1112 銀行存款。
export const CASH_THRESHOLD = 10_000;

export function pickSettlementAccount(total: number): string {
  return total <= CASH_THRESHOLD ? ACCT_CASH : ACCT_BANK;
}

// A line in a *computed* (pre-insert) entry. Diverges from JournalEntryLine in
// one way: no journal_entry_id / id yet — those are assigned at insert time.
// account_code is always present: invoices reach this function only after staff
// confirm (which requires `extracted_data.account`), and allowances inherit the
// account from the original posted entry (§5.2, Decision #13).
export interface ComputedEntryLine {
  account_code: string;
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

function requireAccountCode(raw: string | undefined | null, context: string): string {
  if (!raw) {
    throw new Error(
      `${context}: missing extracted_data.account (precondition: invoice must be confirmed with account selected)`,
    );
  }
  return extractAccountCode(raw);
}

// ---------- invoice ----------

export function computeEntryFromInvoice(invoice: Invoice): ComputedEntry {
  const data = invoice.extracted_data ?? {};

  // v1 taxType policy (§5.2.1):
  //   應稅                — normal path (3-line for 進項可扣抵 / 銷項; 2-line for 進項不可扣抵)
  //   零稅率 / 免稅 進項   — route through non-deductible (2-line) path; tax=0 so there's
  //                        nothing to break out. Structurally identical to NON_VAT 收據.
  //                        reports.ts correctly filters these out of the deductible input section.
  //   零稅率 / 免稅 銷項   — throw. reports.ts has open TODOs for output classification;
  //                        producing a journal entry would silently disagree with the eventual
  //                        VAT filing. Coordinated OCR/review/reports/entries change needed.
  //   作廢                — throw. Voided business event; caller must filter before reaching here.
  //   彙加                — throw. TET_U synthetic row type, not a real invoice.
  if (data.taxType === "作廢" || data.taxType === "彙加") {
    throw new Error(
      `computeEntryFromInvoice(${invoice.id}): taxType='${data.taxType}' must not reach entry generation ` +
        `(${data.taxType === "作廢" ? "voided invoices don't post entries" : "彙加 is a TET_U synthetic row, not a real invoice"}).`,
    );
  }
  if (
    invoice.in_or_out === "out" &&
    (data.taxType === "零稅率" || data.taxType === "免稅")
  ) {
    throw new Error(
      `computeEntryFromInvoice(${invoice.id}): taxType='${data.taxType}' on 銷項 not supported in v1. ` +
        `Output zero-rated / tax-exempt require coordinated support across OCR / review / reports / entries.`,
    );
  }

  const totalSales = data.totalSales ?? 0;
  const tax = data.tax ?? 0;
  const totalAmount = data.totalAmount ?? totalSales + tax;
  const settlement = pickSettlementAccount(totalAmount);
  const entry_date = resolveEntryDate(data.date, invoice.created_at);

  if (invoice.in_or_out === "out") {
    // §5.2 銷項發票 (taxType === '應稅' guaranteed by check above)
    const { revenue, outputTax } = resolveOutputTax(invoice, totalSales, tax, totalAmount);
    const lines: ComputedEntryLine[] = [
      { account_code: settlement, debit: totalAmount, credit: 0, description: null },
      { account_code: ACCT_REVENUE, debit: 0, credit: revenue, description: null },
    ];
    // A tax-inclusive B2C sale below ~NT$11 rounds to 0 embedded tax — there's no
    // 銷項稅額 to book, so omit the line (a 0/0 line breaks debit_credit_xor).
    if (outputTax > 0) {
      lines.push({ account_code: ACCT_OUTPUT_TAX, debit: 0, credit: outputTax, description: null });
    }
    return {
      voucher_type: "收入",
      entry_date,
      description: buildInvoiceDescription(invoice, "銷項"),
      lines,
    };
  }

  // §5.2 進項發票
  const expenseAccount = requireAccountCode(
    data.account,
    `computeEntryFromInvoice(${invoice.id})`,
  );
  // 零稅率 / 免稅 進項 force the non-deductible (2-line) shape regardless of
  // what `deductible` says — tax=0 makes the 3-line form meaningless and the
  // 2-line shape matches how a NON_VAT 收據 would post.
  const zeroOrExempt = data.taxType === "零稅率" || data.taxType === "免稅";
  const deductible = !zeroOrExempt && data.deductible !== false;

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

  // §5.3 範例 A：可扣抵 → 3 行 (2 行 when the 憑證 is tax-inclusive with no separable 稅額)
  const { expense, inputTax } = resolveInputTax(invoice, totalSales, tax, totalAmount);
  const lines: ComputedEntryLine[] = [
    { account_code: expenseAccount, debit: expense, credit: 0, description: null },
  ];
  if (inputTax > 0) {
    lines.push({ account_code: ACCT_INPUT_TAX, debit: inputTax, credit: 0, description: null });
  }
  lines.push({ account_code: settlement, debit: 0, credit: totalAmount, description: null });
  return {
    voucher_type: "支出",
    entry_date,
    description: buildInvoiceDescription(invoice, "進項(可扣抵)"),
    lines,
  };
}

// 銷項稅額 resolution. An 應稅 銷項 normally carries a separate 稅額, but a B2C
// invoice (買受人為非營業人，無統編) is *tax-inclusive*: OCR extracts tax=0 and the
// printed total already embeds the 5%. Mirror reports.ts (embeddedOutputTax) and
// back it out so 4101 is net and 2134 carries the tax.
function resolveOutputTax(
  invoice: Invoice,
  totalSales: number,
  tax: number,
  totalAmount: number,
): { revenue: number; outputTax: number } {
  if (tax > 0) {
    return { revenue: totalSales, outputTax: tax };
  }
  const data = invoice.extracted_data ?? {};
  if (!isBusinessBuyer(data.buyerTaxId)) {
    const { net, tax: embedded } = splitEmbeddedTax(totalAmount);
    return { revenue: net, outputTax: embedded };
  }
  // 應稅 銷項 to a business buyer (valid 統編) with tax=0 is bad data (a B2B total
  // is net+tax, not tax-inclusive) — fail loud so the row is recorded per-document
  // rather than booked wrong or crashing the batch insert with a 0/0 稅額 line.
  throw new Error(
    `computeEntryFromInvoice(${invoice.id}): 應稅 銷項 to a business buyer but tax=0 ` +
      `(B2B totals are not tax-inclusive; check 稅額 extraction).`,
  );
}

// 進項稅額 resolution for deductible inputs. Precondition: only reached on the
// deductible path — the caller returns the 2-line non-deductible shape (tax merged
// into the expense, no 1144 line) before getting here, so deductible is guaranteed.
// A 二聯式收銀機 / 火車高鐵票根 等憑證 is tax-inclusive (OCR tax=0); mirror reports.ts
// (embeddedInputTax) and back the 5% out so the expense is net and 1144 carries the
// tax. A non-二聯式 deductible 應稅 input with tax=0 is bad data → fail loud.
function resolveInputTax(
  invoice: Invoice,
  totalSales: number,
  tax: number,
  totalAmount: number,
): { expense: number; inputTax: number } {
  if (tax > 0) {
    return { expense: totalSales, inputTax: tax };
  }
  const data = invoice.extracted_data ?? {};
  if (data.invoiceType?.includes("二聯式")) {
    const { net, tax: embedded } = splitEmbeddedTax(totalAmount);
    return { expense: net, inputTax: embedded };
  }
  throw new Error(
    `computeEntryFromInvoice(${invoice.id}): 應稅 可扣抵進項 with tax=0 on a non-二聯式 ` +
      `invoice (only tax-inclusive 二聯式憑證 may omit 稅額; check 進項稅額 extraction).`,
  );
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

// Per Decision #13 (§5.2), allowance entries are derived by **mirroring the
// original posted entry's structure** rather than from a fixed template. The
// caller (Phase 7 RPC) looks up the original invoice's posted entry and passes
// its computed shape here; the function flips debit↔credit and substitutes the
// allowance's amount/taxAmount.
//
// Why mirror instead of template:
//   1. Non-deductible originals merge tax into the expense line, so the offset
//      must also be a single line (template can't recover the tax breakdown).
//   2. If staff edited the original (e.g. changed `6113` → `5404`), the allowance
//      should reverse the actual posted account, not re-derive from the invoice.
//   3. Settlement account mirrors the original's channel (bank → bank refund),
//      not §5.1's threshold rerun on the smaller allowance amount.
//
// If `original_invoice_id` doesn't resolve to a posted/draft entry (e.g. the
// original predates this client or was never uploaded), the caller asks the
// staff to pick an account and constructs a synthetic `originalEntry` to pass
// here. That path lives in Phase 7, not this pure function.
export function computeEntryFromAllowance(
  allowance: Allowance,
  originalEntry: ComputedEntry,
): ComputedEntry {
  const data = allowance.extracted_data ?? {};
  const amount = data.amount ?? 0;
  const taxAmount = data.taxAmount ?? 0;
  const total = amount + taxAmount;
  const entry_date = resolveEntryDate(data.date, allowance.created_at);

  if (allowance.in_or_out === "in") {
    const roles = extractInputInvoiceRoles(originalEntry);
    if (roles.hasSeparateTaxLine) {
      // Mirror deductible input: Dr 結算 / Cr 費用 / Cr 進項稅額. The original was a
      // taxable, deductible purchase (it carries a separate 進項稅額 line), so a
      // mirroring allowance must carry tax too. taxAmount=0 here is almost
      // certainly bad data (e.g. OCR dropped 折讓稅額); fail loud so staff fix it,
      // rather than booking a silently-wrong entry (a 0/0 tax line would also
      // break the debit_credit_xor CHECK).
      if (taxAmount <= 0) {
        throw new Error(
          `computeEntryFromAllowance: allowance ${allowance.id} mirrors a deductible ` +
            `(taxed) original but has taxAmount=0; refusing to generate. Check 折讓稅額.`,
        );
      }
      return {
        voucher_type: "收入",
        entry_date,
        description: buildAllowanceDescription(allowance, "進項折讓"),
        lines: [
          { account_code: roles.settlementAccount, debit: total, credit: 0, description: null },
          { account_code: roles.expenseAccount, debit: 0, credit: amount, description: null },
          { account_code: ACCT_INPUT_TAX, debit: 0, credit: taxAmount, description: null },
        ],
      };
    }
    // Mirror non-deductible input: 2 lines, tax merged into expense reversal.
    return {
      voucher_type: "收入",
      entry_date,
      description: buildAllowanceDescription(allowance, "進項折讓"),
      lines: [
        { account_code: roles.settlementAccount, debit: total, credit: 0, description: null },
        { account_code: roles.expenseAccount, debit: 0, credit: total, description: null },
      ],
    };
  }

  // 銷項折讓: mirror Dr 4101 / Dr 2134 / Cr 結算. The original was a taxable 銷項
  // (銷項 entries are only created for 應稅 — 零稅率 / 免稅 produce none), so a
  // mirroring allowance must carry tax too. taxAmount=0 here is almost certainly
  // bad data; fail loud (symmetric with the deductible-input branch above) rather
  // than book a silently-wrong entry (a 0/0 tax line would also break
  // debit_credit_xor). A genuinely zero-tax 銷項折讓 (免稅 / 零稅率 sales) never
  // reaches the mirror — its original has no entry, so it routes through
  // computeDefaultEntryFromAllowance instead.
  const roles = extractOutputInvoiceRoles(originalEntry);
  if (taxAmount <= 0) {
    throw new Error(
      `computeEntryFromAllowance: allowance ${allowance.id} mirrors a taxed 銷項 ` +
        `original but has taxAmount=0; refusing to generate. Check 折讓稅額.`,
    );
  }
  return {
    voucher_type: "支出",
    entry_date,
    description: buildAllowanceDescription(allowance, "銷項折讓"),
    lines: [
      { account_code: roles.revenueAccount, debit: amount, credit: 0, description: null },
      { account_code: ACCT_OUTPUT_TAX, debit: taxAmount, credit: 0, description: null },
      { account_code: roles.settlementAccount, debit: 0, credit: total, description: null },
    ],
  };
}

interface InputInvoiceRoles {
  expenseAccount: string;
  settlementAccount: string;
  hasSeparateTaxLine: boolean;
}

function extractInputInvoiceRoles(originalEntry: ComputedEntry): InputInvoiceRoles {
  const drLines = originalEntry.lines.filter((l) => l.debit > 0);
  const crLines = originalEntry.lines.filter((l) => l.credit > 0);
  if (crLines.length !== 1) {
    throw new Error(
      `original input invoice entry must have exactly 1 Cr (settlement) line, got ${crLines.length}`,
    );
  }
  const hasSeparateTaxLine = drLines.some((l) => l.account_code === ACCT_INPUT_TAX);
  // editEntry (Phase 9) lets staff split one expense across multiple accounts
  // (e.g. 60% 銷管 / 40% 製造). A `.find` here would silently pick the first and
  // produce an unbalanced allowance mirror, so require EXACTLY one non-tax Dr
  // line and fail loud otherwise — the caller then routes to the §5.2.2
  // manual-account fallback instead of writing a broken折讓.
  const expenseLines = drLines.filter((l) => l.account_code !== ACCT_INPUT_TAX);
  if (expenseLines.length !== 1) {
    throw new Error(
      `original input invoice entry must have exactly 1 expense (Dr) line, got ` +
        `${expenseLines.length} — a staff edit likely split the expense across ` +
        `multiple accounts; the allowance cannot mirror it automatically.`,
    );
  }
  return {
    expenseAccount: expenseLines[0].account_code,
    settlementAccount: crLines[0].account_code,
    hasSeparateTaxLine,
  };
}

interface OutputInvoiceRoles {
  revenueAccount: string;
  settlementAccount: string;
}

function extractOutputInvoiceRoles(originalEntry: ComputedEntry): OutputInvoiceRoles {
  const drLines = originalEntry.lines.filter((l) => l.debit > 0);
  const crLines = originalEntry.lines.filter((l) => l.credit > 0);
  if (drLines.length !== 1) {
    throw new Error(
      `original output invoice entry must have exactly 1 Dr (settlement) line, got ${drLines.length}`,
    );
  }
  // See matching note in extractInputInvoiceRoles: a staff edit can split revenue
  // across accounts, so require EXACTLY one non-tax Cr line rather than `.find`-ing
  // the first — multi-revenue fails loud into the §5.2.2 manual-account fallback.
  const revenueLines = crLines.filter((l) => l.account_code !== ACCT_OUTPUT_TAX);
  if (revenueLines.length !== 1) {
    throw new Error(
      `original output invoice entry must have exactly 1 revenue (Cr) line, got ` +
        `${revenueLines.length} — a staff edit likely split revenue across ` +
        `multiple accounts; the allowance cannot mirror it automatically.`,
    );
  }
  return {
    revenueAccount: revenueLines[0].account_code,
    settlementAccount: drLines[0].account_code,
  };
}

// Fallback for an allowance with **no original_invoice_id to mirror**. Per the
// Phase 7 write-path decision, we do NOT prompt staff for accounts; we apply a
// fixed default rule instead:
//   進項折讓 → Cr 7044 其他收入   銷項折讓 → Dr 4101 營業收入
// The tax line appears only when taxAmount > 0; the balancing settlement leg
// follows the §5.1 threshold (≤ 10,000 現金 / 否則 銀行存款), matching the invoice
// templates. This is reached only when original_invoice_id IS NULL — a
// set-but-unresolvable link fails loud in the caller (the period batch records
// it as a non-fatal failure).
export function computeDefaultEntryFromAllowance(allowance: Allowance): ComputedEntry {
  const data = allowance.extracted_data ?? {};
  const amount = data.amount ?? 0;
  const taxAmount = data.taxAmount ?? 0;
  const total = amount + taxAmount;
  const settlement = pickSettlementAccount(total);
  const entry_date = resolveEntryDate(data.date, allowance.created_at);

  if (allowance.in_or_out === "in") {
    // 進項折讓: Dr 結算 / Cr 7044 其他收入 / Cr 1144 進項稅額 (tax line only if > 0)
    const lines: ComputedEntryLine[] = [
      { account_code: settlement, debit: total, credit: 0, description: null },
      { account_code: ACCT_OTHER_INCOME, debit: 0, credit: amount, description: null },
    ];
    if (taxAmount > 0) {
      lines.push({ account_code: ACCT_INPUT_TAX, debit: 0, credit: taxAmount, description: null });
    }
    return {
      voucher_type: "收入",
      entry_date,
      description: buildAllowanceDescription(allowance, "進項折讓"),
      lines,
    };
  }

  // 銷項折讓: Dr 4101 營業收入 / Dr 2134 銷項稅額 (tax line only if > 0) / Cr 結算
  const lines: ComputedEntryLine[] = [
    { account_code: ACCT_REVENUE, debit: amount, credit: 0, description: null },
  ];
  if (taxAmount > 0) {
    lines.push({ account_code: ACCT_OUTPUT_TAX, debit: taxAmount, credit: 0, description: null });
  }
  lines.push({ account_code: settlement, debit: 0, credit: total, description: null });
  return {
    voucher_type: "支出",
    entry_date,
    description: buildAllowanceDescription(allowance, "銷項折讓"),
    lines,
  };
}

// Whether confirming this invoice should generate a journal entry. 作廢 (voided)
// and 彙加 (TET_U synthetic row), plus 銷項 零稅率/免稅, are valid filing states
// that produce NO entry — the confirm path must skip them rather than error.
// KEEP IN SYNC with the throw guards at the top of computeEntryFromInvoice.
export function shouldCreateEntry(invoice: Invoice): boolean {
  const data = invoice.extracted_data ?? {};
  if (data.taxType === "作廢" || data.taxType === "彙加") return false;
  if (
    invoice.in_or_out === "out" &&
    (data.taxType === "零稅率" || data.taxType === "免稅")
  ) {
    return false;
  }
  return true;
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
