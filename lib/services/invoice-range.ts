"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import {
  invoiceRangeSchema,
  createInvoiceRangeSchema,
  type CreateInvoiceRangeInput,
} from "@/lib/domain/models";
import { revalidatePath } from "next/cache";

export async function getInvoiceRanges(clientId: string, yearMonth?: string) {
  const supabase = await createSupabaseClient();
  let query = supabase
    .from("invoice_ranges")
    .select("*")
    .eq("client_id", clientId)
    .order("year_month", { ascending: false })
    .order("start_number", { ascending: true });

  if (yearMonth) {
    query = query.eq("year_month", yearMonth);
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
  
  // Fetch firm_id for the client to revalidate the correct path
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("firm_id")
    .eq("id", data.client_id)
    .single();

  if (clientError || !client) {
    throw new Error("Client not found or access denied");
  }

  const { data: created, error } = await supabase
    .from("invoice_ranges")
    .insert(validation.data)
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

