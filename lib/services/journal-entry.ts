// NOT a Server Action module (intentionally no 'use server'). The exports here
// accept an injected userId / supabase client (for tests and internal
// composition); marking this 'use server' would expose them as public endpoints
// where a client could pass an arbitrary userId and skip the firm-scope
// authorization these helpers perform via an RLS-bounded period read. The UI
// reaches the period-batch helpers (getPeriodEntryStatus /
// generateDraftEntriesByPeriod) through the thin 'use server' wrappers in
// lib/services/voucher-generation.ts.

import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { db, type Tx } from "@/lib/db/drizzle";
import {
  audit_trails as auditTrailsTable,
  fiscal_year_closes as fiscalYearClosesTable,
  journal_entries as journalEntriesTable,
  journal_entry_lines as journalEntryLinesTable,
  tax_filing_periods as taxFilingPeriodsTable,
  voucher_sequences as voucherSequencesTable,
} from "@/lib/db/schema";
import { chunkedIn } from "@/lib/services/invoice-import";
import type { Database } from "@/supabase/database.types";
import {
  extractedInvoiceDataSchema,
  extractedAllowanceDataSchema,
  type Invoice,
  type Allowance,
  type ExtractedInvoiceData,
  type ExtractedAllowanceData,
} from "@/lib/domain/models";
import { z } from "zod";
import {
  ACCOUNT_CODE_REGEX,
  isLinesBalanced,
  VOUCHER_TYPE,
  type JournalEntry,
  type VoucherType,
} from "@/lib/domain/journal-entry";
import { beforeSnapshotSchema } from "@/lib/domain/audit-trail";
import {
  type ComputedEntry,
  computeDefaultEntryFromAllowance,
  computeEntryFromAllowance,
  computeEntryFromInvoice,
} from "@/lib/services/journal-entry-generation";
import {
  assertPeriodReadable,
  assertStaffCanAccessClient,
  assertStaffRole,
} from "@/lib/services/authz";

type JournalEntryServiceOptions = {
  supabaseClient?: SupabaseClient<Database>;
  userId?: string;
};

async function resolveAuth(options?: JournalEntryServiceOptions) {
  const supabase = options?.supabaseClient ?? (await createClient());
  let userId = options?.userId;
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    userId = user.id;
  }
  return { supabase, userId };
}

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type AllowanceRow = Database["public"]["Tables"]["allowances"]["Row"];

// Convert a stored row to the domain type WITHOUT strict-parsing extracted_data.
// Like extractInvoiceCore, we tolerate AI/legacy values that no longer satisfy
// the Zod enums (e.g. an `account` dropped from ACCOUNT_LIST): the entry
// computation only needs the raw fields, so a stale value must not break a save.
function rowToInvoice(row: InvoiceRow): Invoice {
  if (!row.client_id) {
    throw new Error(`rowToInvoice: invoice ${row.id} has no client_id`);
  }
  const parsed = extractedInvoiceDataSchema.safeParse(row.extracted_data ?? undefined);
  return {
    id: row.id,
    document_id: row.document_id,
    firm_id: row.firm_id,
    client_id: row.client_id,
    storage_path: row.storage_path,
    filename: row.filename,
    in_or_out: row.in_or_out as Invoice["in_or_out"],
    status: row.status as Invoice["status"],
    extracted_data: parsed.success
      ? parsed.data
      : (row.extracted_data as ExtractedInvoiceData | null),
    invoice_serial_code: row.invoice_serial_code,
    year_month: row.year_month,
    tax_filing_period_id: row.tax_filing_period_id,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
  };
}

function rowToAllowance(row: AllowanceRow): Allowance {
  if (!row.client_id) {
    throw new Error(`rowToAllowance: allowance ${row.id} has no client_id`);
  }
  const parsed = extractedAllowanceDataSchema.safeParse(row.extracted_data ?? undefined);
  return {
    id: row.id,
    document_id: row.document_id,
    firm_id: row.firm_id,
    client_id: row.client_id,
    tax_filing_period_id: row.tax_filing_period_id,
    allowance_serial_code: row.allowance_serial_code,
    original_invoice_serial_code: row.original_invoice_serial_code,
    original_invoice_id: row.original_invoice_id,
    in_or_out: row.in_or_out as Allowance["in_or_out"],
    storage_path: row.storage_path,
    filename: row.filename,
    status: row.status as Allowance["status"],
    extracted_data: parsed.success
      ? parsed.data
      : (row.extracted_data as ExtractedAllowanceData | null),
    uploaded_by: row.uploaded_by,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
  };
}

/**
 * Create or replace the **draft** journal entry for a document, inside a Drizzle
 * transaction. Keyed on `documents.id` (1:1 via the UNIQUE constraint on
 * `journal_entries.document_id`), so it is idempotent: confirming again or
 * editing a confirmed invoice/allowance just replaces the draft's lines while
 * preserving `entry.id`.
 *
 * In Phase 7 every entry is a draft (posting lands in Phase 8), so the
 * non-draft branch below is purely defensive — once posting exists, edits to a
 * posted entry will route through `edit_posted_entry` (Phase 9) instead.
 */
