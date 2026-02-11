import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/database.types";
import type { TetUConfig } from "@/lib/domain/models";
import { Client as PgClient } from "pg";
import { TEST_FIRM_NAME, TEST_FIRM_ID } from "./constants";

// ============================================================================
// Types
// ============================================================================

export interface TestCaseManifest {
  clientId: string;
  reportPeriod: string;
  description?: string;
  tetUConfig: TetUConfig;
}

export interface ClientData {
  id: string;
  firm_id: string;
  name: string;
  contact_person?: string;
  tax_id: string;
  tax_payer_id: string;
  industry?: string;
}

export interface InvoiceData {
  id: string;
  in_or_out: "in" | "out";
  invoice_serial_code: string;
  year_month: string;
  extracted_data: Record<string, unknown>;
}

export interface AllowanceData {
  id: string;
  in_or_out: "in" | "out";
  original_invoice_serial_code?: string;
  extracted_data: Record<string, unknown>;
}

export interface InvoiceRangeData {
  id: string;
  year_month: string;
  invoice_type: string;
  start_number: string;
  end_number: string;
}

export interface TestCaseData {
  client: ClientData;
  invoices: InvoiceData[];
  allowances: AllowanceData[];
  invoiceRanges: InvoiceRangeData[];
}

export interface TestCase {
  name: string;
  manifest: TestCaseManifest;
  data: TestCaseData;
  expectedDir: string;
}

// ============================================================================
// Constants
// ============================================================================

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/reports");

// ============================================================================
// Discovery
// ============================================================================

/**
 * Discovers all test case directories that contain a manifest.json
 */
export function getTestCases(): string[] {
  const entries = fs.readdirSync(FIXTURES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const manifestPath = path.join(FIXTURES_DIR, entry.name, "manifest.json");
      return fs.existsSync(manifestPath);
    })
    .map((entry) => entry.name);
}

/**
 * Loads a test case by name (directory name)
 */
