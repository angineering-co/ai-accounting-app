import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../supabase/database.types";
import { generateTxtReport, generateTetUReport } from "../../lib/services/reports";
import { RocPeriod } from "../../lib/domain/roc-period";
import * as fs from "fs";
import * as path from "path";
import { TetUConfig } from "@/lib/domain/models";

async function generateReports() {
  const clientId = process.argv[2];
  const yyymm = process.argv[3];
  const outputDir = process.argv[4] || "./reports";

  if (!clientId || !yyymm) {
    console.error("Usage: tsx generate_reports.ts <clientId> <yyymm> [outputDir]");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables.");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  // 1. Fetch Client Info for naming
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("name, tax_id, tax_payer_id")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    console.error(`Error: Client not found (${clientId})`);
    process.exit(1);
  }

  const period = RocPeriod.fromYYYMM(yyymm);
  console.log(`Generating VAT reports for ${client.name} - ${period.format()}...`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // 2. Generate TXT Report
    console.log("- Generating .TXT report...");
    const txtContent = await generateTxtReport(clientId, yyymm, { supabaseClient: supabase as any });
    const txtPath = path.join(outputDir, `${client.tax_id}.TXT`);
    fs.writeFileSync(txtPath, txtContent);
    console.log(`  ✅ Saved: ${txtPath}`);

    // 3. Generate TET_U Report
    console.log("- Generating .TET_U report...");
    // We need a default config for TET_U
    const tetUConfig = {
      taxPayerId: client.tax_payer_id,
      declarationType: "1", // 按期申報
      countyCity: "臺北市", // Default
      declarationMethod: "1", // 自行申報
      declarerId: "A123456789", // Placeholder
      declarerName: "System Agent",
      declarerPhoneAreaCode: "02",
      declarerPhone: "12345678",
      declarerPhoneExtension: "",
      consolidatedDeclarationCode: "0", // 單一機構
      fileNumber: "00000000",
      midYearClosureTaxPayable: 0,
      midYearClosureTaxRefundable: 0,
      previousPeriodCarryForwardTax: 0,
    };

    const tetUContent = await generateTetUReport(clientId, yyymm, tetUConfig as TetUConfig, { supabaseClient: supabase as SupabaseClient<Database> });
    const tetUPath = path.join(outputDir, `${client.tax_id}.TET_U`);
    fs.writeFileSync(tetUPath, tetUContent);
    console.log(`  ✅ Saved: ${tetUPath}`);

    console.log("🎉 REPORT GENERATION COMPLETE.");
  } catch (error) {
    console.error("❌ FAILED to generate reports:", error);
    process.exit(1);
  }
}

generateReports().catch(console.error);
