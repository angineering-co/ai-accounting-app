import { eq, sql } from "drizzle-orm";

import { db, type Tx } from "@/lib/db/drizzle";
import { assertCallerCanAccessClient } from "@/lib/db/rls";
import {
  journal_entries as journalEntriesTable,
  journal_entry_lines as journalEntryLinesTable,
  invoices as invoicesTable,
  allowances as allowancesTable,
} from "@/lib/db/schema";
import type { VoucherType } from "@/lib/domain/journal-entry";
import type { Allowance, Invoice } from "@/lib/domain/models";
import {
  computeEntryFromInvoice,
  computeEntryFromAllowance,
  pickSettlementAccount,
  ACCT_INPUT_TAX,
  ACCT_OUTPUT_TAX,
  ACCT_REVENUE,
  type ComputedEntry,
} from "@/lib/services/journal-entry-generation";

// ---------------------------------------------------------------------------
// Phase 7 — wire the Phase 4 pure functions to the DB.
//
// Confirming an invoice / allowance generates a `draft` journal entry + lines
// atomically (entry header + line replacement in one `db.transaction()`). These
// are NOT the doc's PL/pgSQL RPCs: Phase 6.5 moved every atomic write to Drizzle
// app-layer transactions (see VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md §Phase 6.5).
//
// The compute step is pure (`journal-entry-generation.ts`); this module only
// reads the source row, runs the pure function, and writes the result.
// ---------------------------------------------------------------------------

export type SyncEntryResult = { status: "ok" | "skipped" };

// Fallback accounts when an allowance has no resolvable original invoice entry
// (§5.2.2). Per accountant guidance the draft is generated with a default account
// rather than prompting staff: 進項折讓 books the credit to 7044 其他收入, 銷項折讓
// books the debit to 4101 營業收入. The settlement channel follows the §5.1
// threshold on the allowance total. Staff can adjust the draft before posting.
const FALLBACK_INPUT_ACCOUNT = "7044"; // 其他收入
const FALLBACK_OUTPUT_ACCOUNT = ACCT_REVENUE; // 4101 營業收入

// 作廢 / 彙加 never post entries; 銷項 零稅率 / 免稅 are unsupported in v1 (the
// pure function throws on all of these). Pre-filter so a legitimately-skipped
// invoice doesn't surface a thrown error during confirm.
function isInvoiceEntryEligible(invoice: Invoice): boolean {
  const taxType = invoice.extracted_data?.taxType;
  if (taxType === "作廢" || taxType === "彙加") return false;
  if (invoice.in_or_out === "out" && (taxType === "零稅率" || taxType === "免稅")) {
    return false;
  }
  return true;
}

type InvoiceRow = typeof invoicesTable.$inferSelect;
type AllowanceRow = typeof allowancesTable.$inferSelect;
type EntryRow = typeof journalEntriesTable.$inferSelect;
type LineRow = typeof journalEntryLinesTable.$inferSelect;

// The pure functions take the domain `Invoice` / `Allowance` shape. Drizzle rows
// carry the same data plus a few columns the domain types omit (e.g. document_id);
// map across, coercing nullable text columns the row guarantees at this point.
function toInvoiceDomain(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    firm_id: row.firm_id,
    client_id: row.client_id!,
    storage_path: row.storage_path,
    filename: row.filename,
    in_or_out: row.in_or_out as Invoice["in_or_out"],
    status: row.status as Invoice["status"],
    extracted_data: (row.extracted_data ?? null) as Invoice["extracted_data"],
    invoice_serial_code: row.invoice_serial_code,
    year_month: row.year_month,
    tax_filing_period_id: row.tax_filing_period_id,
    uploaded_by: row.uploaded_by,
    created_at: new Date(row.created_at!),
  };
}

function toAllowanceDomain(row: AllowanceRow): Allowance {
  return {
    id: row.id,
    firm_id: row.firm_id,
    client_id: row.client_id!,
    tax_filing_period_id: row.tax_filing_period_id,
    allowance_serial_code: row.allowance_serial_code,
    original_invoice_serial_code: row.original_invoice_serial_code,
    original_invoice_id: row.original_invoice_id,
    in_or_out: row.in_or_out as Allowance["in_or_out"],
    storage_path: row.storage_path,
    filename: row.filename,
    status: row.status as Allowance["status"],
    extracted_data: (row.extracted_data ?? null) as Allowance["extracted_data"],
    uploaded_by: row.uploaded_by,
    created_at: new Date(row.created_at!),
  };
}

