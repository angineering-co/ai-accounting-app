'use server';

import { createClient } from "@/lib/supabase/server";
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  type CreateInvoiceInput,
  type UpdateInvoiceInput,
  extractedInvoiceDataSchema,
} from "@/lib/domain/models";
import {
  extractInvoiceData,
  determineAccountForInputElectronicInvoice,
  type ClientInfo,
} from "@/lib/services/gemini";
import { getAccountListString } from "@/lib/services/account";
import { ACCOUNT_LIST } from "@/lib/data/accounts";
import { type Json, type TablesUpdate, type Database } from "@/supabase/database.types";
import { type ExtractedInvoiceData } from "@/lib/domain/models";
import { ensurePeriodEditable } from "@/lib/services/tax-period";
import { toDocumentsKey } from "@/lib/storage/documents-key";
import { db } from "@/lib/db/drizzle";
import { assertCallerCanAccessClient } from "@/lib/db/rls";
import { documents as documentsTable, invoices as invoicesTable } from "@/lib/db/schema";
import { todayInTaipeiISO } from "@/lib/utils";
import { getImportFileMimeType } from "@/lib/utils/mime-type";
import { enrichExtractedParties } from "@/lib/services/business-lookup";
import { confirmInvoiceEntry } from "@/lib/services/journal-entry";
import type { SupabaseClient } from "@supabase/supabase-js";

// `documents.{amount, doc_date, ocr_status}` are kept in sync via the DB trigger
// `sync_documents_cache_from_invoices` (see
// `supabase/migrations/20260526000000_sync_documents_cache_from_subtables.sql`).
// Updating `extracted_data` / `status` here propagates automatically.
async function saveExtractedInvoiceData(
  invoiceId: string,
  validatedData: ExtractedInvoiceData,
  supabaseClient?: SupabaseClient,
) {
  const supabase = supabaseClient ?? await createClient();

  // Update invoice with extracted data and set status to processed
  // Convert to plain object for Supabase JSONB column
  const extractedDataJson = JSON.parse(JSON.stringify(validatedData));

  // Attempt update with invoice_serial_code (if present)
  const updatePayload: TablesUpdate<"invoices"> = {
    extracted_data: extractedDataJson as Json,
    status: "processed",
    invoice_serial_code: validatedData.invoiceSerialCode || null,
  };

  const { error: finalUpdateError } = await supabase
    .from("invoices")
    .update(updatePayload)
    .eq("id", invoiceId);

  if (finalUpdateError) {
    // Check for unique constraint violation (code 23505 in Postgres)
    if (finalUpdateError.code === "23505") {
      console.warn(
        "Duplicate invoice serial code detected during extraction:",
        validatedData.invoiceSerialCode
      );

      // Retry update WITHOUT invoice_serial_code
      const retryPayload: TablesUpdate<"invoices"> = {
        extracted_data: extractedDataJson as Json,
        status: "processed",
      };

      const { error: retryError } = await supabase
        .from("invoices")
        .update(retryPayload)
        .eq("id", invoiceId);

      if (retryError) throw retryError;
    } else {
      throw finalUpdateError;
    }
  }

  return validatedData;
}

type InvoiceServiceOptions = {
  supabaseClient?: SupabaseClient<Database>;
  userId?: string;
};

export async function createInvoice(
  data: CreateInvoiceInput,
  options?: InvoiceServiceOptions,
) {
  const supabase = options?.supabaseClient ?? (await createClient());

  // Get current user
  let userId = options?.userId;
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    userId = user.id;
  }

  // Validate input
  const validated = createInvoiceSchema.parse(data);

  // Check if period is locked (if year_month provided).
  if (validated.year_month) {
    await ensurePeriodEditable(validated.client_id, validated.year_month);
  }

  // Documents-first: insert the CTI parent row and the invoice child row in a
  // single transaction. If the invoice insert fails, the document insert rolls
  // back with it — no orphan row, so no cleanup needed.
  // doc_date / amount / ocr_status here are placeholders: the DB trigger
  // `sync_documents_cache_from_invoices` overwrites them once the child row
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
        doc_type: 'invoice',
        file_url: validated.storage_path,
        ocr_status: 'pending',
        created_by: userId,
        status: 'active',
      })
      .returning({ id: documentsTable.id });

    const [invoice] = await tx
      .insert(invoicesTable)
      .values({
        ...validated,
        document_id: document.id,
        uploaded_by: userId,
        status: 'uploaded',
      })
      .returning();

    return invoice;
  });
}

export type UpdateInvoiceResult =
  | { success: true; invoice: Record<string, unknown> }
  | {
      success: false;
      error: "serial_conflict";
      serialCode: string;
      conflictingInvoiceId: string;
      conflictingYearMonth: string;
      conflictingClientId: string;
    };

