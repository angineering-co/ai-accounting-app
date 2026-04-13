import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import type { E2EFixture } from "./auth.setup";

const projectRoot = path.resolve(__dirname, "../..");
loadEnvConfig(projectRoot, true);

export default async function globalTeardown() {
  const fixturePath = path.join(__dirname, ".auth", "fixture.json");
  if (!fs.existsSync(fixturePath)) {
    console.log("No fixture file found, skipping teardown.");
    return;
  }

  const fixture: E2EFixture = JSON.parse(
    fs.readFileSync(fixturePath, "utf-8"),
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("Missing Supabase env vars for teardown, skipping.");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Delete in order: invoices → tax periods → clients → profiles → firms → user
  if (fixture.invoiceIds.length > 0) {
    await supabase
      .from("invoices")
      .delete()
      .in("id", fixture.invoiceIds);
  }

  await supabase
    .from("tax_filing_periods")
    .delete()
    .eq("id", fixture.periodId);

  await supabase.from("clients").delete().eq("id", fixture.clientId);
  await supabase.from("profiles").delete().eq("id", fixture.userId);
  if (fixture.clientUserId) {
    await supabase.from("profiles").delete().eq("id", fixture.clientUserId);
  }
  await supabase.from("firms").delete().eq("id", fixture.firmId);
  await supabase.auth.admin.deleteUser(fixture.userId);
  if (fixture.clientUserId) {
    await supabase.auth.admin.deleteUser(fixture.clientUserId);
  }

  // Clean up fixture files
  fs.unlinkSync(fixturePath);
  const authDir = path.join(__dirname, ".auth");
  for (const f of ["admin-user.json", "client-user.json"]) {
    const p = path.join(authDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  console.log("E2E teardown complete.");
}
