"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import {
  firmSchema,
  firmSettingsBlobSchema,
  updateFirmSettingsSchema,
  type Firm,
  type UpdateFirmSettingsInput,
} from "@/lib/domain/models";
import type { Database, Json } from "@/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

type FirmServiceOptions = {
  supabaseClient?: SupabaseClient<Database>;
};

export async function getFirmSettings(
  firmId: string,
  options?: FirmServiceOptions,
): Promise<Firm> {
  const supabase = options?.supabaseClient ?? (await createSupabaseClient());

  const { data, error } = await supabase
    .from("firms")
    .select("*")
    .eq("id", firmId)
    .single();

  if (error) throw new Error("載入設定失敗: " + error.message);
  return firmSchema.parse(data);
}

export async function updateFirmSettings(
  firmId: string,
  input: UpdateFirmSettingsInput,
  options?: FirmServiceOptions,
) {
  const validation = updateFirmSettingsSchema.safeParse(input);
  if (!validation.success) {
    throw new Error("資料驗證失敗: " + validation.error.message);
  }
  const { name, tax_id, settings: nextSettings } = validation.data;

  const supabase = options?.supabaseClient ?? (await createSupabaseClient());

  const update: { name?: string; tax_id?: string; settings?: Json } = {};
  if (name !== undefined) update.name = name;
  if (tax_id !== undefined) update.tax_id = tax_id;

  if (nextSettings !== undefined) {
    // Read-modify-write the JSONB so unrelated keys aren't clobbered
    const { data: current, error: readErr } = await supabase
      .from("firms")
      .select("settings")
      .eq("id", firmId)
      .single();
    if (readErr) throw new Error("載入設定失敗: " + readErr.message);

    const currentBlob =
      firmSettingsBlobSchema.partial().nullable().parse(current.settings) ?? {};
    update.settings = { ...currentBlob, ...nextSettings } as Json;
  }

  const { data: updated, error } = await supabase
    .from("firms")
    .update(update)
    .eq("id", firmId)
    .select("id");

  if (error) throw new Error("儲存設定失敗: " + error.message);
  // Detect the silent-RLS case: no error but no row updated either.
  if (!updated || updated.length === 0) {
    throw new Error("儲存設定失敗: 無權限或事務所不存在");
  }

  // revalidatePath only works inside a Next.js request context.
  // Outside one (e.g. integration tests), it throws — swallow so callers don't break.
  try {
    revalidatePath(`/firm/${firmId}/settings`);
  } catch {
    // no-op: not in a Next.js request context
  }
}
