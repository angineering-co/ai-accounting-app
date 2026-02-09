import fs from "fs";
import path from "path";
import { Client as PgClient } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/database.types";
import { getServiceClient } from "@/tests/fixtures/supabase";

const TEST_USER_PLACEHOLDER = "__TEST_USER_ID__";

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function withPgClient<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = new PgClient({ connectionString: getEnvOrThrow("DATABASE_URL") });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function seedReportFixture(
  fixtureDir: string,
  supabase?: SupabaseClient<Database>
): Promise<{ supabase: SupabaseClient<Database>; userId: string; cleanup: () => Promise<void> }> {
  const serviceClient = supabase ?? getServiceClient();
  const email = `report-test+${Date.now()}@example.com`;
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password: "test-password",
    email_confirm: true,
  });

  if (error || !data.user) {
    throw error ?? new Error("Failed to create test user for report fixtures.");
  }

  const userId = data.user.id;
  const cleanupPath = path.join(fixtureDir, "cleanup.sql");
  const seedPath = path.join(fixtureDir, "seed.sql");
  const cleanupSql = fs.existsSync(cleanupPath) ? fs.readFileSync(cleanupPath, "utf-8") : "";
  const seedSql = fs.readFileSync(seedPath, "utf-8");
  const seededCleanupSql = cleanupSql.replaceAll(TEST_USER_PLACEHOLDER, userId);
  const seededSql = seedSql.replaceAll(TEST_USER_PLACEHOLDER, userId);

  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      if (seededCleanupSql.trim()) {
        await client.query(seededCleanupSql);
      }
      await client.query(seededSql);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });

  const cleanup = async () => {
    await serviceClient.auth.admin.deleteUser(userId);
  };

  return { supabase: serviceClient, userId, cleanup };
}
