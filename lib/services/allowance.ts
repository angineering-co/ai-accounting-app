'use server';

import { createClient } from "@/lib/supabase/server";
import {
  createAllowanceSchema,
  updateAllowanceSchema,
  extractedAllowanceDataSchema,
  type CreateAllowanceInput,
  type UpdateAllowanceInput,
  type ExtractedAllowanceData,
} from "@/lib/domain/models";
import { type Json, type Tables, type Database } from "@/supabase/database.types";
import {
  writeAllowanceEntryInTx,
  type ManualOriginalAccount,
} from "@/lib/services/journal-entry";
import { extractAllowanceData, type ClientInfo } from "@/lib/services/gemini";
import { getImportFileMimeType } from "@/lib/utils/mime-type";
import { enrichExtractedParties } from "@/lib/services/business-lookup";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensurePeriodEditable } from "@/lib/services/tax-period";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { assertCallerCanAccessClient } from "@/lib/db/rls";
import {
  documents as documentsTable,
  allowances as allowancesTable,
  invoices as invoicesTable,
} from "@/lib/db/schema";
import { toDocumentsKey } from "@/lib/storage/documents-key";
import { todayInTaipeiISO } from "@/lib/utils";

/**
 * Create an allowance record
 */
type AllowanceServiceOptions = {
  supabaseClient?: SupabaseClient<Database>;
  userId?: string;
};

export async function createAllowance(
  data: CreateAllowanceInput,
  options?: AllowanceServiceOptions,
) {
  const supabase = options?.supabaseClient ?? (await createClient());

  // Get current user
  let userId = options?.userId;
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    userId = user.id;
  }

  const validated = createAllowanceSchema.parse(data);

  // Documents-first: insert the CTI parent row and the allowance child row in a
  // single transaction. If the allowance insert fails, the document insert rolls
  // back with it — no orphan row, so no cleanup needed.
  // doc_date / amount / ocr_status here are placeholders: the DB trigger
  // `sync_documents_cache_from_allowances` overwrites them once the child row
  // gets real `extracted_data` (OCR completion or review edit).
  return db.transaction(async (tx) => {
    // Drizzle bypasses RLS, so authorize the caller at the app layer.
    await assertCallerCanAccessClient(tx, userId, validated.client_id);

    const [document] = await tx
      .insert(documentsTable)
      .values({
        firm_id: validated.firm_id,
        client_id: validated.client_id,
        doc_date: todayInTaipeiISO(),
        type: 'VAT',
        doc_type: 'allowance',
        file_url: validated.storage_path ?? null,
        ocr_status: 'pending',
        created_by: userId,
        status: 'active',
      })
      .returning({ id: documentsTable.id });

    const [allowance] = await tx
      .insert(allowancesTable)
      .values({
        ...validated,
        document_id: document.id,
        uploaded_by: userId,
        status: 'uploaded',
      })
      .returning();

    return allowance;
  });
}

/**
 * Result of {@link updateAllowance}. `needsManualAccount` is set only when a
 * confirm couldn't auto-generate the draft journal entry because the original
 * invoice's entry couldn't be resolved — the review dialog then asks staff to
 * pick accounts and resubmits with `manualOriginalAccount`.
 */
export type UpdateAllowanceResult = {
  allowance: Tables<"allowances">;
  needsManualAccount?: { direction: "in" | "out" };
};

/**
 * Update an allowance record. Runs entirely on Drizzle so that — when the update
 * confirms the allowance — the re-link, status flip, and draft journal-entry
 * generation (Decision #13 mirror) all share one transaction.
 *
 * Invariant: a `confirmed` allowance always has its draft entry. If the original
 * invoice's entry can't be resolved and no manual accounts are supplied, the
 * status is reverted to `processed` (saved, awaiting input) and
 * `needsManualAccount` is returned so the dialog can collect accounts and
 * resubmit — rather than leaving a `confirmed` row silently without an entry.
 *
 * Updates to `extracted_data` / `status` are mirrored onto the parent
 * `documents` row by the DB trigger `sync_documents_cache_from_allowances`
 * (see `supabase/migrations/20260526000000_sync_documents_cache_from_subtables.sql`).
 */
