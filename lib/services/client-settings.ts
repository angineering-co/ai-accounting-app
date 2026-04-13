"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import {
  clientSchema,
  updateClientSettingsSchema,
  UpdateClientSettingsInput,
} from "@/lib/domain/models";
import { revalidatePath } from "next/cache";

export async function getClientSettings(clientId: string) {
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (error) throw new Error("載入設定失敗: " + error.message);
  return clientSchema.parse(data);
}

export async function updateClientSettings(
  clientId: string,
  data: UpdateClientSettingsInput,
) {
  const validation = updateClientSettingsSchema.safeParse(data);

  if (!validation.success) {
    throw new Error("資料驗證失敗: " + validation.error.message);
  }

  const supabase = await createSupabaseClient();
  const { data: updated, error } = await supabase
    .from("clients")
    .update(validation.data)
    .eq("id", clientId)
    .select("firm_id")
    .single();

  if (error) throw new Error("儲存設定失敗: " + error.message);

  revalidatePath(`/firm/${updated.firm_id}/client/${clientId}`);
}