async function upsertDraftEntry(
  tx: Tx,
  params: {
    firmId: string;
    clientId: string;
    documentId: string;
    computed: ComputedEntry;
    userId: string;
  },
): Promise<string> {
  const { firmId, clientId, documentId, computed, userId } = params;

  // Total debit==credit is an app-layer invariant. The per-line debit/credit XOR
  // is enforced by the DB CHECK, but the overall balance is not — assert it here
  // so an unbalanced computation fails loud instead of writing a broken voucher.
  const totalDebit = computed.lines.reduce((a, l) => a + l.debit, 0);
  const totalCredit = computed.lines.reduce((a, l) => a + l.credit, 0);
  if (totalDebit !== totalCredit) {
    throw new Error(
      `unbalanced computed entry for document ${documentId}: ` +
        `debit ${totalDebit} != credit ${totalCredit}`,
    );
  }

  const [existing] = await tx
    .select({ id: journalEntriesTable.id, status: journalEntriesTable.status })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.document_id, documentId))
    .for("update")
    .limit(1);

  let entryId: string;
  if (existing) {
    if (existing.status !== "draft") {
      throw new Error(
        `journal entry for document ${documentId} is '${existing.status}', not draft — ` +
          `cannot regenerate (posted-entry edits arrive in Phase 9)`,
      );
    }
    entryId = existing.id;
    await tx
      .update(journalEntriesTable)
      .set({
        voucher_type: computed.voucher_type,
        entry_date: computed.entry_date,
        description: computed.description,
        updated_at: sql`now()`,
      })
      .where(eq(journalEntriesTable.id, entryId));
    await tx
      .delete(journalEntryLinesTable)
      .where(eq(journalEntryLinesTable.journal_entry_id, entryId));
  } else {
    const [inserted] = await tx
      .insert(journalEntriesTable)
      .values({
        firm_id: firmId,
        client_id: clientId,
        document_id: documentId,
        voucher_type: computed.voucher_type,
        entry_date: computed.entry_date,
        description: computed.description,
        status: "draft",
        voucher_no: null,
        created_by: userId,
      })
      .returning({ id: journalEntriesTable.id });
    entryId = inserted.id;
  }

  await tx.insert(journalEntryLinesTable).values(
    computed.lines.map((line, idx) => ({
      journal_entry_id: entryId,
      line_number: idx + 1,
      account_code: line.account_code,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
    })),
  );

  return entryId;
}

/**
 * Load an invoice's journal entry, reconstructed as a `ComputedEntry` (e.g. so an
 * allowance can mirror it, Decision #13). Get-or-throw: throws if the invoice,
 * its document, its entry, or its lines can't be found. Callers wanting a softer
 * "missing is fine" contract should branch before calling — the allowance
 * default-rule fallback, for instance, only runs when `original_invoice_id` is
 * NULL, never for a set-but-dangling link.
 */