export async function updateInvoice(invoiceId: string, data: UpdateInvoiceInput): Promise<UpdateInvoiceResult> {
  const supabase = await createClient();
  
  const validated = updateInvoiceSchema.parse(data);

  // Fetch the existing invoice to check period lock status
  const { data: existingInvoice, error: fetchError } = await supabase
    .from('invoices')
    .select('client_id, year_month')
    .eq('id', invoiceId)
    .single();

  if (fetchError) throw fetchError;
  if (!existingInvoice) throw new Error('Invoice not found');

  // Check if current period is locked
  if (existingInvoice.year_month && existingInvoice.client_id) {
    await ensurePeriodEditable(existingInvoice.client_id, existingInvoice.year_month);
  }

  // If moving to a new period, check if the new period is also editable
  if (validated.year_month && validated.year_month !== existingInvoice.year_month) {
    const clientId = validated.client_id || existingInvoice.client_id;
    if (clientId) {
      await ensurePeriodEditable(clientId, validated.year_month);
    }
  }

  const { extracted_data: extractedData, ...rest } = validated;

  // Prepare update payload
  const updatePayload: TablesUpdate<"invoices"> = {
    ...rest,
  };

  if (extractedData !== undefined && extractedData !== null) {
    updatePayload.extracted_data = JSON.parse(
      JSON.stringify(extractedData)
    ) as Json;
  }

  // If extracted_data is provided, sync invoice_serial_code
  if (extractedData?.invoiceSerialCode) {
    updatePayload.invoice_serial_code = extractedData.invoiceSerialCode;
  }

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update(updatePayload)
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) {
    // Handle duplicate invoice_serial_code (unique constraint violation)
    if (error.code === "23505" && updatePayload.invoice_serial_code) {
      const serialCode = updatePayload.invoice_serial_code;
      const clientId = existingInvoice.client_id;

      if (clientId) {
        // Find the conflicting invoice
        const { data: conflicting } = await supabase
          .from("invoices")
          .select("id, year_month, client_id")
          .eq("client_id", clientId)
          .eq("invoice_serial_code", serialCode)
          .neq("id", invoiceId)
          .single();

        if (conflicting) {
          return {
            success: false,
            error: "serial_conflict",
            serialCode,
            conflictingInvoiceId: conflicting.id,
            conflictingYearMonth: conflicting.year_month ?? "",
            conflictingClientId: conflicting.client_id ?? clientId,
          };
        }
      }
    }
    throw error;
  }

  // Phase 7: confirming an invoice generates its draft journal entry. Idempotent
  // (re-confirm / edit-while-confirmed replaces the draft's lines); a no-op for
  // 作廢 / 彙加 / 銷項 零稅率·免稅 and for non-confirmed saves. confirmInvoiceEntry
  // resolves and asserts the authenticated user itself (throws if absent), so we
  // don't guard on user here — silently skipping would leave a confirmed invoice
  // without its entry.
  // NOTE: this runs in a separate transaction from the status flip above, so the
  // overall updateInvoice is not atomic (a failure here leaves the invoice
  // confirmed without an entry; re-confirming heals it). Making the flip + entry
  // one transaction is deferred to the Phase 8 persistence-layer refactor.
  if (invoice?.status === "confirmed") {
    await confirmInvoiceEntry(invoiceId, { supabaseClient: supabase });
  }

  return { success: true as const, invoice };
}

export async function deleteInvoice(invoiceId: string, options?: InvoiceServiceOptions) {
  const supabase = options?.supabaseClient ?? (await createClient());


  // First, get the invoice to retrieve storage_path and check period lock
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('storage_path, client_id, year_month, document_id')
    .eq('id', invoiceId)
    .single();

  if (fetchError) throw fetchError;
  if (!invoice) throw new Error('Invoice not found');

  // Check if period is locked
  if (invoice.year_month && invoice.client_id) {
    await ensurePeriodEditable(invoice.client_id, invoice.year_month);
  }

  // Delete the database record first
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId);

  if (error) throw error;

  // After successfully deleting the DB record, remove the file from storage
  if (invoice.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([toDocumentsKey(invoice.storage_path)]);

    if (storageError) {
      // Log this error but don't throw, as the DB record is already gone.
      console.error(`Failed to delete storage object ${invoice.storage_path}:`, storageError);
    }
  }

  // Remove the CTI parent document row — the invoice was its only child.
  if (invoice.document_id) {
    const { error: documentError } = await supabase
      .from('documents')
      .delete()
      .eq('id', invoice.document_id);

    if (documentError) {
      console.error(`Failed to delete document ${invoice.document_id}:`, documentError);
    }
  }
}

