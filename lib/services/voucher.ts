"use server";

// GL read path (Phase 5). Server Actions the voucher list / detail / report pages
// call directly via `useSWR`. Reads are firm-scoped by RLS through `createClient()`;
// the Drizzle aggregates bypass RLS, so each is gated by an RLS-bounded `clients`
// read first (`assertClientAccess`) — the same firm-scope boundary the period-batch
// helpers in `journal-entry.ts` use.
//
// Read-only: post / edit / reverse mutations and the audit trail land in later phases.

import { sql } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db/drizzle";
import type { Database } from "@/supabase/database.types";
import {
  journalEntrySchema,
  journalEntryLineSchema,
  type JournalEntry,
  type JournalEntryLine,
} from "@/lib/domain/journal-entry";
import {
  buildIncomeStatementFromTotals,
  buildBalanceSheetFromTotals,
  buildLedgerFromRows,
  type AccountTotals,
  type LedgerSourceRow,
  type IncomeStatement,
  type BalanceSheet,
  type AccountLedger,
} from "@/lib/services/financial-statements";

// Confirm the caller may read this client (RLS firm-scopes the `clients` table, and
// also enforces the client-level clause for client-role users) before any Drizzle
// query that would otherwise bypass RLS. Returns the authed client for reuse.
async function assertClientAccess(
  clientId: string,
): Promise<SupabaseClient<Database>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`client ${clientId} not found or not accessible`);
  }
  return supabase;
}

// ───────────────────────────────────────────────────────────────────────────
// 傳票讀取
// ───────────────────────────────────────────────────────────────────────────

export interface VoucherListRow {
  id: string;
  voucher_no: string | null;
  voucher_type: string;
  entry_date: string; // YYYY-MM-DD
  description: string | null;
  status: "draft" | "posted" | "reversed";
  document_id: string | null;
  doc_type: string | null; // joined from documents; null for system entries
  debit: number; // SUM of this entry's line debits
  credit: number; // SUM of this entry's line credits
  created_at: string; // ISO, for stable secondary sort
}

// One row per entry, with its line debit/credit summed and its document type joined
// in SQL — the list filters/sorts/pages over these in memory but never receives raw
// lines. Ordered newest-first to match the list's default sort.
export async function getVoucherEntries(
  clientId: string,
): Promise<VoucherListRow[]> {
  await assertClientAccess(clientId);

  const rows = (await db.execute(sql`
    SELECT e.id,
           e.voucher_no,
           e.voucher_type,
           e.entry_date::text AS entry_date,
           e.description,
           e.status,
           e.document_id,
           e.created_at,
           d.doc_type,
           COALESCE(SUM(l.debit), 0) AS debit,
           COALESCE(SUM(l.credit), 0) AS credit
      FROM journal_entries e
      LEFT JOIN journal_entry_lines l ON l.journal_entry_id = e.id
      LEFT JOIN documents d ON d.id = e.document_id
     WHERE e.client_id = ${clientId}
     GROUP BY e.id, d.doc_type
     ORDER BY e.entry_date DESC, e.created_at DESC
  `)) as unknown as Array<{
    id: string;
    voucher_no: string | null;
    voucher_type: string;
    entry_date: string;
    description: string | null;
    status: string;
    document_id: string | null;
    created_at: string | Date;
    doc_type: string | null;
    debit: string | number;
    credit: string | number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    voucher_no: r.voucher_no,
    voucher_type: r.voucher_type,
    entry_date: r.entry_date,
    description: r.description,
    status: r.status as VoucherListRow["status"],
    document_id: r.document_id,
    doc_type: r.doc_type,
    debit: Number(r.debit),
    credit: Number(r.credit),
    created_at: new Date(r.created_at).toISOString(),
  }));
}

export interface VoucherRef {
  id: string;
  voucher_no: string | null;
}

export interface VoucherDocument {
  id: string;
  doc_type: string;
  doc_date: string; // YYYY-MM-DD
  amount: number | null;
}

export interface VoucherDetail {
  entry: JournalEntry;
  lines: JournalEntryLine[];
  document: VoucherDocument | null;
  reverserEntry: VoucherRef | null; // the (posted) entry that reverses this one
  reversedTarget: VoucherRef | null; // the original entry this one reverses
}

