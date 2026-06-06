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

/**
 * Fail fast if a connection URL points anywhere other than local Supabase.
 * Integration tests create and delete real rows — they must never run against
 * a remote (prod) project, regardless of what `.env.local` happens to hold.
 */
export function assertLocalUrl(envName: string, value: string): void {
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    // Omit the value — a malformed connection string may carry credentials.
    throw new Error(`${envName} is not a valid URL`);
  }
  // URL.hostname returns the IPv6 loopback bracketed, e.g. "[::1]".
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") {
    throw new Error(
      `Refusing to run integration tests against non-local ${envName} ` +
        `(host "${host}"). Point ${envName} at local Supabase in .env.local.`,
    );
  }
}

export function getServiceClient(): SupabaseClient<Database> {
  const supabaseUrl = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  assertLocalUrl("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
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

  // FK-ordered teardown in waves. `documents` is the CTI parent of invoices /
  // allowances / journal_entries, and `allowances.original_invoice_id` references
  // invoices — so: allowances first, then invoices + journal_entries, then
  // documents. journal_entry_lines cascades from journal_entries (no explicit
  // delete). audit_trails scoped by firm_id since entries are about to disappear.
  await Promise.all([
    supabase.from("audit_trails").delete().eq("firm_id", fixture.firmId),
    supabase.from("fiscal_year_closes").delete().eq("client_id", fixture.clientId),
    supabase.from("voucher_sequences").delete().eq("client_id", fixture.clientId),
    supabase.from("invoice_ranges").delete().eq("client_id", fixture.clientId),
    supabase.from("allowances").delete().eq("client_id", fixture.clientId),
  ]);
  await Promise.all([
    supabase.from("journal_entries").delete().eq("client_id", fixture.clientId),
    supabase.from("invoices").delete().eq("client_id", fixture.clientId),
  ]);
  await supabase.from("documents").delete().eq("client_id", fixture.clientId);

  // Clients and profiles both FK firms; both must be gone before firms.delete.
  await Promise.all([
    supabase.from("clients").delete().eq("id", fixture.clientId),
    supabase.from("profiles").delete().eq("id", fixture.userId),
  ]);
  await supabase.from("firms").delete().eq("id", fixture.firmId);
  await supabase.auth.admin.deleteUser(fixture.userId);
}

/**
 * Fetch a journal entry by its `document_id` together with its lines (ordered by
 * line_number); null when no entry exists. Shared across the journal-entry
 * integration suites. (A production read helper with auth belongs to the Phase 5
 * read-path, not here.)
 */
export async function getEntryWithLines(
  supabase: SupabaseClient<Database>,
  documentId: string,
) {
  const { data: entry } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("document_id", documentId)
    .maybeSingle();
  if (!entry) return null;
  const { data: lines } = await supabase
    .from("journal_entry_lines")
    .select("*")
    .eq("journal_entry_id", entry.id)
    .order("line_number", { ascending: true });
  return { entry, lines: lines ?? [] };
}
