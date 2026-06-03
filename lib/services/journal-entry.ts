'use server';

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
  invoiceProducesEntry,
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
    throw new Error(`confirmInvoiceEntry: invoice ${row.id} has no client_id`);
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
    throw new Error(`confirmAllowanceEntry: allowance ${row.id} has no client_id`);
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
  if (!invoiceProducesEntry(invoice)) return null;

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
 * Resolve the original invoice's journal entry (its computed shape) so an
 * allowance can mirror it (Decision #13). Throws if the link can't be resolved
 * — the default-rule fallback is only taken when `original_invoice_id` is NULL,
 * not when it's set but dangling.
 */
async function resolveOriginalEntry(
  supabase: SupabaseClient<Database>,
  originalInvoiceId: string,
): Promise<ComputedEntry> {
  const { data: original, error: invError } = await supabase
    .from("invoices")
    .select("document_id")
    .eq("id", originalInvoiceId)
    .maybeSingle();
  if (invError) throw invError;
  if (!original) {
    throw new Error(
      `confirmAllowanceEntry: original invoice ${originalInvoiceId} not found`,
    );
  }
  if (!original.document_id) {
    throw new Error(
      `confirmAllowanceEntry: original invoice ${originalInvoiceId} has no document_id`,
    );
  }

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .select("id, voucher_type, entry_date, description")
    .eq("document_id", original.document_id)
    .maybeSingle();
  if (entryError) throw entryError;
  if (!entry) {
    throw new Error(
      `confirmAllowanceEntry: original invoice ${originalInvoiceId} has no journal entry yet ` +
        `(confirm the original invoice first)`,
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
      `confirmAllowanceEntry: original entry ${entry.id} has no lines`,
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
          await resolveOriginalEntry(supabase, allowance.original_invoice_id),
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
