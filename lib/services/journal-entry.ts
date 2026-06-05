// NOT a Server Action module (intentionally no 'use server'). confirmInvoiceEntry /
// confirmAllowanceEntry are internal helpers, called only by updateInvoice /
// updateAllowance on the server. Marking this 'use server' would expose them as
// public endpoints; since they accept an injected userId, a client could then
// pass an arbitrary id and bypass the assertCallerCanAccessClient RLS check.

import { eq, sql } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { db, type Tx } from "@/lib/db/drizzle";
import { assertCallerCanAccessClient } from "@/lib/db/rls";
import {
  journal_entries as journalEntriesTable,
  journal_entry_lines as journalEntryLinesTable,
} from "@/lib/db/schema";
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
  shouldCreateEntry,
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
 * Generate (or regenerate) the draft journal entry for a confirmed invoice.
 * Idempotent and safe to call on every confirmed-state save. Returns the
 * entry id, or `null` when the invoice produces no entry (作廢 / 彙加 / 銷項
 * 零稅率·免稅) or is not in `confirmed` status.
 */
export async function confirmInvoiceEntry(
  invoiceId: string,
  options?: JournalEntryServiceOptions,
): Promise<string | null> {
  const { supabase, userId } = await resolveAuth(options);

  const { data: row, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (error) throw error;
  if (!row) throw new Error(`confirmInvoiceEntry: invoice ${invoiceId} not found`);

  // Only confirmed, entry-producing invoices yield a voucher.
  if (row.status !== "confirmed") return null;
  if (!row.document_id) {
    throw new Error(`confirmInvoiceEntry: invoice ${invoiceId} has no document_id`);
  }

  const invoice = rowToInvoice(row);
  if (!shouldCreateEntry(invoice)) return null;

  const computed = computeEntryFromInvoice(invoice);

  return db.transaction(async (tx) => {
    await assertCallerCanAccessClient(tx, userId, invoice.client_id);
    return upsertDraftEntry(tx, {
      firmId: invoice.firm_id,
      clientId: invoice.client_id,
      documentId: row.document_id!,
      computed,
      userId,
    });
  });
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

/**
 * Generate (or regenerate) the draft journal entry for a confirmed allowance.
 * Mirrors the original invoice's entry when `original_invoice_id` resolves; when
 * it is NULL, applies the default rule (進項折讓 → 7044 其他收入 /
 * 銷項折讓 → 4101 營業收入; tax line only when taxAmount > 0). Idempotent.
 */
export async function confirmAllowanceEntry(
  allowanceId: string,
  options?: JournalEntryServiceOptions,
): Promise<string | null> {
  const { supabase, userId } = await resolveAuth(options);

  const { data: row, error } = await supabase
    .from("allowances")
    .select("*")
    .eq("id", allowanceId)
    .single();
  if (error) throw error;
  if (!row) throw new Error(`confirmAllowanceEntry: allowance ${allowanceId} not found`);

  if (row.status !== "confirmed") return null;
  if (!row.document_id) {
    throw new Error(`confirmAllowanceEntry: allowance ${allowanceId} has no document_id`);
  }

  const allowance = rowToAllowance(row);

  const computed =
    allowance.original_invoice_id == null
      ? computeDefaultEntryFromAllowance(allowance)
      : computeEntryFromAllowance(
          allowance,
          await getComputedEntryForInvoice(supabase, allowance.original_invoice_id),
        );

  return db.transaction(async (tx) => {
    await assertCallerCanAccessClient(tx, userId, allowance.client_id);
    return upsertDraftEntry(tx, {
      firmId: allowance.firm_id,
      clientId: allowance.client_id,
      documentId: row.document_id!,
      computed,
      userId,
    });
  });
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
 * Freshness summary for a period's draft journal entries plus the run-state
 * flag — the single query the period UI reads (and polls while a run is in
 * flight). Set-based: transfers no document rows regardless of period size, so
 * it scales to ~10k-doc periods.
 *
 * Freshness rides two existing clocks: `journal_entries.updated_at` (stamped on
 * every (re)generation) and `documents.updated_at` (bumped by the
 * `sync_documents_cache_from_*` trigger on `extracted_data` / `status` edits —
 * exactly the entry-affecting fields). So:
 *   MISSING ⟺ a confirmed entry-producing doc has no journal_entries row
 *   STALE   ⟺ its draft entry exists and documents.updated_at > entry.updated_at
 * Posted entries are excluded from STALE (a stale posted entry is a Phase 9
 * edit concern, not a draft regeneration).
 *
 * The `produces_entry` SQL filter mirrors `shouldCreateEntry` for invoices
 * (作廢 / 彙加, and 銷項 零稅率·免稅 produce no entry); allowances always attempt
 * one. KEEP IN SYNC with `shouldCreateEntry` (parity test in the integration
 * suite).
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
    SELECT
      (SELECT voucher_generation_status
         FROM tax_filing_periods
        WHERE id = ${periodId}) AS generation_status,
      count(*) FILTER (
        WHERE c.produces_entry AND je.document_id IS NULL
      ) AS missing,
      count(*) FILTER (
        WHERE c.produces_entry
          AND je.status = 'draft'
          AND doc.updated_at > je.updated_at
      ) AS stale,
      max(je.updated_at) AS last_generated
    FROM classified c
    JOIN documents doc ON doc.id = c.document_id
    LEFT JOIN journal_entries je ON je.document_id = c.document_id
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