export function loadTestCase(caseName: string): TestCase {
  const caseDir = path.join(FIXTURES_DIR, caseName);
  const manifestPath = path.join(caseDir, "manifest.json");
  const dataDir = path.join(caseDir, "data");
  const expectedDir = path.join(caseDir, "expected");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Test case ${caseName} missing manifest.json`);
  }

  const manifest: TestCaseManifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf-8")
  );

  const loadJson = <T>(filename: string, defaultValue: T): T => {
    const filePath = path.join(dataDir, filename);
    if (!fs.existsSync(filePath)) return defaultValue;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  };

  const data: TestCaseData = {
    client: loadJson("client.json", null as unknown as ClientData),
    invoices: loadJson("invoices.json", []),
    allowances: loadJson("allowances.json", []),
    invoiceRanges: loadJson("invoice_ranges.json", []),
  };

  if (!data.client) {
    throw new Error(`Test case ${caseName} missing data/client.json`);
  }

  return {
    name: caseName,
    manifest,
    data,
    expectedDir,
  };
}

/**
 * Reads an expected output file (.TXT or .TET_U)
 */
export function readExpectedFile(
  caseName: string,
  extension: "TXT" | "TET_U"
): string {
  const caseDir = path.join(FIXTURES_DIR, caseName);
  const expectedDir = path.join(caseDir, "expected");
  const files = fs.readdirSync(expectedDir);
  const file = files.find((f) => f.endsWith(`.${extension}`));

  if (!file) {
    throw new Error(`Expected ${extension} file not found for ${caseName}`);
  }

  return fs.readFileSync(path.join(expectedDir, file), "utf-8");
}

// ============================================================================
// Database Seeding
// ============================================================================

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

/**
 * Seeds a test case into the database
 */
export async function seedTestCase(
  caseName: string,
  supabase: SupabaseClient<Database>
): Promise<{ userId: string; cleanup: () => Promise<void> }> {
  const testCase = loadTestCase(caseName);
  const { client, invoices, allowances, invoiceRanges } = testCase.data;

  // Create test user
  const email = `report-test+${Date.now()}@example.com`;
  const { data: userData, error: userError } =
    await supabase.auth.admin.createUser({
      email,
      password: "test-password",
      email_confirm: true,
    });

  if (userError || !userData.user) {
    throw userError ?? new Error("Failed to create test user");
  }

  const userId = userData.user.id;

  await withPgClient(async (pg) => {
    await pg.query("BEGIN");

    try {
      // Insert dedicated test firm (isolates from production data)
      await pg.query(
        `INSERT INTO firms (id, name, tax_id, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [TEST_FIRM_ID, TEST_FIRM_NAME, client.tax_id]
      );

      // Insert client under test firm (overriding any firm_id from fixture data)
      await pg.query(
        `INSERT INTO clients (id, firm_id, name, contact_person, tax_id, tax_payer_id, industry, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (id) DO UPDATE SET firm_id = $2`,
        [
          client.id,
          TEST_FIRM_ID,
          client.name,
          client.contact_person,
          client.tax_id,
          client.tax_payer_id,
          client.industry,
        ]
      );

      // Insert profile for test user
      await pg.query(
        `INSERT INTO profiles (id, firm_id, name, role)
         VALUES ($1, $2, 'Test User', 'admin')
         ON CONFLICT (id) DO UPDATE SET firm_id = EXCLUDED.firm_id`,
        [userId, TEST_FIRM_ID]
      );

      // Insert tax filing period (or get existing one)
      const taxPeriodResult = await pg.query(
        `INSERT INTO tax_filing_periods (id, firm_id, client_id, year_month, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'open', NOW(), NOW())
         ON CONFLICT (client_id, year_month) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [crypto.randomUUID(), TEST_FIRM_ID, client.id, testCase.manifest.reportPeriod]
      );
      const taxPeriodId = taxPeriodResult.rows[0].id;

      // Insert invoice ranges
      for (const range of invoiceRanges) {
        await pg.query(
          `INSERT INTO invoice_ranges (id, firm_id, client_id, year_month, invoice_type, start_number, end_number, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [
            range.id,
            TEST_FIRM_ID,
            client.id,
            range.year_month,
            range.invoice_type,
            range.start_number,
            range.end_number,
          ]
        );
      }

      // Insert invoices
      for (const invoice of invoices) {
        await pg.query(
          `INSERT INTO invoices (id, firm_id, client_id, in_or_out, invoice_serial_code, year_month, status, extracted_data, uploaded_by, created_at, tax_filing_period_id, storage_path, filename)
           VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8, NOW(), $9, '', '')
           ON CONFLICT (id) DO NOTHING`,
          [
            invoice.id,
            TEST_FIRM_ID,
            client.id,
            invoice.in_or_out,
            invoice.invoice_serial_code,
            invoice.year_month,
            JSON.stringify(invoice.extracted_data),
            userId,
            taxPeriodId,
          ]
        );
      }

      // Insert allowances
      for (const allowance of allowances) {
        await pg.query(
          `INSERT INTO allowances (id, firm_id, client_id, in_or_out, original_invoice_serial_code, status, extracted_data, uploaded_by, created_at, tax_filing_period_id, storage_path, filename)
           VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, NOW(), $8, '', '')
           ON CONFLICT (id) DO NOTHING`,
          [
            allowance.id,
            TEST_FIRM_ID,
            client.id,
            allowance.in_or_out,
            allowance.original_invoice_serial_code,
            JSON.stringify(allowance.extracted_data),
            userId,
            taxPeriodId,
          ]
        );
      }

      await pg.query("COMMIT");
    } catch (err) {
      await pg.query("ROLLBACK");
      throw err;
    }
  });

  const cleanup = async () => {
    // Only clean up the test user profile - leave fixture data intact
    // since it may be shared with other tests or be pre-existing data
    await withPgClient(async (pg) => {
      await pg.query(`DELETE FROM invoices WHERE uploaded_by = $1`, [userId]);
      await pg.query(`DELETE FROM allowances WHERE uploaded_by = $1`, [userId]);
      await pg.query(`DELETE FROM profiles WHERE id = $1`, [userId]);
    });
    await supabase.auth.admin.deleteUser(userId);
  };

  return { userId, cleanup };
}

// ============================================================================
// Utilities
// ============================================================================

export const normalizeLineEndings = (str: string): string =>
  str.replace(/\r\n/g, "\n").trim();