async function getComputedEntryForInvoice(
  supabase: SupabaseClient<Database>,
  invoiceId: string,
): Promise<ComputedEntry> {
  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .select("document_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invError) throw invError;
  if (!invoice) {
    throw new Error(`getComputedEntryForInvoice: invoice ${invoiceId} not found`);
  }
  if (!invoice.document_id) {
    throw new Error(
      `getComputedEntryForInvoice: invoice ${invoiceId} has no document_id`,
    );
  }

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .select("id, voucher_type, entry_date, description")
    .eq("document_id", invoice.document_id)
    .maybeSingle();
  if (entryError) throw entryError;
  if (!entry) {
    throw new Error(
      `getComputedEntryForInvoice: invoice ${invoiceId} has no journal entry`,
    );
  }

  const { data: lines, error: linesError } = await supabase
    .from("journal_entry_lines")
    .select("account_code, debit, credit, description, line_number")
    .eq("journal_entry_id", entry.id)
    .order("line_number", { ascending: true });
  if (linesError) throw linesError;
  if (!lines || lines.length === 0) {
    throw new Error(
      `getComputedEntryForInvoice: entry ${entry.id} has no lines`,
    );
  }

  return {
    voucher_type: entry.voucher_type as VoucherType,
    entry_date: entry.entry_date,
    description: entry.description,
    lines: lines.map((l) => ({
      account_code: l.account_code,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
    })),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Period-level batch: freshness summary + draft-entry generation
//
// Draft entries are generated by a period-level batch action, not at confirm
// time (so it doesn't matter HOW a doc reached `confirmed` — manual review or
// electronic-invoice import). See docs/VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md §7.
// ───────────────────────────────────────────────────────────────────────────

export type VoucherGenerationStatus = "idle" | "running";

export type PeriodEntryStatus = {
  /** confirmed, entry-producing docs that have no journal entry yet */
  missing: number;
  /** docs whose draft entry is older than the doc's last edit */
  stale: number;
  /** ISO timestamp of the most recently (re)generated entry, or null */
  lastGenerated: string | null;
  /** the period's voucher-generation run-state flag */
  generationStatus: VoucherGenerationStatus;
};

/**
 * THE single source of the new/stale/missing rule. Returns a subquery with one row
 * per confirmed document in the period, each carrying a `freshness`:
 *   'new'   — entry-producing, no journal entry exists yet
 *   'stale' — its draft entry is older than the doc's last edit
 *   NULL    — skip: up to date, posted/reversed, or non-entry-producing
 * Both callers consume this — `getPeriodEntryStatus` rolls it into counts, the batch
 * (`loadPeriodWorkList`) reads it as a work-list — so the badge and the batch decide
 * staleness from the exact same comparison and can never disagree.
 *
 * `produces_entry` mirrors `shouldCreateEntry` for invoices (作廢 / 彙加, and 銷項
 * 零稅率·免稅 produce no entry); allowances always attempt one. KEEP IN SYNC with
 * `shouldCreateEntry` (parity test in the integration suite). Staleness rides two
 * existing clocks: `journal_entries.updated_at` (stamped on every (re)generation) and
 * `documents.updated_at` (bumped by the `sync_documents_cache_from_*` trigger on
 * `extracted_data` / `status` edits — exactly the entry-affecting fields), compared at
 * full timestamptz precision here, the only place the comparison is made. Posted
 * entries are excluded from 'stale' (a stale posted entry is a Phase 9 edit concern).
 */
function periodEntryFreshness(periodId: string) {
  return sql`(
    WITH docs AS (
      SELECT i.document_id,
             i.in_or_out,
             i.extracted_data->>'taxType' AS tax_type,
             'invoice'::text AS kind
        FROM invoices i
       WHERE i.tax_filing_period_id = ${periodId}
         AND i.status = 'confirmed'
      UNION ALL
      SELECT a.document_id,
             a.in_or_out,
             a.extracted_data->>'taxType' AS tax_type,
             'allowance'::text AS kind
        FROM allowances a
       WHERE a.tax_filing_period_id = ${periodId}
         AND a.status = 'confirmed'
    ),
    classified AS (
      SELECT docs.document_id,
             docs.kind,
             CASE
               WHEN docs.kind = 'invoice' THEN
                 docs.tax_type IS DISTINCT FROM '作廢'
                 AND docs.tax_type IS DISTINCT FROM '彙加'
                 AND NOT (docs.in_or_out = 'out'
                          -- COALESCE so a NULL taxType (key absent) reads as
                          -- "not zero-rate", entry-producing, matching how
                          -- shouldCreateEntry treats an absent taxType.
                          AND COALESCE(docs.tax_type IN ('零稅率', '免稅'), FALSE))
               ELSE TRUE
             END AS produces_entry
        FROM docs
    )
    SELECT c.document_id,
           c.kind,
           CASE
             WHEN NOT c.produces_entry THEN NULL
             WHEN je.document_id IS NULL THEN 'new'
             WHEN je.status = 'draft' AND doc.updated_at > je.updated_at THEN 'stale'
             ELSE NULL
           END AS freshness,
           je.updated_at AS entry_updated_at
      FROM classified c
      JOIN documents doc ON doc.id = c.document_id
      LEFT JOIN journal_entries je ON je.document_id = c.document_id
  )`;
}

/**
 * Freshness summary for a period's draft journal entries plus the run-state flag —
 * the single query the period UI reads (and polls while a run is in flight). Rolls
 * the shared `periodEntryFreshness` relation into counts:
 *   MISSING = freshness 'new'   (confirmed entry-producing doc with no entry)
 *   STALE   = freshness 'stale' (draft entry older than the doc's last edit)
 * Set-based: transfers no document rows regardless of period size, so it scales to
 * ~10k-doc periods.
 */
export async function getPeriodEntryStatus(
  periodId: string,
  options?: JournalEntryServiceOptions,
): Promise<PeriodEntryStatus> {
  const { supabase } = await resolveAuth(options);

  // Firm-scope boundary (the Drizzle aggregate below bypasses RLS). No role
  // gate — the freshness badge is a client-visible read.
  await assertPeriodReadable(supabase, periodId);

  const result = await db.execute(sql`
    SELECT
      (SELECT voucher_generation_status
         FROM tax_filing_periods
        WHERE id = ${periodId}) AS generation_status,
      count(*) FILTER (WHERE w.freshness = 'new')   AS missing,
      count(*) FILTER (WHERE w.freshness = 'stale') AS stale,
      max(w.entry_updated_at) AS last_generated
    FROM ${periodEntryFreshness(periodId)} w
  `);

  const row = (
    result as unknown as Array<{
      generation_status: string | null;
      missing: string | number | null;
      stale: string | number | null;
      last_generated: string | Date | null;
    }>
  )[0];

  return {
    missing: Number(row?.missing ?? 0),
    stale: Number(row?.stale ?? 0),
    lastGenerated: row?.last_generated
      ? new Date(row.last_generated).toISOString()
      : null,
    generationStatus: (row?.generation_status ?? "idle") as VoucherGenerationStatus,
  };
}

/**
 * Just the period's run-state flag — an O(1) single-row read, no confirmed-row
 * scan. The period UI polls THIS while a run is in flight (to keep the button
 * disabled and the spinner live across reloads / tabs / staff); the heavier
 * `getPeriodEntryStatus` count is fetched only off the polling path (on load and
 * once a run finishes), so poll cost stays constant regardless of period size.
 */
export async function getPeriodGenerationStatus(
  periodId: string,
  options?: JournalEntryServiceOptions,
): Promise<VoucherGenerationStatus> {
  const { supabase } = await resolveAuth(options);
  const { data, error } = await supabase
    .from("tax_filing_periods")
    .select("voucher_generation_status")
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      `getPeriodGenerationStatus: period ${periodId} not found or not accessible`,
    );
  }
  return (data.voucher_generation_status ?? "idle") as VoucherGenerationStatus;
}

export type GeneratePeriodResult = {
  /** new draft entries created */
  generated: number;
  /** existing draft entries whose lines were replaced (doc edited since) */
  regenerated: number;
  /** per-document failures (non-fatal; the rest of the batch still runs) */
  failures: { documentId: string; kind: "invoice" | "allowance"; reason: string }[];
};

type DraftEntryItem = {
  firmId: string;
  clientId: string;
  documentId: string;
  computed: ComputedEntry;
};

// A document the SQL `periodEntryFreshness` relation flagged for (re)generation.
type WorkItem = { documentId: string; kind: "invoice" | "allowance"; freshness: "new" | "stale" };

// `now()` minus the stale-run window: a 'running' flag older than this is treated
// as a crashed/timed-out run and may be reclaimed (the batch is idempotent).
const STALE_RUN_GUARD = sql`now() - interval '15 minutes'`;

// One transaction per chunk keeps per-entry atomicity (entry + its lines commit
// together) without holding a 10k-row transaction open. Sized well under
// Postgres' 65,535 bind-parameter cap.
const NEW_ENTRY_CHUNK = 400;
const LINE_INSERT_CHUNK = 1000;

function errorReason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Validate a computed entry against the DB-level invariants *before* it reaches the
// batch INSERT. The killer is that a multi-row INSERT aborts on the first bad row,
// so one invalid line rolls back the whole chunk and the Postgres error names the
// row's (rolled-back) values but not the source document. Checking here, inside the
// per-document try/catch, attributes the failure to its `documentId` (recorded in
// result.failures) and lets the rest of the batch proceed.
function assertValidEntry(computed: ComputedEntry, documentId: string): void {
  for (const l of computed.lines) {
    // debit_credit_xor: exactly one of debit/credit must be > 0 (both >= 0).
    if (l.debit < 0 || l.credit < 0 || (l.debit > 0) === (l.credit > 0)) {
      throw new Error(
        `invalid line for document ${documentId}: account ${l.account_code} has ` +
          `debit=${l.debit}, credit=${l.credit} (need exactly one > 0, both >= 0)`,
      );
    }
  }
  const debit = computed.lines.reduce((a, l) => a + l.debit, 0);
  const credit = computed.lines.reduce((a, l) => a + l.credit, 0);
  if (debit !== credit) {
    throw new Error(
      `unbalanced computed entry for document ${documentId}: debit ${debit} != credit ${credit}`,
    );
  }
}

// Per-document work-list for the period: the shared `periodEntryFreshness` relation,
// filtered to the docs that actually need work ('new' or 'stale'). The batch then
// loads full row payload only for these, not the whole confirmed period. Computed
// once at the start of a run — generating an invoice entry never bumps an allowance's
// documents.updated_at, so every doc's freshness stays valid for the whole run.
async function loadPeriodWorkList(periodId: string): Promise<WorkItem[]> {
  const rows = (await db.execute(sql`
    SELECT w.document_id, w.kind, w.freshness
    FROM ${periodEntryFreshness(periodId)} w
    WHERE w.freshness IS NOT NULL
  `)) as unknown as Array<{ document_id: string; kind: string; freshness: string }>;
  return rows.map((r) => ({
    documentId: r.document_id,
    kind: r.kind as WorkItem["kind"],
    freshness: r.freshness as WorkItem["freshness"],
  }));
}

// Bulk-insert brand-new draft entries: insert the entry headers (returning ids
// keyed by document_id), then their lines. Within the mutex, this batch is the
// only writer of entries for the period, so document_id is guaranteed free.
async function bulkInsertNewEntries(items: DraftEntryItem[], userId: string): Promise<number> {
  let total = 0;
  for (let i = 0; i < items.length; i += NEW_ENTRY_CHUNK) {
    const chunk = items.slice(i, i + NEW_ENTRY_CHUNK);
    try {
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(journalEntriesTable)
        .values(
          chunk.map((it) => ({
            firm_id: it.firmId,
            client_id: it.clientId,
            document_id: it.documentId,
            voucher_type: it.computed.voucher_type,
            entry_date: it.computed.entry_date,
            description: it.computed.description,
            status: "draft" as const,
            voucher_no: null,
            created_by: userId,
          })),
        )
        .returning({
          id: journalEntriesTable.id,
          document_id: journalEntriesTable.document_id,
        });
      // returning order is not guaranteed, so key the line FK by document_id.
      const idByDoc = new Map(inserted.map((e) => [e.document_id, e.id]));
      const lines = chunk.flatMap((it) =>
        it.computed.lines.map((line, idx) => ({
          journal_entry_id: idByDoc.get(it.documentId)!,
          line_number: idx + 1,
          account_code: line.account_code,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
        })),
      );
      for (let j = 0; j < lines.length; j += LINE_INSERT_CHUNK) {
        await tx.insert(journalEntryLinesTable).values(lines.slice(j, j + LINE_INSERT_CHUNK));
      }
      total += chunk.length;
    });
    // Periodic progress for large batches (up to tens of thousands of documents),
    // so a long-running run is visibly advancing rather than appearing stalled.
    console.log(`bulkInsertNewEntries: inserted ${total} / ${items.length} draft entries`);
    } catch (e) {
      // A multi-row INSERT aborts on the first offending row, rolling back the
      // whole chunk; the Postgres error reports that row's (now-discarded) values
      // but not its source document. `assertValidEntry` screens the known cases
      // upstream, so reaching here means an unexpected constraint — log the chunk's
      // documents so the culprit is at least traceable from the entry/line shapes.
      console.error(
        `bulkInsertNewEntries: chunk insert failed for ${chunk.length} document(s): ` +
          chunk.map((it) => it.documentId).join(", "),
      );
      throw e;
    }
  }
  return total;
}

