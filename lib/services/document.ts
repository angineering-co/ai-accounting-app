'use server';

import { createClient } from "@/lib/supabase/server";
import {
  createDocumentSchema,
  type CreateDocumentInput,
} from "@/lib/domain/document";
import type { Database } from "@/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

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
