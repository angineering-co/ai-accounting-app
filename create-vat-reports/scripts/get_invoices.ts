import { createClient } from "@supabase/supabase-js";
import { Database } from "../../supabase/database.types";
import { RocPeriod } from "../../lib/domain/roc-period";
import * as fs from "fs";
import * as path from "path";

async function getInvoices() {
  const clientId = process.argv[2];
  const yyymm = process.argv[3];
  const outputDir = process.argv[4] || "./reports/temp";

  if (!clientId || !yyymm) {
    console.error("Usage: tsx get_invoices.ts <clientId> <yyymm> [outputDir]");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables.");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  const period = RocPeriod.fromYYYMM(yyymm);

  // 1. Get tax period
  const { data: taxPeriod, error: periodError } = await supabase
    .from("tax_filing_periods")
    .select("id")
    .eq("client_id", clientId)
    .eq("year_month", period.toString())
    .single();

  if (periodError || !taxPeriod) {
    console.error(`Error: Tax period not found for client ${clientId} and period ${period.toString()}`);
    process.exit(1);
  }

  // 2. Get invoices
  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", clientId)
    .eq("tax_filing_period_id", taxPeriod.id)
    .eq("status", "confirmed");

  if (invoicesError) {
    console.error(`Error fetching invoices: ${invoicesError.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "invoices.json");
  fs.writeFileSync(outputPath, JSON.stringify(invoices || [], null, 2));
  console.log(`✅ Saved ${invoices?.length || 0} invoices to ${outputPath}`);
}

getInvoices().catch(console.error);