export async function updateAllowance(
  allowanceId: string,
  data: UpdateAllowanceInput,
  manualOriginalAccount?: ManualOriginalAccount,
  options?: AllowanceServiceOptions,
): Promise<UpdateAllowanceResult> {
  const validated = updateAllowanceSchema.parse(data);

  // Drizzle bypasses RLS, so authorize at the app layer (inside the tx). Resolve
  // the caller once: injected (tests / server-internal) or from the cookie session.
  let userId = options?.userId;
  if (!userId) {
    const supabase = options?.supabaseClient ?? (await createClient());
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    userId = user.id;
  }
  const callerId: string = userId;

  const [existingAllowance] = await db
    .select({
      client_id: allowancesTable.client_id,
      original_invoice_serial_code: allowancesTable.original_invoice_serial_code,
    })
    .from(allowancesTable)
    .where(eq(allowancesTable.id, allowanceId))
    .limit(1);

  if (!existingAllowance) throw new Error("Allowance not found");

  const clientId = validated.client_id ?? existingAllowance.client_id;
  if (!clientId) throw new Error("Allowance has no client");

  // Build the Drizzle update set (field names mirror the columns 1:1).
  const { extracted_data: extractedData, ...rest } = validated;
  const updateSet: Partial<typeof allowancesTable.$inferInsert> = { ...rest };
  if (extractedData !== undefined && extractedData !== null) {
    updateSet.extracted_data = JSON.parse(JSON.stringify(extractedData)) as Json;
  }
  if (extractedData?.originalInvoiceSerialCode !== undefined) {
    updateSet.original_invoice_serial_code =
      extractedData.originalInvoiceSerialCode || null;
  }

  const newSerialCode =
    extractedData?.originalInvoiceSerialCode ||
    validated.original_invoice_serial_code;
  const oldSerialCode = existingAllowance.original_invoice_serial_code;
  const shouldRelink = Boolean(newSerialCode && newSerialCode !== oldSerialCode);

  let needsManualAccount: UpdateAllowanceResult["needsManualAccount"];
  const allowance = await db.transaction(async (tx) => {
    await assertCallerCanAccessClient(tx, callerId, clientId);

    // Re-link in the same transaction: derive original_invoice_id from the
    // changed serial. Mirrors tryLinkOriginalInvoice — set only when a match is
    // found; leave the existing FK untouched otherwise.
    if (shouldRelink && newSerialCode) {
      const [origInvoice] = await tx
        .select({ id: invoicesTable.id })
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.client_id, clientId),
            eq(invoicesTable.invoice_serial_code, newSerialCode),
          ),
        )
        .limit(1);
      if (origInvoice) updateSet.original_invoice_id = origInvoice.id;
    }

    const [updated] = await tx
      .update(allowancesTable)
      .set(updateSet)
      .where(eq(allowancesTable.id, allowanceId))
      .returning();

    if (!updated) throw new Error("Allowance not found");

    if (updated.status !== "confirmed") return updated;

    const result = await writeAllowanceEntryInTx(
      tx,
      updated,
      callerId,
      manualOriginalAccount,
    );

    if (result.status === "needs_manual_account") {
      needsManualAccount = { direction: result.direction };
      // Don't commit a confirmed allowance with no entry: revert to 'processed'
      // (saved, awaiting the manual accounts). 'confirmed' stays ⇒ entry exists.
      const [reverted] = await tx
        .update(allowancesTable)
        .set({ status: "processed" })
        .where(eq(allowancesTable.id, allowanceId))
        .returning();
      return reverted;
    }

    return updated;
  });

  return {
    allowance: allowance as unknown as Tables<"allowances">,
    needsManualAccount,
  };
}

/**
 * Core allowance extraction logic that accepts a pre-built Supabase client.
 * Used by both the server action (user-scoped) and the Edge Function worker (service role).
 */
