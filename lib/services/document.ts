'use server';

import { createClient } from "@/lib/supabase/server";
import {
  createDocumentSchema,
  type CreateDocumentInput,
} from "@/lib/domain/document";
import type { Database } from "@/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db, type Tx } from "@/lib/db/drizzle";
import { assertCallerCanAccessFirm } from "@/lib/db/rls";
import {
  documents as documentsTable,
  invoices as invoicesTable,
  allowances as allowancesTable,
  journal_entries as journalEntriesTable,
  tax_filing_periods as taxFilingPeriodsTable,
} from "@/lib/db/schema";

type DocumentServiceOptions = {
  supabaseClient?: SupabaseClient<Database>;
  userId?: string;
};

/**
 * Create a `documents` row — the CTI parent that records the physical facts of
 * an uploaded file. Returns the new document id.
 *
 * `options` lets a caller already inside a server action (e.g. `createInvoice`)
 * reuse its authenticated client and resolved user instead of re-deriving them.
 */
export async function createDocument(
  data: CreateDocumentInput,
  options?: DocumentServiceOptions,
): Promise<string> {
  const supabase = options?.supabaseClient ?? (await createClient());

  let userId = options?.userId;
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    userId = user.id;
  }

  const validated = createDocumentSchema.parse(data);

  const { data: document, error } = await supabase
    .from('documents')
    .insert({
      ...validated,
      created_by: userId,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) throw error;
  return document.id;
}

/**
 * Create a childless `doc_type='other'` document — the NON_VAT container for
 * files that are not 統一發票 / 折讓單 (receipts, statements, etc). Uploaded from
 * the `/documents` page; periodless, OCR skipped. `documents.filename` is the
 * source of truth for `other` docs (invoice/allowance keep theirs on the subtable).
 *
 * `doc_date` is a today placeholder, mirroring `createInvoice` / `createAllowance`
 * (which set it before OCR fills the real value); `other` docs have no OCR so it
 * stays the upload date.
 */
export async function createOtherDocument(
  input: {
    firm_id: string;
    client_id: string;
    storage_path: string;
    filename: string;
  },
  options?: DocumentServiceOptions,
): Promise<string> {
  return createDocument(
    {
      firm_id: input.firm_id,
      client_id: input.client_id,
      doc_date: new Date().toISOString().slice(0, 10),
      type: "NON_VAT",
      doc_type: "other",
      file_url: input.storage_path,
      filename: input.filename,
      ocr_status: null,
    },
    options,
  );
}

/**
 * Rename an `other` document. `documents.filename` is the source of truth for
 * `other` docs, so this is a plain column update. Guarded to `doc_type='other'`.
 */
export async function renameOtherDocument(
  documentId: string,
  filename: string,
  options?: DocumentServiceOptions,
): Promise<void> {
  const supabase = options?.supabaseClient ?? (await createClient());

  const trimmed = filename.trim();
  if (!trimmed) throw new Error("檔名不可為空");

  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("doc_type")
    .eq("id", documentId)
    .eq("status", "active")
    .single();

  if (fetchError) throw fetchError;
  if (!doc) throw new Error("Document not found");
  if (doc.doc_type !== "other") {
    throw new Error("renameOtherDocument only handles doc_type='other'");
  }

  const { error } = await supabase
    .from("documents")
    .update({ filename: trimmed })
    .eq("id", documentId);

  if (error) throw error;
}

/**
 * Soft-delete an `other` document (CTI parent records the physical fact via
 * `status`) and remove its storage object. Guarded to `doc_type='other'` so this
 * never touches a VAT document that still has a subtable. RLS confines the row to
 * the caller's firm (and the proxy confines a portal client to their own client).
 */
export async function deleteOtherDocument(
  documentId: string,
  options?: DocumentServiceOptions,
): Promise<void> {
  const supabase = options?.supabaseClient ?? (await createClient());

  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("doc_type, file_url")
    .eq("id", documentId)
    .eq("status", "active")
    .single();

  if (fetchError) throw fetchError;
  if (!doc) throw new Error("Document not found");
  if (doc.doc_type !== "other") {
    throw new Error("deleteOtherDocument only handles doc_type='other'");
  }

  const { error } = await supabase
    .from("documents")
    .update({ status: "deleted" })
    .eq("id", documentId);

  if (error) throw error;

  // `other` files are post-5.6 canonical keys — remove verbatim, no toDocumentsKey.
  if (doc.file_url) {
    const { error: storageError } = await supabase.storage
      .from("documents")
      .remove([doc.file_url]);

    if (storageError) {
      // The row is already soft-deleted; a dangling object is recoverable, so log not throw.
      console.error(
        `Failed to delete storage object ${doc.file_url}:`,
        storageError,
      );
    }
  }
}

