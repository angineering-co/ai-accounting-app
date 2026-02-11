#!/usr/bin/env npx tsx
/**
 * Export fixture data from the database for report testing
 *
 * Usage:
 *   npx tsx scripts/export-fixture.ts --client-id=<uuid> --period=11501
 *
 * Options:
 *   --client-id    Client UUID (required)
 *   --period       Tax period in YYYMM format (required)
 *   --output-dir   Override output directory (optional)
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as fs from "fs";
import * as path from "path";
import type { Database } from "@/supabase/database.types";
import { TEST_FIRM_ID } from "@/tests/utils/constants";

// ============================================================================
// Arg Parsing
// ============================================================================

function parseArgs(): { clientId: string; period: string; outputDir?: string } {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (const arg of args) {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }

  if (!parsed["client-id"]) {
    console.error("Error: --client-id is required");
    process.exit(1);
  }

  if (!parsed["period"]) {
    console.error("Error: --period is required");
    process.exit(1);
  }

  return {
    clientId: parsed["client-id"],
    period: parsed["period"],
    outputDir: parsed["output-dir"],
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { clientId, period, outputDir: customOutputDir } = parseArgs();

  // Initialize Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  console.log(`Fetching data for client ${clientId}, period ${period}...`);

  // Fetch client
  const { data: dbClient, error: clientError } = await supabase
    .from("clients")
    .select("id, firm_id, name, contact_person, tax_id, tax_payer_id, industry")
    .eq("id", clientId)
    .single();

  if (clientError || !dbClient) {
    console.error("Error fetching client:", clientError?.message || "Not found");
    process.exit(1);
  }

  // Replace firm_id and client_id to isolate from production data
  const client = { ...dbClient, id: crypto.randomUUID(), firm_id: TEST_FIRM_ID };

  console.log(`Found client: ${client.name} (${client.tax_id})`);
  console.log(`  → Using test firm_id: ${client.firm_id} (instead of real: ${dbClient.firm_id})`);
  console.log(`  → Using test client_id: ${client.id} (instead of real: ${dbClient.id})`);

  // Fetch tax period
  const { data: taxPeriod } = await supabase
    .from("tax_filing_periods")
    .select("id")
    .eq("client_id", clientId)
    .eq("year_month", period)
    .single();

  const taxPeriodId = taxPeriod?.id;

  console.log(`Found tax period: ${taxPeriodId}`);

  // Fetch invoices
  const { data: invoices } = taxPeriodId
    ? await supabase
      .from("invoices")
      .select("id, in_or_out, invoice_serial_code, year_month, extracted_data")
      .eq("client_id", clientId)
      .eq("tax_filing_period_id", taxPeriodId)
      .eq("status", "confirmed")
    : { data: [] };

  const invoicesData = invoices?.map((invoice) => ({
    ...invoice,
    id: crypto.randomUUID(),
  }));

  console.log(`Found ${invoices?.length || 0} invoices`);

  // Fetch allowances
  const { data: allowances } = taxPeriodId
    ? await supabase
      .from("allowances")
      .select(
        "id, in_or_out, original_invoice_serial_code, extracted_data"
      )
      .eq("client_id", clientId)
      .eq("tax_filing_period_id", taxPeriodId)
      .eq("status", "confirmed")
    : { data: [] };

  const allowancesData = allowances?.map((allowance) => ({
    ...allowance,
    id: crypto.randomUUID(),
  }));

  console.log(`Found ${allowances?.length || 0} allowances`);

  // Fetch invoice ranges
  const { data: invoiceRanges } = await supabase
    .from("invoice_ranges")
    .select("id, year_month, invoice_type, start_number, end_number")
    .eq("client_id", clientId)
    .eq("year_month", period);

  const invoiceRangesData = invoiceRanges?.map((invoiceRange) => ({
    ...invoiceRange,
    id: crypto.randomUUID(),
  }));

  console.log(`Found ${invoiceRanges?.length || 0} invoice ranges`);

  // Determine output directory
  const outputDir =
    customOutputDir ||
    path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "reports",
      client.tax_id
    );

  // Create directories
  const dataDir = path.join(outputDir, "data");
  const expectedDir = path.join(outputDir, "expected");

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(expectedDir, { recursive: true });

  // Write manifest
  const manifest = {
    clientId: client.id,
    reportPeriod: period,
    description: "",
    tetUConfig: {
      fileNumber: "",
      taxPayerId: client.tax_payer_id || "",
      consolidatedDeclarationCode: "0",
      declarationCode: "1",
      midYearClosureTaxPayable: 0,
      previousPeriodCarryForwardTax: 0,
      midYearClosureTaxRefundable: 0,
      declarationType: "1",
      countyCity: "",
      declarationMethod: "2",
      declarerId: "          ",
      declarerName: "黃勝平",
      declarerPhoneAreaCode: "04",
      declarerPhone: "23758628",
      declarerPhoneExtension: "",
      agentRegistrationNumber: "104台財稅登字第4656號                             ",
    },
  };

  fs.writeFileSync(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  // Write client data
  fs.writeFileSync(
    path.join(dataDir, "client.json"),
    JSON.stringify(client, null, 2)
  );

  // Write invoices
  fs.writeFileSync(
    path.join(dataDir, "invoices.json"),
    JSON.stringify(invoicesData || [], null, 2)
  );

  // Write allowances
  fs.writeFileSync(
    path.join(dataDir, "allowances.json"),
    JSON.stringify(allowancesData || [], null, 2)
  );

  // Write invoice ranges
  fs.writeFileSync(
    path.join(dataDir, "invoice_ranges.json"),
    JSON.stringify(invoiceRangesData || [], null, 2)
  );

  console.log(`\n✅ Fixture exported to: ${outputDir}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Add verified .TXT and .TET_U files to ${expectedDir}/`);
  console.log(`  2. Complete tetUConfig in manifest.json`);
  console.log(`  3. Run tests: npm test lib/services/reports.test.ts`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