export async function extractAllowanceCore(
  allowanceId: string,
  supabase: SupabaseClient,
) {
  // Fetch allowance record
  const { data: allowance, error: fetchError } = await supabase
    .from("allowances")
    .select("*")
    .eq("id", allowanceId)
    .single();

  if (fetchError) throw fetchError;
  if (!allowance) throw new Error("Allowance not found");

  // Fetch client data if client_id exists
  let client = null;
  if (allowance.client_id) {
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("id, name, tax_id, industry")
      .eq("id", allowance.client_id)
      .single();

    if (!clientError && clientData) {
      client = clientData;
    }
  }

  // Update status to processing
  const { error: updateError } = await supabase
    .from("allowances")
    .update({ status: "processing" })
    .eq("id", allowanceId);

  if (updateError) throw updateError;

  const clientInfo: ClientInfo = client
    ? {
      name: client.name,
      taxId: client.tax_id || "",
      industry: client.industry || "",
    }
    : {
      name: "",
      taxId: "",
      industry: "",
    };

  try {
    if (!allowance.storage_path) {
      throw new Error("Allowance storage path is missing");
    }

    // Download allowance file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(toDocumentsKey(allowance.storage_path));

    if (downloadError) {
      throw new Error(
        `Failed to download allowance file: ${downloadError.message}`
      );
    }

    if (!fileData) {
      throw new Error("Allowance file not found in storage");
    }

    // Convert Blob to ArrayBuffer
    const arrayBuffer = await fileData.arrayBuffer();

    const mimeType = getImportFileMimeType(fileData, allowance.filename || "");

    const extractedData = await extractAllowanceData(
      arrayBuffer,
      mimeType,
      clientInfo
    );

    const normalizedData: ExtractedAllowanceData = {
      ...extractedData,
      source: "scan",
    };

    const validatedData = extractedAllowanceDataSchema.parse(normalizedData);

    // allowance.in_or_out is the upload-time hint; the authoritative value is
    // derived below from tax-id matching once both parties are resolved.
    const enrichedData = await enrichExtractedParties(
      validatedData,
      allowance.in_or_out === "in" ? "in" : "out",
      client?.tax_id ? { name: client.name, taxId: client.tax_id } : null,
    );

    const clientTaxId = client?.tax_id || "";
    let derivedInOrOut: "in" | "out" | undefined;
    if (clientTaxId) {
      if (enrichedData.sellerTaxId === clientTaxId) {
        derivedInOrOut = "out";
      } else if (enrichedData.buyerTaxId === clientTaxId) {
        derivedInOrOut = "in";
      }
    }

    const fallbackInOrOut = allowance.in_or_out === "in" ? "in" : "out";

    const { allowance: updated } = await updateAllowance(allowanceId, {
      extracted_data: enrichedData,
      status: "processed",
      original_invoice_serial_code:
        enrichedData.originalInvoiceSerialCode || null,
      in_or_out: derivedInOrOut ?? fallbackInOrOut,
    });
    return updated;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    await supabase
      .from("allowances")
      .update({
        status: "failed",
      })
      .eq("id", allowanceId);

    console.error("Error extracting allowance data:", error);
    throw new Error(`Failed to extract allowance data: ${errorMessage}`);
  }
}

/**
 * Server action wrapper: authenticates user, then delegates to core.
 */
export async function extractAllowanceDataAction(allowanceId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch allowance with period info to check period lock
  const { data: allowance, error: fetchError } = await supabase
    .from("allowances")
    .select("client_id, tax_filing_periods(year_month)")
    .eq("id", allowanceId)
    .single();

  if (fetchError) throw fetchError;
  if (!allowance) throw new Error("Allowance not found");

  // Check if period is locked (AI extraction modifies allowance data)
  const yearMonth = allowance.tax_filing_periods?.year_month;
  if (yearMonth && allowance.client_id) {
    await ensurePeriodEditable(allowance.client_id, yearMonth);
  }

  return await extractAllowanceCore(allowanceId, supabase);
}

/**
 * Delete an allowance record
 */
export async function deleteAllowance(allowanceId: string, options?: AllowanceServiceOptions) {
  const supabase = options?.supabaseClient ?? (await createClient());

  // First, get the allowance to retrieve storage_path
  const { data: allowance, error: fetchError } = await supabase
    .from('allowances')
    .select('storage_path, document_id')
    .eq('id', allowanceId)
    .single();

  if (fetchError) throw fetchError;
  if (!allowance) throw new Error('Allowance not found');

  // Delete the database record first
  const { error } = await supabase
    .from('allowances')
    .delete()
    .eq('id', allowanceId);

  if (error) throw error;

  // After successfully deleting the DB record, remove the file from storage if exists
  if (allowance.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([toDocumentsKey(allowance.storage_path)]);

    if (storageError) {
      console.error(`Failed to delete storage object ${allowance.storage_path}:`, storageError);
    }
  }

  // Remove the CTI parent document row — the allowance was its only child.
  if (allowance.document_id) {
    const { error: documentError } = await supabase
      .from('documents')
      .delete()
      .eq('id', allowance.document_id);

    if (documentError) {
      console.error(`Failed to delete document ${allowance.document_id}:`, documentError);
    }
  }
}
