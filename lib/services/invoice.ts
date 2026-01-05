'use server';

import { createClient } from '@/lib/supabase/server';
import { createInvoiceSchema, updateInvoiceSchema, type CreateInvoiceInput, type UpdateInvoiceInput } from '@/lib/domain/models';

export async function createInvoice(data: CreateInvoiceInput) {
  const supabase = await createClient();
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Validate input
  const validated = createInvoiceSchema.parse(data);

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

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update({
      ...validated,
      // Ensure extracted_data is JSON serializable if present
      ...(validated.extracted_data !== undefined && validated.extracted_data !== null
        ? { extracted_data: JSON.parse(JSON.stringify(validated.extracted_data)) }
        : {}),
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) throw error;
  return invoice;
}

export async function deleteInvoice(invoiceId: string) {
  const supabase = await createClient();
  
  // First, get the invoice to retrieve storage_path
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('storage_path')
    .eq('id', invoiceId)
    .single();

  if (fetchError) throw fetchError;
  if (!invoice) throw new Error('Invoice not found');

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