// Stale entries already exist (draft) — reuse the per-row upsert that replaces
// the lines while preserving entry.id. Stale sets are small on re-runs.
async function regenerateStaleEntries(items: DraftEntryItem[], userId: string): Promise<number> {
  let total = 0;
  for (const it of items) {
    await db.transaction(async (tx) =>
      upsertDraftEntry(tx, {
        firmId: it.firmId,
        clientId: it.clientId,
        documentId: it.documentId,
        computed: it.computed,
        userId,
      }),
    );
    total++;
  }
  return total;
}

// Load full rows for only the work-set document_ids (chunked under PostgREST's
// URL-length limit), keyed for freshness lookup. The work-list already encodes
// `produces_entry`, so no `shouldCreateEntry` re-filter is needed here.
async function processInvoices(
  supabase: SupabaseClient<Database>,
  work: WorkItem[],
  userId: string,
  result: GeneratePeriodResult,
): Promise<void> {
  if (work.length === 0) return;
  const freshnessByDoc = new Map(work.map((w) => [w.documentId, w.freshness]));
  const rows = await chunkedIn<InvoiceRow>(
    () => supabase.from("invoices"),
    "*",
    "document_id",
    work.map((w) => w.documentId),
  );

  const newItems: DraftEntryItem[] = [];
  const staleItems: DraftEntryItem[] = [];
  for (const row of rows) {
    const documentId = row.document_id;
    const freshness = documentId ? freshnessByDoc.get(documentId) : undefined;
    if (!documentId || !freshness) continue;
    const invoice = rowToInvoice(row);
    let computed: ComputedEntry;
    try {
      computed = computeEntryFromInvoice(invoice);
      assertValidEntry(computed, documentId);
    } catch (e) {
      result.failures.push({ documentId, kind: "invoice", reason: errorReason(e) });
      continue;
    }
    (freshness === "new" ? newItems : staleItems).push({
      firmId: invoice.firm_id,
      clientId: invoice.client_id,
      documentId,
      computed,
    });
  }
  result.generated += await bulkInsertNewEntries(newItems, userId);
  result.regenerated += await regenerateStaleEntries(staleItems, userId);
}

