"use server";

// GL Server Actions the voucher list / detail / report pages call directly via
// `useSWR`. Reads (list / detail / audit trail / reports) are firm-scoped by RLS
// through `createClient()`; the Drizzle aggregates bypass RLS, so each is gated by
// an RLS-bounded `clients` read first (`assertClientAccess`) — the same firm-scope
// boundary the helpers in `journal-entry.ts` use.
//
// The edit / delete wrappers at the bottom (Phase 9) are the write surface: thin
// 'use server' entry points delegating to the non-'use server' helpers in
// `journal-entry.ts` (those can't be 'use server' themselves — they take an injected
// userId for tests/composition, which a public endpoint must not accept). Reverse
// lands in Phase 10.

import { sql } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db/drizzle";
import { assertClientReadable } from "@/lib/services/authz";
import type { Database } from "@/supabase/database.types";
import {
  editEntry,
  deleteDraftEntry,
  createManualEntry,
  type EntryPatch,
  type EditEntryLine,
  type CreateManualEntryInput,
} from "@/lib/services/journal-entry";
import { auditTrailSchema, type AuditTrail } from "@/lib/domain/audit-trail";
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
  await assertClientReadable(supabase, clientId);
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
  file_url: string | null; // storage_path of the uploaded file; null when none (e.g. electronic allowances)
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
// resolved to {id, voucher_no} for navigation. Two layers of client scoping:
// `assertClientAccess` authorizes the CALLER for this client (the journal_entries RLS
// is firm-only and can't, so a client-role user passing a sibling's clientId is
// rejected here), and the `.eq("client_id", clientId)` filter scopes the ROW to this
// client so one client's voucher never renders under another's URL. Returns null when
// the entry is missing, out-of-firm, or belongs to a different client.
export async function getVoucherDetail(
  clientId: string,
  entryId: string,
): Promise<VoucherDetail | null> {
  const supabase = await assertClientAccess(clientId);

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
      .select("id, doc_type, doc_date, amount, file_url")
      .eq("id", entryRow.document_id)
      .maybeSingle();
    if (docErr) throw docErr;
    document = docRow
      ? {
          id: docRow.id,
          doc_type: docRow.doc_type,
          doc_date: docRow.doc_date,
          amount: docRow.amount,
          file_url: docRow.file_url,
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

// ───────────────────────────────────────────────────────────────────────────
// 審計歷史讀取
// ───────────────────────────────────────────────────────────────────────────

// All audit-trail rows for one journal entry, newest first. The JOIN to
// journal_entries row-scopes to `clientId` (Drizzle bypasses RLS, so the
// assertClientAccess gate + this client_id filter are the boundary, mirroring
// the read aggregates above). v1 only audits journal_entries.
export async function listEntryAuditTrails(
  clientId: string,
  entryId: string,
): Promise<AuditTrail[]> {
  await assertClientAccess(clientId);

  // db.execute returns the postgres-js RowList; auditTrailSchema.array().parse
  // accepts it as `unknown` and validates each row (incl. the `before` jsonb), so
  // no cast is needed.
  const rows = await db.execute(sql`
    SELECT a.id,
           a.firm_id,
           a.entity_table,
           a.entity_id,
           a.action,
           a.before,
           a.reason,
           a.actor_id,
           a.actor_at
      FROM audit_trails a
      JOIN journal_entries e ON e.id = a.entity_id
     WHERE a.entity_table = 'journal_entries'
       AND a.entity_id = ${entryId}
       AND e.client_id = ${clientId}
     ORDER BY a.actor_at DESC
  `);

  return auditTrailSchema.array().parse(rows);
}

// ───────────────────────────────────────────────────────────────────────────
// 傳票編輯 / 刪除 (Phase 9) — 薄 Server Action 包裝，委派給 journal-entry.ts
// ───────────────────────────────────────────────────────────────────────────

// Edit a draft or posted entry's header + lines in place. A posted edit writes a
// mandatory audit_trails row (reason required); a draft edit does not. The helper
// resolves auth from cookies (no injected options here) and enforces the firm /
// client / fiscal-year guards.
export async function editEntryAction(
  clientId: string,
  entryId: string,
  patch: EntryPatch,
  newLines: EditEntryLine[],
  reason: string,
): Promise<void> {
  await editEntry(clientId, entryId, patch, newLines, reason);
}

// Delete a draft entry (lines cascade). Rejects posted / reversed entries.
export async function deleteDraftEntryAction(
  clientId: string,
  entryId: string,
): Promise<void> {
  await deleteDraftEntry(clientId, entryId);
}

// ───────────────────────────────────────────────────────────────────────────
// 手動建立傳票 (新增傳票 / 期初開帳)
// ───────────────────────────────────────────────────────────────────────────

// Create a hand-entered draft voucher (no source document) — backs both the plain
// 新增傳票 and the 期初開帳 preset (which is just this with voucher_type=轉帳 and
// description=期初開帳, set on the client). The caller redirects to the entry's
// detail page to review and post it via the existing post path.
export async function createManualEntryAction(
  clientId: string,
  input: CreateManualEntryInput,
): Promise<{ entryId: string }> {
  const entryId = await createManualEntry(clientId, input);
  return { entryId };
}
