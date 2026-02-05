'use server';

import { createClient } from "@/lib/supabase/server";
import {
  createAllowanceSchema,
  updateAllowanceSchema,
  type CreateAllowanceInput,
  type UpdateAllowanceInput,
} from "@/lib/domain/models";
import { type Json, type TablesUpdate } from "@/supabase/database.types";
import { tryLinkOriginalInvoice } from "@/lib/services/invoice-import";

/**
 * Create an allowance record
 */
export async function createAllowance(data: CreateAllowanceInput) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const validated = createAllowanceSchema.parse(data);

  const { data: allowance, error } = await supabase
    .from('allowances')
    .insert({
      ...validated,
      uploaded_by: user.id,
      status: 'uploaded',
    })
    .select()
    .single();

  if (error) throw error;
  return allowance;
}

/**
 * Update an allowance record
 */
export async function updateAllowance(allowanceId: string, data: UpdateAllowanceInput) {
  const supabase = await createClient();

  const validated = updateAllowanceSchema.parse(data);

  // Fetch the existing allowance to get client_id for re-linking
  const { data: existingAllowance, error: fetchError } = await supabase
    .from('allowances')
    .select('client_id, original_invoice_serial_code')
    .eq('id', allowanceId)
    .single();

  if (fetchError) throw fetchError;
  if (!existingAllowance) throw new Error('Allowance not found');

  const { extracted_data: extractedData, ...rest } = validated;

  // Prepare update payload
  const updatePayload: TablesUpdate<"allowances"> = {
    ...rest,
  };

  if (extractedData !== undefined && extractedData !== null) {
    updatePayload.extracted_data = JSON.parse(
      JSON.stringify(extractedData)
    ) as Json;
  }

  // Sync original_invoice_serial_code from extracted_data if provided
  if (extractedData?.originalInvoiceSerialCode !== undefined) {
    updatePayload.original_invoice_serial_code = extractedData.originalInvoiceSerialCode || null;
  }

  const { data: allowance, error } = await supabase
    .from('allowances')
    .update(updatePayload)
    .eq('id', allowanceId)
    .select()
    .single();

  if (error) throw error;

  // If original_invoice_serial_code changed, attempt to re-link
  const newSerialCode = extractedData?.originalInvoiceSerialCode || validated.original_invoice_serial_code;
  const oldSerialCode = existingAllowance.original_invoice_serial_code;

  if (newSerialCode && newSerialCode !== oldSerialCode && existingAllowance.client_id) {
    await tryLinkOriginalInvoice(
      existingAllowance.client_id,
      allowanceId,
      newSerialCode,
      supabase
    );
  }

  return allowance;
}

/**
 * Delete an allowance record
 */
export async function deleteAllowance(allowanceId: string) {
  const supabase = await createClient();

  // First, get the allowance to retrieve storage_path
  const { data: allowance, error: fetchError } = await supabase
    .from('allowances')
    .select('storage_path')
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
      .from('invoices')  // Paper allowances are stored in invoices bucket
      .remove([allowance.storage_path]);

    if (storageError) {
      console.error(`Failed to delete storage object ${allowance.storage_path}:`, storageError);
    }
  }
}