async function processAllowances(
  supabase: SupabaseClient<Database>,
  work: WorkItem[],
  userId: string,
  result: GeneratePeriodResult,
): Promise<void> {
  if (work.length === 0) return;
  const freshnessByDoc = new Map(work.map((w) => [w.documentId, w.freshness]));
  const rows = await chunkedIn<AllowanceRow>(
    () => supabase.from("allowances"),
    "*",
    "document_id",
    work.map((w) => w.documentId),
  );

  const newItems: DraftEntryItem[] = [];
  const staleItems: DraftEntryItem[] = [];
  for (const row of rows) {
    const documentId = row.document_id;
    const freshness = documentId ? freshnessByDoc.get(documentId) : undefined;
    if (!documentId || !freshness) continue;
    const allowance = rowToAllowance(row);
    let computed: ComputedEntry;
    try {
      // Mirror the original invoice's (now-generated) entry, or apply the
      // default rule when there is no original. A set-but-unresolvable original
      // (e.g. an input 折讓 whose original invoice is still uploaded) fails loud
      // in getComputedEntryForInvoice → recorded as a non-fatal failure.
      computed =
        allowance.original_invoice_id == null
          ? computeDefaultEntryFromAllowance(allowance)
          : computeEntryFromAllowance(
              allowance,
              await getComputedEntryForInvoice(supabase, allowance.original_invoice_id),
            );
      assertValidEntry(computed, documentId);
    } catch (e) {
      result.failures.push({ documentId, kind: "allowance", reason: errorReason(e) });
      continue;
    }
    (freshness === "new" ? newItems : staleItems).push({
      firmId: allowance.firm_id,
      clientId: allowance.client_id,
      documentId,
      computed,
    });
  }
  result.generated += await bulkInsertNewEntries(newItems, userId);
  result.regenerated += await regenerateStaleEntries(staleItems, userId);
}

/**
 * Generate (or regenerate) draft journal entries for every confirmed,
 * entry-producing document in a period — the period-level batch action. It
 * doesn't matter how a document reached `confirmed` (manual review or
 * electronic-invoice import); the batch reads them all.
 *
 * - Single-run mutex via `tax_filing_periods.voucher_generation_status` (claimed
 *   here, released in `finally`); a concurrent run is rejected. Allowed in any
 *   period status (drafting vouchers is a legitimate post-filing step).
 * - Invoices first (self-contained), then allowances (mirror the now-existing
 *   invoice entries / default rule).
 * - Set-based bulk insert for new entries, per-row regenerate for stale ones;
 *   idempotent and resumable (only the missing + stale set is touched).
 * - Per-document failures are non-fatal and returned for display.
 */
