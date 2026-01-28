"use server";

import { createClient } from "@/lib/supabase/server";
import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/supabase/database.types";
import {
  type CreateTaxFilingPeriodInput,
  type TaxFilingPeriod,
  taxFilingPeriodSchema,
  TaxPeriodStatus,
} from "@/lib/domain/models";

// This is for testing purposes only
interface TaxPeriodServiceTestOptions {
  supabaseClient: SupabaseClient<Database>;
}

/**
 * Get a tax filing period for a client and year-month.
 */
export async function getTaxPeriodByYYYMM(
  clientId: string,
  yearMonth: string,
  options?: TaxPeriodServiceTestOptions
): Promise<TaxFilingPeriod | null> {
  const supabase = options ? options.supabaseClient : await createClient();
  const { data: existingPeriod, error: fetchError } = await supabase
    .from("tax_filing_periods")
    .select("*")
    .eq("client_id", clientId)
    .eq("year_month", yearMonth)
    .single();

  // don't throw error if period not found
  if (fetchError) {
    if (fetchError.code !== "PGRST116") {
      throw fetchError;
    }
    return null;
  }

  return taxFilingPeriodSchema.parse(existingPeriod);
}

/**
 * Creates a new tax period explicitly.
 */
export async function createTaxPeriod(
    clientId: string,
    yearMonth: string
): Promise<TaxFilingPeriod> {
    const supabase = await createClient();

    // Get firmId from client to ensure consistency
    const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("firm_id")
        .eq("id", clientId)
        .single();

    if (clientError || !client) {
        throw new Error("Client not found");
    }

    if (!client.firm_id) {
        throw new Error("Client is not associated with a firm");
    }

    const newInput: CreateTaxFilingPeriodInput = {
        firm_id: client.firm_id,
        client_id: clientId,
        year_month: yearMonth,
        status: "open",
    };

    const { data: newPeriod, error: createError } = await supabase
        .from("tax_filing_periods")
        .insert(newInput)
        .select()
        .single();

    if (createError) throw createError;
    return taxFilingPeriodSchema.parse(newPeriod);
}

export async function getTaxPeriods(clientId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tax_filing_periods")
    .select("*")
    .eq("client_id", clientId)
    .order("year_month", { ascending: false });

  if (error) throw error;
  return taxFilingPeriodSchema.array().parse(data);
}

export async function updateTaxPeriodStatus(
  periodId: string,
  status: TaxPeriodStatus
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tax_filing_periods")
    .update({ status })
    .eq("id", periodId)
    .select()
    .single();

  if (error) throw error;
  return taxFilingPeriodSchema.parse(data);
}