// ── Firm-side manual re-classification (PR-1b) ───────────────────────────────
// Staff-only actions that correct an existing document's classification:
// promote (other → invoice/allowance), demote (→ other), convert
// (invoice ↔ allowance), and switch (in ↔ out). They run as Drizzle
// transactions (not PostgREST RPC) so the parent `documents` row and its
// subtable always move together. Each guards against re-classifying a document
// that has downstream commitments (a confirmed subtable or a generated 傳票).
//
// OCR is NOT triggered here. A re-classified VAT subtable is left at
// `status='uploaded'` (the same state a fresh upload sits in), so it is picked
// up by the period's existing「AI 提取」action. This keeps PR-1b off the pgmq
// queue; auto-triggering on re-classify is deferred.

type SubVatType = "invoice" | "allowance";

type Subtable = {
  id: string;
  status: string | null;
  in_or_out: string;
  storage_path: string | null;
  filename: string | null;
  tax_filing_period_id: string | null;
  extractedDataPresent: boolean;
};

async function resolveActor(options?: DocumentServiceOptions): Promise<{
  supabase: SupabaseClient<Database>;
  userId: string;
}> {
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

// Load the VAT subtable (invoice or allowance) for a document, normalized to a
// shared shape. Branching on `docType` keeps each query against a single table
// (Drizzle's column types don't unify across two `pgTable`s).
async function loadSubtable(
  tx: Tx,
  docType: SubVatType,
  documentId: string,
): Promise<Subtable | null> {
  if (docType === "invoice") {
    const [row] = await tx
      .select({
        id: invoicesTable.id,
        status: invoicesTable.status,
        in_or_out: invoicesTable.in_or_out,
        storage_path: invoicesTable.storage_path,
        filename: invoicesTable.filename,
        tax_filing_period_id: invoicesTable.tax_filing_period_id,
        extracted_data: invoicesTable.extracted_data,
      })
      .from(invoicesTable)
      .where(eq(invoicesTable.document_id, documentId))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      in_or_out: row.in_or_out,
      storage_path: row.storage_path,
      filename: row.filename,
      tax_filing_period_id: row.tax_filing_period_id,
      extractedDataPresent: row.extracted_data !== null,
    };
  }

  const [row] = await tx
    .select({
      id: allowancesTable.id,
      status: allowancesTable.status,
      in_or_out: allowancesTable.in_or_out,
      storage_path: allowancesTable.storage_path,
      filename: allowancesTable.filename,
      tax_filing_period_id: allowancesTable.tax_filing_period_id,
      extracted_data: allowancesTable.extracted_data,
    })
    .from(allowancesTable)
    .where(eq(allowancesTable.document_id, documentId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    in_or_out: row.in_or_out,
    storage_path: row.storage_path,
    filename: row.filename,
    tax_filing_period_id: row.tax_filing_period_id,
    extractedDataPresent: row.extracted_data !== null,
  };
}

// Refuse to re-classify once a document has downstream commitments: a confirmed
// subtable, or a journal entry (傳票) generated from it. A type change would
// silently invalidate either.
async function assertNoDownstreamCommitment(
  tx: Tx,
  documentId: string,
  subtableStatus: string | null,
): Promise<void> {
  if (subtableStatus === "confirmed") {
    throw new Error("文件已確認，請先取消確認再重新分類");
  }
  // OCR in flight: the worker has this subtable as its write target. Re-classifying
  // now (dropping/recreating the subtable, or resetting status) races the worker,
  // which could write stale results back to the wrong row. Make the user wait.
  if (subtableStatus === "processing") {
    throw new Error("文件正在解析中，請稍候再試");
  }
  const [entry] = await tx
    .select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.document_id, documentId))
    .limit(1);
  if (entry) {
    throw new Error("文件已產生傳票，無法重新分類");
  }
}

// Resolve a period's YYYMM, asserting it belongs to the client and is editable.
async function resolveEditablePeriodYearMonth(
  tx: Tx,
  periodId: string,
  clientId: string,
): Promise<string> {
  const [period] = await tx
    .select({
      year_month: taxFilingPeriodsTable.year_month,
      client_id: taxFilingPeriodsTable.client_id,
      status: taxFilingPeriodsTable.status,
    })
    .from(taxFilingPeriodsTable)
    .where(eq(taxFilingPeriodsTable.id, periodId))
    .limit(1);
  if (!period) throw new Error("期別不存在");
  if (period.client_id !== clientId) throw new Error("期別不屬於此客戶");
  if (period.status === "locked" || period.status === "filed") {
    throw new Error("此期別已鎖定，無法歸入文件");
  }
  return period.year_month;
}

