"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import {
  updateClientSchema,
  UpdateClientInput,
  createClientSchema,
  CreateClientInput,
} from "@/lib/domain/models";
import { revalidatePath } from "next/cache";

export async function createClient(data: CreateClientInput) {
  const validation = createClientSchema.safeParse(data);

  if (!validation.success) {
    throw new Error("Invalid data: " + validation.error.message);
  }

  const supabase = await createSupabaseClient();
  const { error } = await supabase.from("clients").insert(validation.data);

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  revalidatePath("/firm/[firmId]/client");
}

export async function updateClient(clientId: string, data: UpdateClientInput) {
  const validation = updateClientSchema.safeParse(data);

  if (!validation.success) {
    throw new Error("Invalid data: " + validation.error.message);
  }

  const supabase = await createSupabaseClient();
  const { error } = await supabase
    .from("clients")
    .update(validation.data)
    .eq("id", clientId);

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  revalidatePath("/firm/[firmId]/client");
}
