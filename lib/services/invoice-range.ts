"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/supabase/database.types";
import {
  invoiceRangeSchema,
  createInvoiceRangeSchema,
  type CreateInvoiceRangeInput,
} from "@/lib/domain/models";
import { RocPeriod } from "@/lib/domain/roc-period";
import { revalidatePath } from "next/cache";
import { ensurePeriodEditable } from "@/lib/services/tax-period";

interface InvoiceRangeServiceTestOptions {
  supabaseClient: SupabaseClient<Database>;
}

export async function getInvoiceRanges(
  clientId: string,
  serializedReportPeriod?: string,
  options?: InvoiceRangeServiceTestOptions
) {
  const supabase = options ? options.supabaseClient : await createSupabaseClient();
  let query = supabase
    .from("invoice_ranges")
    .select("*")
    .eq("client_id", clientId)
    .order("year_month", { ascending: false })
    .order("start_number", { ascending: true });

  if (serializedReportPeriod) {
    query = query.eq("year_month", serializedReportPeriod);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  return (data || []).map((item) => invoiceRangeSchema.parse(item));
}

export async function createInvoiceRange(data: CreateInvoiceRangeInput) {
  const validation = createInvoiceRangeSchema.safeParse(data);

  if (!validation.success) {
    throw new Error("Invalid data: " + validation.error.message);
  }

  const supabase = await createSupabaseClient();
  
  // Normalize year_month to the start of the period
  const normalizedData = {
    ...validation.data,
    year_month: RocPeriod.fromYYYMM(validation.data.year_month).toString()
  };

  // Check if period is locked
  await ensurePeriodEditable(normalizedData.client_id, normalizedData.year_month);

  // Fetch firm_id for the client to revalidate the correct path
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("firm_id")
    .eq("id", normalizedData.client_id)
    .single();

  if (clientError || !client?.firm_id) {
    throw new Error("Client not found or access denied");
  }

  const { data: created, error } = await supabase
    .from("invoice_ranges")
    .insert({
      ...normalizedData,
      firm_id: client.firm_id,
    })
    .select()
    .single();

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  revalidatePath(`/firm/${client.firm_id}/client/${data.client_id}`);
  return invoiceRangeSchema.parse(created);
}

export async function deleteInvoiceRange(id: string, clientId: string) {
  const supabase = await createSupabaseClient();

  // Fetch the invoice range to check its period
  const { data: range, error: rangeError } = await supabase
    .from("invoice_ranges")
    .select("year_month")
    .eq("id", id)
    .single();

  if (rangeError || !range) {
    throw new Error("Invoice range not found");
  }

  // Check if period is locked
  await ensurePeriodEditable(clientId, range.year_month);

  // Fetch firm_id for the client to revalidate the correct path
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("firm_id")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    throw new Error("Client not found or access denied");
  }

  const { error } = await supabase
    .from("invoice_ranges")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  revalidatePath(`/firm/${client.firm_id}/client/${clientId}`);
}