// Rebuild the `ComputedEntry` shape from a stored entry + lines so the allowance
// mirror (Decision #13) can reverse the *actual* posted/draft accounts — works
// for both draft and posted originals.
function reconstructComputedEntry(entry: EntryRow, lines: LineRow[]): ComputedEntry {
  return {
    voucher_type: entry.voucher_type as VoucherType,
    entry_date: entry.entry_date,
    description: entry.description,
    lines: [...lines]
      .sort((a, b) => a.line_number - b.line_number)
      .map((l) => ({
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
  };
}

// When no original entry exists (§5.2.2), synthesize a minimal one carrying the
// default fallback account in the right role so the mirror
// (`computeEntryFromAllowance`) can reverse it. The mirror reads only account
// codes + line structure (Dr/Cr counts), so amounts/date/voucher_type here are
// placeholders; the settlement channel follows the §5.1 threshold on the
// allowance total. A separate tax line is included only when the allowance
// carries tax (a deductible original would have had one).
function synthesizeOriginalEntry(allowance: Allowance): ComputedEntry {
  const data = allowance.extracted_data ?? {};
  const taxAmount = data.taxAmount ?? 0;
  const settlementCode = pickSettlementAccount((data.amount ?? 0) + taxAmount);

  if (allowance.in_or_out === "in") {
    const lines =
      taxAmount > 0
        ? [
            { account_code: FALLBACK_INPUT_ACCOUNT, debit: 1, credit: 0, description: null },
            { account_code: ACCT_INPUT_TAX, debit: 1, credit: 0, description: null },
            { account_code: settlementCode, debit: 0, credit: 1, description: null },
          ]
        : [
            { account_code: FALLBACK_INPUT_ACCOUNT, debit: 1, credit: 0, description: null },
            { account_code: settlementCode, debit: 0, credit: 1, description: null },
          ];
    return { voucher_type: "支出", entry_date: "1970-01-01", description: null, lines };
  }

  // 銷項: extractOutputInvoiceRoles wants exactly 1 Dr (settlement) line.
  const lines =
    taxAmount > 0
      ? [
          { account_code: settlementCode, debit: 1, credit: 0, description: null },
          { account_code: FALLBACK_OUTPUT_ACCOUNT, debit: 0, credit: 1, description: null },
          { account_code: ACCT_OUTPUT_TAX, debit: 0, credit: 1, description: null },
        ]
      : [
          { account_code: settlementCode, debit: 1, credit: 0, description: null },
          { account_code: FALLBACK_OUTPUT_ACCOUNT, debit: 0, credit: 1, description: null },
        ];
  return { voucher_type: "收入", entry_date: "1970-01-01", description: null, lines };
}

// Create-or-replace a draft entry keyed on document_id (UNIQUE). Idempotent:
// same inputs → same entry header (id preserved) + identical lines.
async function upsertDraftEntryTx(
  tx: Tx,
  args: {
    documentId: string;
    firmId: string;
    clientId: string;
    userId: string;
    computed: ComputedEntry;
  },
): Promise<string> {
  const { documentId, firmId, clientId, userId, computed } = args;

  // Serialize concurrent writes to the same document's entry (e.g. a double
  // confirm click). `_xact_` auto-releases at COMMIT/ROLLBACK. Same pattern as
  // commitInvoiceRowsAtomically in invoice-import.ts.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`entry:doc:${documentId}`}, 0))`,
  );

  const [existing] = await tx
    .select({ id: journalEntriesTable.id, status: journalEntriesTable.status })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.document_id, documentId))
    .for("update");

  let entryId: string;
  if (!existing) {
    const [inserted] = await tx
      .insert(journalEntriesTable)
      .values({
        firm_id: firmId,
        client_id: clientId,
        document_id: documentId,
        voucher_no: null,
        voucher_type: computed.voucher_type,
        entry_date: computed.entry_date,
        description: computed.description,
        status: "draft",
        created_by: userId,
      })
      .returning({ id: journalEntriesTable.id });
    entryId = inserted.id;
  } else {
    // Only a draft entry may be regenerated. Posted / reversed entries are
    // immutable here — Phase 9 (edit_posted_entry) owns posted edits.
    if (existing.status !== "draft") {
      throw new Error(
        `cannot regenerate entry for document ${documentId}: status is '${existing.status}', not 'draft'`,
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
  }

  await tx.insert(journalEntryLinesTable).values(
    computed.lines.map((line, i) => ({
      journal_entry_id: entryId,
      line_number: i + 1,
      account_code: line.account_code,
      debit: Math.round(line.debit),
      credit: Math.round(line.credit),
      description: line.description,
    })),
  );

  return entryId;
}

// ---------------------------------------------------------------------------
// In-transaction cores. These do the eligibility/compute/write but NOT the
// fetch or the authorization — the caller must already be inside a tx, have run
// `assertCallerCanAccessClient`, and pass the just-read/just-written row. This
// lets the confirm flow (`updateInvoice` / `updateAllowance`) flip status and
// generate the entry in ONE transaction, so a confirmed-and-eligible row can
// never be left without its entry.
//
// (A thin persistence/mapping layer that hides the Drizzle row types is
// deferred to Phase 8, when post/edit/reverse add more callers.)
// ---------------------------------------------------------------------------

/**
 * Generate (or regenerate) the draft entry for a confirmed invoice row, inside
 * the caller's transaction. Skips invoices with no v1 entry (作廢 / 彙加 / 銷項
 * 零稅率·免稅). Throws if the existing entry is already posted (Phase 9 territory).
 */
export async function writeInvoiceEntryInTx(
  tx: Tx,
  row: InvoiceRow,
  userId: string,
): Promise<SyncEntryResult> {
  if (!row.client_id) {
    throw new Error(`writeInvoiceEntryInTx: invoice ${row.id} has no client_id`);
  }
  // document_id is NOT NULL since Phase 6b; defend anyway (fail loud).
  if (!row.document_id) {
    throw new Error(`writeInvoiceEntryInTx: invoice ${row.id} has no document_id`);
  }

  const invoice = toInvoiceDomain(row);
  if (!isInvoiceEntryEligible(invoice)) return { status: "skipped" };

  const computed = computeEntryFromInvoice(invoice);
  await upsertDraftEntryTx(tx, {
    documentId: row.document_id,
    firmId: row.firm_id,
    clientId: row.client_id,
    userId,
    computed,
  });
  return { status: "ok" };
}

/**
 * Generate (or regenerate) the draft entry for a confirmed allowance row by
 * mirroring the original invoice's entry (Decision #13), inside the caller's
 * transaction. When the original entry can't be resolved (no link, or the
 * original has no entry yet), it falls back to a synthesized original carrying
 * the default fallback account (§5.2.2) so confirm always produces a draft.
 * Throws if the existing entry is already posted.
 */
export async function writeAllowanceEntryInTx(
  tx: Tx,
  row: AllowanceRow,
  userId: string,
): Promise<SyncEntryResult> {
  if (!row.client_id) {
    throw new Error(`writeAllowanceEntryInTx: allowance ${row.id} has no client_id`);
  }
  if (!row.document_id) {
    throw new Error(`writeAllowanceEntryInTx: allowance ${row.id} has no document_id`);
  }

  const allowance = toAllowanceDomain(row);

  // Resolve the original invoice's entry:
  // allowance.original_invoice_id → invoices.document_id → journal_entries.
  let originalComputed: ComputedEntry | null = null;
  if (row.original_invoice_id) {
    const [origInvoice] = await tx
      .select({ document_id: invoicesTable.document_id })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, row.original_invoice_id))
      .limit(1);

    if (origInvoice?.document_id) {
      const [origEntry] = await tx
        .select()
        .from(journalEntriesTable)
        .where(eq(journalEntriesTable.document_id, origInvoice.document_id))
        .limit(1);

      if (origEntry) {
        const origLines = await tx
          .select()
          .from(journalEntryLinesTable)
          .where(eq(journalEntryLinesTable.journal_entry_id, origEntry.id));
        originalComputed = reconstructComputedEntry(origEntry, origLines);
      }
    }
  }

  if (!originalComputed) {
    originalComputed = synthesizeOriginalEntry(allowance);
  }

  const computed = computeEntryFromAllowance(allowance, originalComputed);
  await upsertDraftEntryTx(tx, {
    documentId: row.document_id,
    firmId: row.firm_id,
    clientId: row.client_id,
    userId,
    computed,
  });
  return { status: "ok" };
}

