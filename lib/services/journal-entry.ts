// NOT a Server Action module (intentionally no 'use server'). The exports here
// accept an injected userId / supabase client (for tests and internal
// composition); marking this 'use server' would expose them as public endpoints
// where a client could pass an arbitrary userId and skip the firm-scope
// authorization these helpers perform via an RLS-bounded period read. The UI
// reaches the period-batch helpers (getPeriodEntryStatus /
// generateDraftEntriesByPeriod) through the thin 'use server' wrappers in
// lib/services/voucher-generation.ts.

import { and, eq, lt, or, sql } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { db, type Tx } from "@/lib/db/drizzle";
import {
  journal_entries as journalEntriesTable,
  journal_entry_lines as journalEntryLinesTable,
  tax_filing_periods as taxFilingPeriodsTable,
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
import type { VoucherType } from "@/lib/domain/journal-entry";
import {
  type ComputedEntry,
  computeDefaultEntryFromAllowance,
  computeEntryFromAllowance,
  computeEntryFromInvoice,
} from "@/lib/services/journal-entry-generation";

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
 * per confirmed document in the period, each carrying a `verdict`:
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
function periodEntryVerdicts(periodId: string) {
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
           END AS verdict,
           je.updated_at AS entry_updated_at
      FROM classified c
      JOIN documents doc ON doc.id = c.document_id
      LEFT JOIN journal_entries je ON je.document_id = c.document_id
  )`;
}

/**
 * Freshness summary for a period's draft journal entries plus the run-state flag —
 * the single query the period UI reads (and polls while a run is in flight). Rolls
 * the shared `periodEntryVerdicts` relation into counts:
 *   MISSING = verdict 'new'   (confirmed entry-producing doc with no entry)
 *   STALE   = verdict 'stale' (draft entry older than the doc's last edit)
 * Set-based: transfers no document rows regardless of period size, so it scales to
 * ~10k-doc periods.
 */
export async function getPeriodEntryStatus(
  periodId: string,
  options?: JournalEntryServiceOptions,
): Promise<PeriodEntryStatus> {
  const { supabase } = await resolveAuth(options);

  // Authorize through the RLS-enforced client: a user only sees their firm's
  // periods, so a missing row means no access. The aggregate below runs through
  // Drizzle (which bypasses RLS), so this read is the firm-scope boundary.
  const { data: period, error } = await supabase
    .from("tax_filing_periods")
    .select("id")
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw error;
  if (!period) {
    throw new Error(
      `getPeriodEntryStatus: period ${periodId} not found or not accessible`,
    );
  }

  const result = await db.execute(sql`
    SELECT
      (SELECT voucher_generation_status
         FROM tax_filing_periods
        WHERE id = ${periodId}) AS generation_status,
      count(*) FILTER (WHERE w.verdict = 'new')   AS missing,
      count(*) FILTER (WHERE w.verdict = 'stale') AS stale,
      max(w.entry_updated_at) AS last_generated
    FROM ${periodEntryVerdicts(periodId)} w
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

// A document the SQL `periodEntryVerdicts` relation flagged for (re)generation.
type WorkItem = { documentId: string; kind: "invoice" | "allowance"; verdict: "new" | "stale" };

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

function assertBalanced(computed: ComputedEntry, documentId: string): void {
  const debit = computed.lines.reduce((a, l) => a + l.debit, 0);
  const credit = computed.lines.reduce((a, l) => a + l.credit, 0);
  if (debit !== credit) {
    throw new Error(
      `unbalanced computed entry for document ${documentId}: debit ${debit} != credit ${credit}`,
    );
  }
}

// Per-document work-list for the period: the shared `periodEntryVerdicts` relation,
// filtered to the docs that actually need work ('new' or 'stale'). The batch then
// loads full row payload only for these, not the whole confirmed period. Computed
// once at the start of a run — generating an invoice entry never bumps an allowance's
// documents.updated_at, so every verdict stays valid for the whole run.
async function loadPeriodWorkList(periodId: string): Promise<WorkItem[]> {
  const rows = (await db.execute(sql`
    SELECT w.document_id, w.kind, w.verdict
    FROM ${periodEntryVerdicts(periodId)} w
    WHERE w.verdict IS NOT NULL
  `)) as unknown as Array<{ document_id: string; kind: string; verdict: string }>;
  return rows.map((r) => ({
    documentId: r.document_id,
    kind: r.kind as WorkItem["kind"],
    verdict: r.verdict as WorkItem["verdict"],
  }));
}

// Bulk-insert brand-new draft entries: insert the entry headers (returning ids
// keyed by document_id), then their lines. Within the mutex, this batch is the
// only writer of entries for the period, so document_id is guaranteed free.
async function bulkInsertNewEntries(items: DraftEntryItem[], userId: string): Promise<number> {
  let total = 0;
  for (let i = 0; i < items.length; i += NEW_ENTRY_CHUNK) {
    const chunk = items.slice(i, i + NEW_ENTRY_CHUNK);
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
// URL-length limit), keyed for verdict lookup. The work-list already encodes
// `produces_entry`, so no `shouldCreateEntry` re-filter is needed here.
async function processInvoices(
  supabase: SupabaseClient<Database>,
  work: WorkItem[],
  userId: string,
  result: GeneratePeriodResult,
): Promise<void> {
  if (work.length === 0) return;
  const verdictByDoc = new Map(work.map((w) => [w.documentId, w.verdict]));
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
    const verdict = documentId ? verdictByDoc.get(documentId) : undefined;
    if (!documentId || !verdict) continue;
    const invoice = rowToInvoice(row);
    let computed: ComputedEntry;
    try {
      computed = computeEntryFromInvoice(invoice);
      assertBalanced(computed, documentId);
    } catch (e) {
      result.failures.push({ documentId, kind: "invoice", reason: errorReason(e) });
      continue;
    }
    (verdict === "new" ? newItems : staleItems).push({
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
  const verdictByDoc = new Map(work.map((w) => [w.documentId, w.verdict]));
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
    const verdict = documentId ? verdictByDoc.get(documentId) : undefined;
    if (!documentId || !verdict) continue;
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
      assertBalanced(computed, documentId);
    } catch (e) {
      result.failures.push({ documentId, kind: "allowance", reason: errorReason(e) });
      continue;
    }
    (verdict === "new" ? newItems : staleItems).push({
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

  // Authorize through the RLS-enforced client (firm-scope boundary; the Drizzle
  // writes below bypass RLS).
  const { data: period, error: periodErr } = await supabase
    .from("tax_filing_periods")
    .select("id")
    .eq("id", periodId)
    .maybeSingle();
  if (periodErr) throw periodErr;
  if (!period) {
    throw new Error(
      `generateDraftEntriesByPeriod: period ${periodId} not found or not accessible`,
    );
  }

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
    // so the allowance verdicts captured here stay valid.
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
