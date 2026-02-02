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
import { type Json, type TablesUpdate } from "@/supabase/database.types";
import { type ExtractedInvoiceData } from "@/lib/domain/models";
import { ensurePeriodEditable } from "@/lib/services/tax-period";

async function saveExtractedInvoiceData(
  invoiceId: string,
  validatedData: ExtractedInvoiceData
) {
  const supabase = await createClient();

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

export async function createInvoice(data: CreateInvoiceInput) {
  const supabase = await createClient();
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Validate input
  const validated = createInvoiceSchema.parse(data);

  // Check if period is locked (if year_month and client_id are provided)
  if (validated.year_month && validated.client_id) {
    await ensurePeriodEditable(validated.client_id, validated.year_month);
  }

  // Insert invoice record
  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      ...validated,
      uploaded_by: user.id,
      status: 'uploaded',
    })
    .select()
    .single();

  if (error) throw error;
  return invoice;
}

export async function updateInvoice(invoiceId: string, data: UpdateInvoiceInput) {
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

  if (error) throw error;
  return invoice;
}

export async function deleteInvoice(invoiceId: string) {
  const supabase = await createClient();
  
  // First, get the invoice to retrieve storage_path and check period lock
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('storage_path, client_id, year_month')
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
      .from('invoices')
      .remove([invoice.storage_path]);
    
    if (storageError) {
      // Log this error but don't throw, as the DB record is already gone.
      console.error(`Failed to delete storage object ${invoice.storage_path}:`, storageError);
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
export async function extractInvoiceDataAction(invoiceId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch invoice record
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (fetchError) throw fetchError;
  if (!invoice) throw new Error("Invoice not found");

  // Check if period is locked (AI extraction modifies invoice data)
  if (invoice.year_month && invoice.client_id) {
    await ensurePeriodEditable(invoice.client_id, invoice.year_month);
  }

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
      const extractedData = extractedInvoiceDataSchema.parse(
        invoice.extracted_data
      );
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
          return await saveExtractedInvoiceData(invoiceId, updatedData);
        }

        // Run AI to determine account for input electronic invoices based on summary and client industry
        const determinedAccount = await determineAccountForInputElectronicInvoice(
          extractedData.summary || "",
          clientInfo,
          accountListString
        );

        const updatedData = {
          ...extractedData,
          account: determinedAccount as ExtractedInvoiceData['account'],
        };

        return await saveExtractedInvoiceData(invoiceId, updatedData);
      }
    }

    // Download invoice file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("invoices")
      .download(invoice.storage_path);

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

    // Get MIME type - prefer Blob's type, fallback to extension-based detection
    const getMimeType = (blob: Blob, filename: string): string => {
      // First, try to use the Blob's content-type if available and valid
      if (blob.type && blob.type !== "application/octet-stream") {
        // Validate it's a supported type
        const supportedTypes = [
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/gif",
          "image/webp",
        ];
        if (supportedTypes.includes(blob.type)) {
          return blob.type;
        }
      }

      // Fallback to extension-based detection
      const ext = filename.split(".").pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        pdf: "application/pdf",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
      };

      // Special handling for HEIC/HEIF - not supported by Gemini
      if (ext === "heic" || ext === "heif") {
        throw new Error(
          `HEIC/HEIF format is not supported by Gemini API. ` +
            `Please convert your image to JPEG or PNG format before uploading. ` +
            `You can use online converters or image editing software to convert the file.`
        );
      }

      const detectedType = mimeTypes[ext || ""];
      if (!detectedType) {
        throw new Error(
          `Unsupported file format: ${ext || "unknown"}. ` +
            `Supported formats: PDF, PNG, JPEG, GIF, WEBP. ` +
            `For HEIC files, please convert to JPEG or PNG first.`
        );
      }

      return detectedType;
    };

    const mimeType = getMimeType(fileData, invoice.filename);

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

    return await saveExtractedInvoiceData(invoiceId, validatedData);
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
