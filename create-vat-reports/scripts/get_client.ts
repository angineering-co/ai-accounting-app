import { createClient } from "@supabase/supabase-js";
import { Database } from "../../supabase/database.types";
import * as fs from "fs";
import * as path from "path";

async function getClient() {
  const clientId = process.argv[2];
  const outputDir = process.argv[3] || "./reports/temp";

  if (!clientId) {
    console.error("Usage: tsx get_client.ts <clientId> [outputDir]");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables.");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (error || !client) {
    console.error(`Error: Client not found (${clientId})`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "client.json");
  fs.writeFileSync(outputPath, JSON.stringify(client, null, 2));
  console.log(`✅ Saved client info to ${outputPath}`);
}

getClient().catch(console.error);
