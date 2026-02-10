import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/supabase/database.types";
import {
  TEST_PASSWORD,
  TEST_USER_METADATA,
  makeTestClientName,
  makeTestEmail,
  makeTestFirmName,
} from "./constants";

export interface TestFixture {
  userId: string;
  userEmail: string;
  firmId: string;
  clientId: string;
  storagePaths: string[];
}

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getServiceClient(): SupabaseClient<Database> {
  const supabaseUrl = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function createTestUser(
  supabase: SupabaseClient<Database>
): Promise<{ id: string; email: string }> {
  const email = makeTestEmail();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: TEST_USER_METADATA,
  });

  if (error || !data.user) {
    throw error ?? new Error("Failed to create test user.");
  }

  return { id: data.user.id, email };
}

export async function createTestFirm(
  supabase: SupabaseClient<Database>
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("firms")
    .insert({
      name: makeTestFirmName(),
      tax_id: Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, "0"),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to create test firm.");
  }

  return { id: data.id };
}

export async function createTestClient(
  supabase: SupabaseClient<Database>,
  firmId: string
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      firm_id: firmId,
      name: makeTestClientName(),
      tax_id: Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, "0"),
      tax_payer_id: Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, "0"),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to create test client.");
  }

  return { id: data.id };
}

export async function createTestFixture(
  supabase: SupabaseClient<Database>
): Promise<TestFixture> {
  const user = await createTestUser(supabase);
  const firm = await createTestFirm(supabase);
  const client = await createTestClient(supabase, firm.id);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      firm_id: firm.id,
      name: TEST_USER_METADATA.name,
      role: TEST_USER_METADATA.role,
    })
    .eq("id", user.id);

  if (profileError) {
    throw profileError;
  }

  return {
    userId: user.id,
    userEmail: user.email,
    firmId: firm.id,
    clientId: client.id,
    storagePaths: [],
  };
}

export async function cleanupTestFixture(
  supabase: SupabaseClient<Database>,
  fixture: TestFixture
): Promise<void> {
  if (fixture.storagePaths.length > 0) {
    await supabase.storage
      .from("electronic-invoices")
      .remove(fixture.storagePaths);
  }

  await supabase.from("invoices").delete().eq("client_id", fixture.clientId);
  await supabase
    .from("invoice_ranges")
    .delete()
    .eq("client_id", fixture.clientId);
  await supabase.from("clients").delete().eq("id", fixture.clientId);
  await supabase.from("profiles").delete().eq("id", fixture.userId);
  await supabase.from("firms").delete().eq("id", fixture.firmId);
  await supabase.auth.admin.deleteUser(fixture.userId);
}