// Full detail for one entry: the entry (Zod-parsed so timestamps are Dates for the
// page's `format()` calls), its lines, its source document, and both reversal links
// resolved to {id, voucher_no} for navigation. Scoped to `clientId` (the route's
// client): the journal_entries RLS policy is firm-only, so the explicit client_id
// filter is what keeps one client's vouchers from showing under another client's URL
// (and enforces isolation for client-role users). Returns null when the entry is
// missing, out-of-firm, or belongs to a different client.
export async function getVoucherDetail(
  clientId: string,
  entryId: string,
): Promise<VoucherDetail | null> {
  const supabase = await createClient();

  const { data: entryRow, error: entryErr } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("id", entryId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (entryErr) throw entryErr;
  if (!entryRow) return null;

  const entry = journalEntrySchema.parse(entryRow);

  const { data: lineRows, error: linesErr } = await supabase
    .from("journal_entry_lines")
    .select("*")
    .eq("journal_entry_id", entryId)
    .order("line_number", { ascending: true });
  if (linesErr) throw linesErr;
  const lines = journalEntryLineSchema.array().parse(lineRows ?? []);

  let document: VoucherDocument | null = null;
  if (entryRow.document_id) {
    const { data: docRow, error: docErr } = await supabase
      .from("documents")
      .select("id, doc_type, doc_date, amount")
      .eq("id", entryRow.document_id)
      .maybeSingle();
    if (docErr) throw docErr;
    document = docRow
      ? {
          id: docRow.id,
          doc_type: docRow.doc_type,
          doc_date: docRow.doc_date,
          amount: docRow.amount,
        }
      : null;
  }

  const { data: reverserRow, error: revErr } = await supabase
    .from("journal_entries")
    .select("id, voucher_no")
    .eq("reverses_entry_id", entryId)
    .maybeSingle();
  if (revErr) throw revErr;

  let reversedTarget: VoucherRef | null = null;
  if (entryRow.reverses_entry_id) {
    const { data: targetRow, error: tgtErr } = await supabase
      .from("journal_entries")
      .select("id, voucher_no")
      .eq("id", entryRow.reverses_entry_id)
      .maybeSingle();
    if (tgtErr) throw tgtErr;
    reversedTarget = targetRow ?? null;
  }

  return {
    entry,
    lines,
    document,
    reverserEntry: reverserRow ?? null,
    reversedTarget,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 財務報表讀取 (SQL SUM → 既有純函式 builders)
// ───────────────────────────────────────────────────────────────────────────

// Sum debit/credit per account_code for a client's booked (non-draft) lines within
// a date window — the single aggregate behind the income statement and balance sheet.
// Drizzle bypasses RLS, so callers must `assertClientAccess` first.
async function loadAccountTotals(
  clientId: string,
  range: { fromDate?: string; toDate: string },
): Promise<AccountTotals> {
  const fromCond = range.fromDate
    ? sql` AND e.entry_date >= ${range.fromDate}`
    : sql``;

  const rows = (await db.execute(sql`
    SELECT l.account_code AS account_code,
           SUM(l.debit) AS debit,
           SUM(l.credit) AS credit
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id
     WHERE e.client_id = ${clientId}
       AND e.status <> 'draft'
       AND e.entry_date <= ${range.toDate}${fromCond}
     GROUP BY l.account_code
  `)) as unknown as Array<{
    account_code: string;
    debit: string | number;
    credit: string | number;
  }>;

  const totals: AccountTotals = new Map();
  for (const r of rows) {
    totals.set(r.account_code, {
      debit: Number(r.debit),
      credit: Number(r.credit),
    });
  }
  return totals;
}

export async function getIncomeStatement(
  clientId: string,
  fromDate: string,
  toDate: string,
): Promise<IncomeStatement> {
  await assertClientAccess(clientId);
  const totals = await loadAccountTotals(clientId, { fromDate, toDate });
  return buildIncomeStatementFromTotals(totals, fromDate, toDate);
}

export async function getBalanceSheet(
  clientId: string,
  asOfDate: string,
): Promise<BalanceSheet> {
  await assertClientAccess(clientId);
  const totals = await loadAccountTotals(clientId, { toDate: asOfDate });
  return buildBalanceSheetFromTotals(totals, asOfDate);
}

export async function getAccountLedger(
  clientId: string,
  accountCode: string,
  asOfDate: string,
): Promise<AccountLedger> {
  await assertClientAccess(clientId);

  const rows = (await db.execute(sql`
    SELECT l.id AS line_id,
           e.id AS entry_id,
           e.voucher_no,
           e.entry_date::text AS entry_date,
           e.status,
           l.line_number,
           l.debit,
           l.credit,
           l.description AS line_description,
           e.description AS entry_description
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id
     WHERE e.client_id = ${clientId}
       AND e.status <> 'draft'
       AND e.entry_date <= ${asOfDate}
       AND l.account_code = ${accountCode}
  `)) as unknown as Array<{
    line_id: string;
    entry_id: string;
    voucher_no: string | null;
    entry_date: string;
    status: string;
    line_number: string | number;
    debit: string | number;
    credit: string | number;
    line_description: string | null;
    entry_description: string | null;
  }>;

  const sourceRows: LedgerSourceRow[] = rows.map((r) => ({
    lineId: r.line_id,
    entryId: r.entry_id,
    voucherNo: r.voucher_no ?? "",
    entryDate: r.entry_date,
    status: r.status === "reversed" ? "reversed" : "posted",
    lineNumber: Number(r.line_number),
    debit: Number(r.debit),
    credit: Number(r.credit),
    description: r.line_description ?? r.entry_description ?? null,
  }));

  return buildLedgerFromRows(accountCode, sourceRows);
}
