import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { Database } from "../supabase/database.types";

type PublicTableName = keyof Database["public"]["Tables"];

const TABLES: PublicTableName[] = [
  "firms",
  "clients",
  "invoice_ranges",
  "invoices",
  "profiles",
];

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function listAllUsers(
  supabase: ReturnType<typeof createClient<Database>>
) {
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

async function main() {
  const supabaseUrl = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = await listAllUsers(supabase);
  const dataByTable: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      throw error;
    }
    dataByTable[table] = data ?? [];
  }

  const seedContents = `import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const users = ${JSON.stringify(
    users.map((user) => ({
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
      app_metadata: user.app_metadata,
      role: user.role,
    })),
    null,
    2
  )};

const firms = ${JSON.stringify(dataByTable.firms ?? [], null, 2)};
const clients = ${JSON.stringify(dataByTable.clients ?? [], null, 2)};
const invoiceRanges = ${JSON.stringify(dataByTable.invoice_ranges ?? [], null, 2)};
const invoices = ${JSON.stringify(dataByTable.invoices ?? [], null, 2)};
const profiles = ${JSON.stringify(dataByTable.profiles ?? [], null, 2)};

async function listExistingUsers() {
  const existing = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    existing.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  return existing;
}

export async function runSeed() {
  const existingUsers = await listExistingUsers();
  const existingByEmail = new Map(
    existingUsers.map((user) => [user.email, user.id])
  );

  const oldIdToNewId = new Map();
  const seedPassword = process.env.SEED_USER_PASSWORD ?? "TestPassword123!";

  for (const user of users) {
    if (!user.email) {
      continue;
    }

    const existingId = existingByEmail.get(user.email);
    if (existingId) {
      oldIdToNewId.set(user.id, existingId);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: seedPassword,
      email_confirm: true,
      user_metadata: user.user_metadata ?? {},
      app_metadata: user.app_metadata ?? {},
      role: user.role ?? "authenticated",
    });

    if (error || !data.user) {
      throw error ?? new Error("Failed to create seed user");
    }

    oldIdToNewId.set(user.id, data.user.id);
  }

  if (firms.length > 0) {
    const { error } = await supabase.from("firms").upsert(firms);
    if (error) throw error;
  }

  if (clients.length > 0) {
    const { error } = await supabase.from("clients").upsert(clients);
    if (error) throw error;
  }

  if (invoiceRanges.length > 0) {
    const { error } = await supabase.from("invoice_ranges").upsert(invoiceRanges);
    if (error) throw error;
  }

  if (profiles.length > 0) {
    for (const profile of profiles) {
      const mappedUserId = oldIdToNewId.get(profile.id);
      if (!mappedUserId) {
        continue;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          firm_id: profile.firm_id,
          name: profile.name,
          role: profile.role,
        })
        .eq("id", mappedUserId);

      if (error) throw error;
    }
  }

  if (invoices.length > 0) {
    const mappedInvoices = invoices.map((invoice) => ({
      ...invoice,
      uploaded_by: oldIdToNewId.get(invoice.uploaded_by) ?? invoice.uploaded_by,
    }));

    const { error } = await supabase.from("invoices").upsert(mappedInvoices);
    if (error) throw error;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runSeed().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
}
`;

  const outputPath = resolve(__dirname, "../supabase/seed.ts");
  writeFileSync(outputPath, seedContents, "utf8");
  console.log(`Seed file written to: ${outputPath}`);
}

main().catch((error) => {
  console.error("Seed export failed:", error);
  process.exit(1);
});
