import { createClient } from "@supabase/supabase-js";
import { Database } from "../../supabase/database.types";
import { RocPeriod } from "../../lib/domain/roc-period";
import * as fs from "fs";
import * as path from "path";

async function getInvoiceRanges() {
  const clientId = process.argv[2];
  const yyymm = process.argv[3];
  const outputDir = process.argv[4] || "./reports/temp";

  if (!clientId || !yyymm) {
    console.error("Usage: tsx get_invoice_ranges.ts <clientId> <yyymm> [outputDir]");
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

  // Get invoice ranges
  const { data: ranges, error: rangesError } = await supabase
    .from("invoice_ranges")
    .select("*")
    .eq("client_id", clientId)
    .eq("year_month", period.toString())
    .order("start_number", { ascending: true });

  if (rangesError) {
    console.error(`Error fetching invoice ranges: ${rangesError.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "ranges.json");
  fs.writeFileSync(outputPath, JSON.stringify(ranges || [], null, 2));
  console.log(`✅ Saved ${ranges?.length || 0} invoice ranges to ${outputPath}`);
}

getInvoiceRanges().catch(console.error);