/**
 * Standalone "(re)generate the draft entry for this invoice id" — opens its own
 * transaction, authorizes, and delegates to {@link writeInvoiceEntryInTx}. Used
 * by tests and any programmatic re-generation; the confirm flow uses the in-tx
 * core directly so the status flip and entry share one transaction.
 */
export async function syncInvoiceJournalEntry(
  invoiceId: string,
  userId: string,
): Promise<SyncEntryResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId))
      .limit(1);

    if (!row) throw new Error(`syncInvoiceJournalEntry: invoice ${invoiceId} not found`);
    if (!row.client_id) {
      throw new Error(`syncInvoiceJournalEntry: invoice ${invoiceId} has no client_id`);
    }
    await assertCallerCanAccessClient(tx, userId, row.client_id);
    return writeInvoiceEntryInTx(tx, row, userId);
  });
}

/**
 * Standalone counterpart of {@link syncInvoiceJournalEntry} for allowances.
 */
export async function syncAllowanceJournalEntry(
  allowanceId: string,
  userId: string,
): Promise<SyncEntryResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(allowancesTable)
      .where(eq(allowancesTable.id, allowanceId))
      .limit(1);

    if (!row) throw new Error(`syncAllowanceJournalEntry: allowance ${allowanceId} not found`);
    if (!row.client_id) {
      throw new Error(`syncAllowanceJournalEntry: allowance ${allowanceId} has no client_id`);
    }
    await assertCallerCanAccessClient(tx, userId, row.client_id);
    return writeAllowanceEntryInTx(tx, row, userId);
  });
}