async function loadDocumentForReclassify(
  tx: Tx,
  documentId: string,
): Promise<{
  doc_type: string;
  firm_id: string;
  client_id: string;
  file_url: string | null;
  filename: string | null;
}> {
  const [doc] = await tx
    .select({
      doc_type: documentsTable.doc_type,
      firm_id: documentsTable.firm_id,
      client_id: documentsTable.client_id,
      file_url: documentsTable.file_url,
      filename: documentsTable.filename,
    })
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId))
    .limit(1);
  if (!doc) throw new Error("Document not found");
  return doc;
}

/**
 * Flip a VAT document's direction (進項 ↔ 銷項) to an explicit `target` (not a
 * toggle, so repeated clicks settle on the same value). The extraction prompt
 * is biased by `in_or_out`, so if OCR already ran the subtable is reset to
 * `uploaded` to be re-extracted by the period's「AI 提取」action.
 */
export async function switchInOrOut(
  documentId: string,
  target: "in" | "out",
  options?: DocumentServiceOptions,
): Promise<void> {
  const { userId } = await resolveActor(options);

  await db.transaction(async (tx) => {
    const doc = await loadDocumentForReclassify(tx, documentId);
    if (doc.doc_type !== "invoice" && doc.doc_type !== "allowance") {
      throw new Error("switchInOrOut only handles invoice/allowance documents");
    }
    await assertCallerCanAccessFirm(tx, userId, doc.firm_id);

    const docType = doc.doc_type as SubVatType;
    const sub = await loadSubtable(tx, docType, documentId);
    if (!sub) throw new Error("Subtable row not found");
    await assertNoDownstreamCommitment(tx, documentId, sub.status);

    if (sub.in_or_out === target) return; // already there — idempotent no-op

    // OCR already ran → the prompt used the old direction, so the result is
    // stale: reset to 'uploaded' and clear extracted_data so no UI shows the
    // opposite-direction extraction while it waits for re-extraction. Never
    // extracted (still 'uploaded') → leave the status; it extracts under the
    // new value.
    const needsReextract = sub.extractedDataPresent;
    const table = docType === "invoice" ? invoicesTable : allowancesTable;

    await tx
      .update(table)
      .set(
        needsReextract
          ? { in_or_out: target, status: "uploaded", extracted_data: null }
          : { in_or_out: target },
      )
      .where(eq(table.id, sub.id));

    if (needsReextract) {
      await tx
        .update(documentsTable)
        .set({ ocr_status: "pending" })
        .where(eq(documentsTable.id, documentId));
    }
  });
}

/**
 * Convert a document between invoice and allowance. The wrong subtable is
 * dropped and the target subtable created in the same transaction, carrying the
 * file, direction (caller-supplied), and period; `doc_type` flips. The new
 * subtable lands at `uploaded` for the period's「AI 提取」action to extract
 * (the prompt differs per type, so the old extraction can't carry over).
 */
export async function convertDocType(
  documentId: string,
  args: { docType: SubVatType; inOrOut: "in" | "out" },
  options?: DocumentServiceOptions,
): Promise<void> {
  const { userId } = await resolveActor(options);

  await db.transaction(async (tx) => {
    const doc = await loadDocumentForReclassify(tx, documentId);
    if (doc.doc_type !== "invoice" && doc.doc_type !== "allowance") {
      throw new Error("convertDocType only converts between invoice/allowance");
    }
    if (doc.doc_type === args.docType) {
      throw new Error("文件已是目標類型");
    }
    await assertCallerCanAccessFirm(tx, userId, doc.firm_id);

    const sub = await loadSubtable(tx, doc.doc_type as SubVatType, documentId);
    if (!sub) throw new Error("Subtable row not found");
    await assertNoDownstreamCommitment(tx, documentId, sub.status);

    if (doc.doc_type === "invoice") {
      await tx.delete(invoicesTable).where(eq(invoicesTable.id, sub.id));
    } else {
      await tx.delete(allowancesTable).where(eq(allowancesTable.id, sub.id));
    }

    if (args.docType === "invoice") {
      if (!sub.storage_path) {
        throw new Error("此文件無原始檔案，無法轉為發票");
      }
      // invoices.year_month mirrors the period; derive it when one is set.
      const yearMonth = sub.tax_filing_period_id
        ? await resolveEditablePeriodYearMonth(tx, sub.tax_filing_period_id, doc.client_id)
        : null;
      await tx.insert(invoicesTable).values({
        firm_id: doc.firm_id,
        client_id: doc.client_id,
        document_id: documentId,
        storage_path: sub.storage_path,
        filename: sub.filename ?? "未命名",
        in_or_out: args.inOrOut,
        status: "uploaded",
        uploaded_by: userId,
        tax_filing_period_id: sub.tax_filing_period_id,
        year_month: yearMonth,
      });
    } else {
      await tx.insert(allowancesTable).values({
        firm_id: doc.firm_id,
        client_id: doc.client_id,
        document_id: documentId,
        storage_path: sub.storage_path,
        filename: sub.filename,
        in_or_out: args.inOrOut,
        status: "uploaded",
        uploaded_by: userId,
        tax_filing_period_id: sub.tax_filing_period_id,
      });
    }

    await tx
      .update(documentsTable)
      .set({ doc_type: args.docType, ocr_status: "pending" })
      .where(eq(documentsTable.id, documentId));
  });
}