export async function getInvoices(firmId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      client:clients(id, name)
    `)
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getInvoicesByClient(clientId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Extract invoice data using Gemini AI
 * @param invoiceId - Invoice ID to extract data from
 * @returns Extracted invoice data
 */
/**
 * Core invoice extraction logic that accepts a pre-built Supabase client.
 * Used by the server action wrapper (user-scoped).
 */
export async function extractInvoiceCore(
  invoiceId: string,
  supabase: SupabaseClient,
) {
  // Fetch invoice record
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (fetchError) throw fetchError;
  if (!invoice) throw new Error("Invoice not found");

  // Fetch client data if client_id exists
  let client = null;
  if (invoice.client_id) {
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("id, name, tax_id, industry")
      .eq("id", invoice.client_id)
      .single();

    if (!clientError && clientData) {
      client = clientData;
    }
  }

  // Update status to processing
  const { error: updateError } = await supabase
    .from("invoices")
    .update({ status: "processing" })
    .eq("id", invoiceId);

  if (updateError) throw updateError;

  // Prepare client info
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

  // Get account list if it's an "進項" invoice
  const accountListString =
    invoice.in_or_out === "in" ? getAccountListString() : "";

  try {
    // Check if it's an electronic invoice from import
    if (invoice.extracted_data) {
      // Use safeParse — extracted_data may contain invalid AI-generated values (e.g.,
      // hallucinated account names) that fail Zod validation. We still need to proceed
      // with re-extraction to correct the account field, so fall back to raw data.
      const parsed = extractedInvoiceDataSchema.safeParse(invoice.extracted_data);
      const extractedData = parsed.success
        ? parsed.data
        : (invoice.extracted_data as ExtractedInvoiceData);
      if (
        extractedData.invoiceType === "電子發票" &&
        extractedData.source === "import-excel"
      ) {
        // For output electronic invoices, set account to "4101 營業收入"
        if (extractedData.inOrOut === "銷項") {
          const updatedData = {
            ...extractedData,
            account: "4101 營業收入" as ExtractedInvoiceData['account'],
          };
          return await saveExtractedInvoiceData(invoiceId, updatedData, supabase);
        }

        // Run AI to determine account for input electronic invoices based on summary and client industry
        const determinedAccount = await determineAccountForInputElectronicInvoice(
          extractedData.summary || "",
          clientInfo,
          accountListString
        );

        // Validate the AI-determined account against the allowed list
        const validatedAccount = (ACCOUNT_LIST as readonly string[]).includes(determinedAccount)
          ? (determinedAccount as ExtractedInvoiceData['account'])
          : undefined;

        const updatedData = {
          ...extractedData,
          account: validatedAccount,
        };

        return await saveExtractedInvoiceData(invoiceId, updatedData, supabase);
      }
    }

    // Download invoice file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(toDocumentsKey(invoice.storage_path));

    if (downloadError) {
      throw new Error(
        `Failed to download invoice file: ${downloadError.message}`
      );
    }

    if (!fileData) {
      throw new Error("Invoice file not found in storage");
    }

    // Convert Blob to ArrayBuffer
    const arrayBuffer = await fileData.arrayBuffer();

    const mimeType = getImportFileMimeType(fileData, invoice.filename);

    // Convert in_or_out to Chinese format
    const inOrOut = invoice.in_or_out === "in" ? "進項" : "銷項";

    // Call Gemini service to extract data
    const extractedData = await extractInvoiceData(
      arrayBuffer,
      mimeType,
      clientInfo,
      inOrOut,
      accountListString
    );

    // Validate extracted data against schema
    const validatedData = extractedInvoiceDataSchema.parse(extractedData);

    const enrichedData = await enrichExtractedParties(
      validatedData,
      invoice.in_or_out === "in" ? "in" : "out",
      client?.tax_id ? { name: client.name, taxId: client.tax_id } : null,
    );

    return await saveExtractedInvoiceData(invoiceId, enrichedData, supabase);
  } catch (error) {
    // Update status to failed on error
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    await supabase
      .from("invoices")
      .update({
        status: "failed",
      })
      .eq("id", invoiceId);

    console.error("Error extracting invoice data:", error);
    throw new Error(`Failed to extract invoice data: ${errorMessage}`);
  }
}

/**
 * Server action wrapper: authenticates user, checks period lock, then delegates to core.
 */
export async function extractInvoiceDataAction(invoiceId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch invoice to check period lock
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("client_id, year_month")
    .eq("id", invoiceId)
    .single();

  if (fetchError) throw fetchError;
  if (!invoice) throw new Error("Invoice not found");

  // Check if period is locked (AI extraction modifies invoice data)
  if (invoice.year_month && invoice.client_id) {
    await ensurePeriodEditable(invoice.client_id, invoice.year_month);
  }

  return await extractInvoiceCore(invoiceId, supabase);
}