export async function generateDraftEntriesByPeriod(
  periodId: string,
  options?: JournalEntryServiceOptions,
): Promise<GeneratePeriodResult> {
  const { supabase, userId } = await resolveAuth(options);

  // Staff-only: draft-entry generation produces ledger data, so a portal
  // client-role user is rejected even for their own client (matches
  // postJournalEntries). Run before the period read + mutex claim so a denied
  // caller leaves no run-state flag set.
  await assertStaffRole(supabase, userId);

  // Firm-scope boundary (the Drizzle writes below bypass RLS).
  await assertPeriodReadable(supabase, periodId);

  // Claim the single-run mutex (reclaiming a flag stuck by a crashed run).
  const claimed = await db
    .update(taxFilingPeriodsTable)
    .set({
      voucher_generation_status: "running",
      voucher_generation_started_at: sql`now()`,
    })
    .where(
      and(
        eq(taxFilingPeriodsTable.id, periodId),
        or(
          eq(taxFilingPeriodsTable.voucher_generation_status, "idle"),
          lt(taxFilingPeriodsTable.voucher_generation_started_at, STALE_RUN_GUARD),
        ),
      ),
    )
    .returning({ id: taxFilingPeriodsTable.id });
  if (claimed.length === 0) {
    throw new Error("另一個傳票產生作業正在進行中，請稍候再試。");
  }

  const result: GeneratePeriodResult = { generated: 0, regenerated: 0, failures: [] };
  try {
    // One SQL work-list for the whole period, computed up front. Invoices first
    // (self-contained), then allowances (mirror the now-existing invoice entries) —
    // generating an invoice entry doesn't bump any allowance's documents.updated_at,
    // so the allowance freshness values captured here stay valid.
    const work = await loadPeriodWorkList(periodId);
    await processInvoices(
      supabase,
      work.filter((w) => w.kind === "invoice"),
      userId,
      result,
    );
    await processAllowances(
      supabase,
      work.filter((w) => w.kind === "allowance"),
      userId,
      result,
    );
  } finally {
    await db
      .update(taxFilingPeriodsTable)
      .set({ voucher_generation_status: "idle" })
      .where(eq(taxFilingPeriodsTable.id, periodId));
  }
  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// 過帳 (Post): draft → posted, no-gap voucher_no assignment
// ───────────────────────────────────────────────────────────────────────────

export type PostResult = {
  entry_id: string;
  voucher_no: string | null;
  error: string | null;
};

// Upper bound on a single post batch. Posting is a deliberate, review-gated action
// (the UI selection is manual / a page at a time), so this is a defensive guard, not
// a normal limit: it keeps `entryIds` well under Postgres' bind-parameter cap on the
// candidate + balance `inArray` queries and bounds how long the per-entry loop holds
// the voucher_sequences row lock inside one transaction. If posting genuinely large
// batches ever becomes a workflow, switch the per-entry writes to a set-based
// (per-date) allocation rather than raising this.
export const MAX_POST_BATCH = 1000;

/**
 * Batch-post draft journal entries (§5.4). In one Drizzle transaction, assigns
 * each balanced draft a no-gap `voucher_no` and flips it draft→posted. Per-entry
 * success/failure (partial success): a failed entry never consumes a sequence
 * number, so the successes stay gap-free. Single-entry posting is just a
 * length-1 array — there is no separate single-post function (§5.4).
 *
 * No-gap discipline — keep these invariant (the integration test guards them):
 *  1. `voucher_sequences` is a TABLE, not a PG SEQUENCE: a rollback restores
 *     `next_seq` (nextval() would not), so partial-failure can't leave a gap.
 *  2. Every failure check (status / balance / fiscal-year) runs BEFORE the seq
 *     UPSERT, so a skipped entry never burns a number. New guards go here too.
 *  3. No per-entry SAVEPOINT — a failure just records an error and continues; the
 *     transaction commits with only the successful entries posted.
 *  4. The final status UPDATE cannot fail: the row is FOR UPDATE-locked and every
 *     CHECK (balance, voucher_no-when-booked) is already satisfied.
 *
 * Authorization (the Drizzle writes below bypass RLS, so this is the role + firm
 * boundary): posting finalizes vouchers with permanent numbers and is a firm-staff
 * action, so the caller must be admin / staff / super_admin — a client-role (portal)
 * user is rejected even for their own client. The caller's firm must own `clientId`,
 * and the transaction's `client_id = clientId` filter additionally scopes the ROWS,
 * so one client's voucher can't be posted under another's id. Ids not under this
 * client (or absent) come back as a "找不到" failure so the UI never leaves them
 * stuck in the pre-post state.
 */
export async function postJournalEntries(
  clientId: string,
  entryIds: string[],
  options?: JournalEntryServiceOptions,
): Promise<PostResult[]> {
  const { supabase, userId } = await resolveAuth(options);

  // Staff-only, firm-scoped: posting finalizes vouchers with permanent numbers
  // (a firm-staff action), and the Drizzle writes below bypass RLS, so this app
  // check IS the role + firm boundary. The in-transaction client_id filter
  // additionally row-scopes the entries.
  await assertStaffCanAccessClient(supabase, userId, clientId);

  if (entryIds.length === 0) return [];
  if (entryIds.length > MAX_POST_BATCH) {
    throw new Error(
      `一次最多可過帳 ${MAX_POST_BATCH} 筆，請分批選取後再過帳。`,
    );
  }

  return db.transaction(async (tx) => {
    // Lock the candidate rows in the deterministic posting order (entry_date,
    // created_at), scoped to the client so a foreign id never matches.
    const entries = await tx
      .select({
        id: journalEntriesTable.id,
        status: journalEntriesTable.status,
        voucher_no: journalEntriesTable.voucher_no,
        entry_date: journalEntriesTable.entry_date,
      })
      .from(journalEntriesTable)
      .where(
        and(
          eq(journalEntriesTable.client_id, clientId),
          inArray(journalEntriesTable.id, entryIds),
        ),
      )
      .orderBy(journalEntriesTable.entry_date, journalEntriesTable.created_at)
      .for("update");

    if (entries.length === 0) {
      return entryIds.map((id) => ({ entry_id: id, voucher_no: null, error: "找不到" }));
    }
    const foundIds = new Set(entries.map((e) => e.id));

    // Preload line sums (balance) and closed years — one aggregate query each, no
    // N+1. An entry absent from sumByEntry has no lines → reads as unbalanced.
    const sumRows = await tx
      .select({
        journal_entry_id: journalEntryLinesTable.journal_entry_id,
        debit: sql<string>`COALESCE(SUM(${journalEntryLinesTable.debit}), 0)`,
        credit: sql<string>`COALESCE(SUM(${journalEntryLinesTable.credit}), 0)`,
      })
      .from(journalEntryLinesTable)
      .where(
        inArray(
          journalEntryLinesTable.journal_entry_id,
          entries.map((e) => e.id),
        ),
      )
      .groupBy(journalEntryLinesTable.journal_entry_id);
    const sumByEntry = new Map(
      sumRows.map((r) => [
        r.journal_entry_id,
        { debit: Number(r.debit), credit: Number(r.credit) },
      ]),
    );

    const closedRows = await tx
      .select({ year: fiscalYearClosesTable.gregorian_year })
      .from(fiscalYearClosesTable)
      .where(eq(fiscalYearClosesTable.client_id, clientId));
    const closedYears = new Set(closedRows.map((r) => r.year));

    const results: PostResult[] = [];
    for (const e of entries) {
      // (2) Idempotent: an already-posted / reversed entry returns its number.
      if (e.status !== "draft") {
        results.push({ entry_id: e.id, voucher_no: e.voucher_no, error: null });
        continue;
      }
      // (2) Balance — must pass before consuming a number.
      const sums = sumByEntry.get(e.id) ?? { debit: 0, credit: 0 };
      if (sums.debit !== sums.credit || sums.debit === 0) {
        results.push({ entry_id: e.id, voucher_no: null, error: "借貸不平衡" });
        continue;
      }
      // (2) Fiscal-year close guard — reject an entry_date in a closed year.
      const year = Number(e.entry_date.slice(0, 4));
      if (closedYears.has(year)) {
        results.push({ entry_id: e.id, voucher_no: null, error: "該年度已關帳" });
        continue;
      }

      // (1) Atomic seq consume: INSERT … ON CONFLICT increments next_seq and
      // RETURNs the value just used (next_seq-1). First post on a date → 1.
      const [{ seq }] = await tx
        .insert(voucherSequencesTable)
        .values({ client_id: clientId, seq_date: e.entry_date, next_seq: 2 })
        .onConflictDoUpdate({
          target: [voucherSequencesTable.client_id, voucherSequencesTable.seq_date],
          set: { next_seq: sql`${voucherSequencesTable.next_seq} + 1` },
        })
        .returning({ seq: sql<number>`${voucherSequencesTable.next_seq} - 1` });

      const vno = `${e.entry_date.replaceAll("-", "")}-${String(seq).padStart(5, "0")}`;

      // (4) Cannot fail: row is locked, all CHECKs already satisfied.
      await tx
        .update(journalEntriesTable)
        .set({
          status: "posted",
          voucher_no: vno,
          posted_at: sql`now()`,
          posted_by: userId,
          updated_at: sql`now()`,
        })
        .where(eq(journalEntriesTable.id, e.id));

      results.push({ entry_id: e.id, voucher_no: vno, error: null });
    }

    // Ids not under this client (or nonexistent) — surface as failures so the UI
    // doesn't render them stuck in the pre-post state.
    for (const id of entryIds) {
      if (!foundIds.has(id)) {
        results.push({ entry_id: id, voucher_no: null, error: "找不到" });
      }
    }

    return results;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// In-place edit (§5.6.1 B1b) + draft delete
// ───────────────────────────────────────────────────────────────────────────

/** Header fields a staff edit may change. `voucher_no` / `posted_*` / `created_*`
 * stay immutable — a posted voucher keeps its permanent number and posting metadata. */
export type EntryPatch = Partial<
  Pick<JournalEntry, "voucher_type" | "entry_date" | "description">
>;

/** A replacement line. `line_number` is assigned by position, so callers pass the
 * lines in display order without numbering them. */
export type EditEntryLine = {
  account_code: string;
  debit: number;
  credit: number;
  description: string | null;
};

// editEntry / editEntryAction are reachable as a Server Action, so the inputs must
// be validated server-side — a caller can bypass the form's client-side rules and
// post arbitrary JSON. The DB CHECKs catch debit/credit XOR + non-negativity, but a
// malformed entry_date or non-integer amount should fail loud at the boundary
// (parse-first convention, like updateInvoiceSchema). An absent optional key is
// preserved (Zod doesn't inject `undefined`), so `"description" in patch` still
// distinguishes "clear it" (null) from "leave it" (absent).
const editEntryPatchSchema = z.object({
  voucher_type: z.enum(VOUCHER_TYPE).optional(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式錯誤 (YYYY-MM-DD)").optional(),
  description: z.string().nullable().optional(),
});

const editEntryLinesSchema = z
  .array(
    z
      .object({
        account_code: z.string().regex(ACCOUNT_CODE_REGEX, "科目代碼為 4–6 位數字"),
        debit: z.number().int().nonnegative(),
        credit: z.number().int().nonnegative(),
        description: z.string().nullable(),
      })
      .refine((l) => (l.debit > 0) !== (l.credit > 0), {
        message: "借方與貸方只能擇一為正",
      }),
  )
  .min(2, "至少 2 行");

/**
 * Edit a journal entry's header + lines in place, inside one Drizzle transaction.
 * A SINGLE path for both draft and posted entries — the only difference is the
 * audit trail, which is written iff the locked entry is `posted` (a posted edit
 * is a permanent change to a numbered voucher, so §3.9 makes the `before`
 * snapshot + reason mandatory; draft edits are pre-posting scratch and are not
 * audited, matching the demo store and `upsertDraftEntry`).
 *
 * Authorization mirrors `postJournalEntries`: the Drizzle writes bypass RLS, so
 * `assertStaffCanAccessClient` is the role + firm boundary and the in-transaction
 * `client_id = clientId` filter row-scopes the entry (a foreign id → "找不到傳票").
 *
 * Guards (all before any write): inputs parse (Zod); entry must exist under the
 * client; a `reversed` entry or a reversal voucher (`reverses_entry_id` set) is
 * immutable; a posted voucher's `entry_date` can't change (its voucher_no is
 * derived from the booked date — move the date via reverse + re-book instead); the
 * entry_date's fiscal year — current and, for drafts, the target — must be open;
 * the new lines must balance.
 */
export async function editEntry(
  clientId: string,
  entryId: string,
  patch: EntryPatch,
  newLines: EditEntryLine[],
  reason: string,
  options?: JournalEntryServiceOptions,
): Promise<void> {
  const { supabase, userId } = await resolveAuth(options);
  await assertStaffCanAccessClient(supabase, userId, clientId);

  const parsedPatch = editEntryPatchSchema.parse(patch);
  const parsedLines = editEntryLinesSchema.parse(newLines);
  if (!isLinesBalanced(parsedLines)) {
    throw new Error("借貸不平衡，無法儲存");
  }

  await db.transaction(async (tx) => {
    const [entry] = await tx
      .select({
        id: journalEntriesTable.id,
        firm_id: journalEntriesTable.firm_id,
        status: journalEntriesTable.status,
        voucher_type: journalEntriesTable.voucher_type,
        entry_date: journalEntriesTable.entry_date,
        description: journalEntriesTable.description,
        reverses_entry_id: journalEntriesTable.reverses_entry_id,
      })
      .from(journalEntriesTable)
      .where(
        and(
          eq(journalEntriesTable.id, entryId),
          eq(journalEntriesTable.client_id, clientId),
        ),
      )
      .for("update")
      .limit(1);

    if (!entry) throw new Error("找不到傳票");
    if (entry.status === "reversed") {
      throw new Error("已沖銷的傳票不可編輯");
    }
    // A reversal voucher (status='posted', reverses_entry_id set) auto-offsets its
    // original — distinct row from the reversed original above. Editing its lines
    // would break that offset, so it's immutable.
    if (entry.reverses_entry_id != null) {
      throw new Error("沖銷分錄不可編輯");
    }
    const isPosted = entry.status === "posted";
    // A posted voucher's number encodes its booked date (YYYYMMDD-NNNNN), so the
    // date is frozen once posted — correct it via reverse + re-book, not in place.
    if (isPosted && parsedPatch.entry_date && parsedPatch.entry_date !== entry.entry_date) {
      throw new Error("已過帳的傳票不可修改記帳日期");
    }

    // Fiscal-year guard: reject if the entry sits in — or the edit would move it
    // into — a closed year. Editing a closed-year book is forbidden either way.
    const closedRows = await tx
      .select({ year: fiscalYearClosesTable.gregorian_year })
      .from(fiscalYearClosesTable)
      .where(eq(fiscalYearClosesTable.client_id, clientId));
    const closedYears = new Set(closedRows.map((r) => r.year));
    const oldYear = Number(entry.entry_date.slice(0, 4));
    const newYear = Number((parsedPatch.entry_date ?? entry.entry_date).slice(0, 4));
    if (closedYears.has(oldYear) || closedYears.has(newYear)) {
      throw new Error("該年度已關帳，無法編輯");
    }

    // The next header values (only the editable fields). `null` description clears
    // it; an absent key keeps the old value.
    const nextVoucherType = parsedPatch.voucher_type ?? entry.voucher_type;
    const nextEntryDate = parsedPatch.entry_date ?? entry.entry_date;
    const nextDescription =
      "description" in parsedPatch ? (parsedPatch.description ?? null) : entry.description;

    // Snapshot the pre-edit state BEFORE mutating, for the audit `before`. Only
    // posted edits are audited, so the read is skipped for drafts.
    let before: ReturnType<typeof beforeSnapshotSchema.parse> | null = null;
    if (isPosted) {
      const reasonText = reason.trim();
      if (!reasonText) throw new Error("修改已過帳傳票必須填寫原因");

      const oldLines = await tx
        .select({
          line_number: journalEntryLinesTable.line_number,
          account_code: journalEntryLinesTable.account_code,
          debit: journalEntryLinesTable.debit,
          credit: journalEntryLinesTable.credit,
          description: journalEntryLinesTable.description,
        })
        .from(journalEntryLinesTable)
        .where(eq(journalEntryLinesTable.journal_entry_id, entryId))
        .orderBy(journalEntryLinesTable.line_number);

      // A posted edit writes a permanent audit row, so reject a no-op (a reason
      // typed without changing anything) rather than pollute the history. Compare
      // the next header + lines against the current ones positionally.
      const headerUnchanged =
        nextVoucherType === entry.voucher_type &&
        nextEntryDate === entry.entry_date &&
        (nextDescription ?? null) === (entry.description ?? null);
      const linesUnchanged =
        oldLines.length === parsedLines.length &&
        parsedLines.every(
          (l, i) =>
            oldLines[i].account_code === l.account_code &&
            oldLines[i].debit === l.debit &&
            oldLines[i].credit === l.credit &&
            (oldLines[i].description ?? null) === (l.description ?? null),
        );
      if (headerUnchanged && linesUnchanged) {
        throw new Error("內容未變更，無需記錄修改");
      }

      before = beforeSnapshotSchema.parse({
        entry: {
          voucher_type: entry.voucher_type,
          entry_date: entry.entry_date,
          description: entry.description,
        },
        lines: oldLines,
      });
    }

    // Header patch (only the editable fields) + replace lines wholesale.
    await tx
      .update(journalEntriesTable)
      .set({
        voucher_type: nextVoucherType,
        entry_date: nextEntryDate,
        description: nextDescription,
        updated_at: sql`now()`,
      })
      .where(eq(journalEntriesTable.id, entryId));

    await tx
      .delete(journalEntryLinesTable)
      .where(eq(journalEntryLinesTable.journal_entry_id, entryId));

    await tx.insert(journalEntryLinesTable).values(
      parsedLines.map((line, idx) => ({
        journal_entry_id: entryId,
        line_number: idx + 1,
        account_code: line.account_code,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
      })),
    );

    if (isPosted) {
      await tx.insert(auditTrailsTable).values({
        firm_id: entry.firm_id,
        entity_table: "journal_entries",
        entity_id: entryId,
        action: "updated",
        before,
        reason: reason.trim(),
        actor_id: userId,
      });
    }
  });
}

/**
 * Delete a DRAFT journal entry (lines cascade via the FK). Posted / reversed
 * entries are immutable bookkeeping records — they are unwound through reverse
 * (Phase 10), never deleted — so this rejects any non-draft status. Same
 * firm-scope + row-scope boundary as `editEntry`.
 */
export async function deleteDraftEntry(
  clientId: string,
  entryId: string,
  options?: JournalEntryServiceOptions,
): Promise<void> {
  const { supabase, userId } = await resolveAuth(options);
  await assertStaffCanAccessClient(supabase, userId, clientId);

  await db.transaction(async (tx) => {
    const [entry] = await tx
      .select({
        id: journalEntriesTable.id,
        status: journalEntriesTable.status,
      })
      .from(journalEntriesTable)
      .where(
        and(
          eq(journalEntriesTable.id, entryId),
          eq(journalEntriesTable.client_id, clientId),
        ),
      )
      .for("update")
      .limit(1);

    if (!entry) throw new Error("找不到傳票");
    if (entry.status !== "draft") {
      throw new Error("僅草稿可刪除，已過帳 / 已沖銷的傳票請改用沖銷");
    }

    await tx
      .delete(journalEntriesTable)
      .where(eq(journalEntriesTable.id, entryId));
  });
}