/**
 * Convert an invoice/allowance back to a childless `other` document: drop the
 * subtable and flip the parent to NON_VAT. The subtable owned the filename, so
 * copy it onto `documents` (the source of truth for `other`); clear the OCR
 * cache. `documents.amount` is left as-is — it holds the value reviewed before
 * the convert, and the user can still edit it on the `other` document. No OCR —
 * `other` documents are never extracted.
 */
export async function convertToOther(
  documentId: string,
  options?: DocumentServiceOptions,
): Promise<void> {
  const { userId } = await resolveActor(options);

  await db.transaction(async (tx) => {
    const doc = await loadDocumentForReclassify(tx, documentId);
    if (doc.doc_type !== "invoice" && doc.doc_type !== "allowance") {
      throw new Error("convertToOther only handles invoice/allowance documents");
    }
    await assertCallerCanAccessFirm(tx, userId, doc.firm_id);

    const sub = await loadSubtable(tx, doc.doc_type as SubVatType, documentId);
    if (!sub) throw new Error("Subtable row not found");
    await assertNoDownstreamCommitment(tx, documentId, sub.status);

    if (doc.doc_type === "invoice") {
      await tx.delete(invoicesTable).where(eq(invoicesTable.id, sub.id));
    } else {
      await tx.delete(allowancesTable).where(eq(allowancesTable.id, sub.id));
    }

    await tx
      .update(documentsTable)
      .set({
        doc_type: "other",
        type: "NON_VAT",
        ocr_status: null,
        filename: sub.filename,
      })
      .where(eq(documentsTable.id, documentId));
  });
}

/**
 * Convert a childless `other` document into an invoice/allowance child: create
 * the subtable (direction + period are caller-supplied — the period is chosen
 * manually, never auto-derived) and flip the parent to VAT. The subtable lands
 * at `uploaded` for the period's「AI 提取」action to extract.
 */
export async function convertDocToChild(
  documentId: string,
  args: { docType: SubVatType; inOrOut: "in" | "out"; taxFilingPeriodId: string },
  options?: DocumentServiceOptions,
): Promise<void> {
  const { userId } = await resolveActor(options);

  await db.transaction(async (tx) => {
    const doc = await loadDocumentForReclassify(tx, documentId);
    if (doc.doc_type !== "other") {
      throw new Error("convertDocToChild only handles doc_type='other'");
    }
    await assertCallerCanAccessFirm(tx, userId, doc.firm_id);
    // No subtable yet, but guard against a stray journal entry on the parent.
    await assertNoDownstreamCommitment(tx, documentId, null);
    if (!doc.file_url) throw new Error("文件無原始檔案，無法轉換");

    const yearMonth = await resolveEditablePeriodYearMonth(
      tx,
      args.taxFilingPeriodId,
      doc.client_id,
    );

    if (args.docType === "invoice") {
      await tx.insert(invoicesTable).values({
        firm_id: doc.firm_id,
        client_id: doc.client_id,
        document_id: documentId,
        storage_path: doc.file_url,
        filename: doc.filename ?? "未命名",
        in_or_out: args.inOrOut,
        status: "uploaded",
        uploaded_by: userId,
        tax_filing_period_id: args.taxFilingPeriodId,
        year_month: yearMonth,
      });
    } else {
      await tx.insert(allowancesTable).values({
        firm_id: doc.firm_id,
        client_id: doc.client_id,
        document_id: documentId,
        storage_path: doc.file_url,
        filename: doc.filename,
        in_or_out: args.inOrOut,
        status: "uploaded",
        uploaded_by: userId,
        tax_filing_period_id: args.taxFilingPeriodId,
      });
    }

    // Subtable now owns the filename (the invariant for VAT docs); null the
    // parent copy so the two can't drift.
    await tx
      .update(documentsTable)
      .set({ doc_type: args.docType, type: "VAT", ocr_status: "pending", filename: null })
      .where(eq(documentsTable.id, documentId));
  });
}
