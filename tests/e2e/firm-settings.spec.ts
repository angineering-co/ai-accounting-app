import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import type { Database } from "@/supabase/database.types";
import type { E2EFixture } from "./auth.setup";

// Load env so the service client can talk to local Supabase
const projectRoot = path.resolve(__dirname, "../..");
loadEnvConfig(projectRoot, true);

function loadFixture(): E2EFixture {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, ".auth", "fixture.json"), "utf-8"),
  );
}

function getServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// Use a period with no invoices/allowances so the .TET_U button is enabled
// (the button is disabled when any document for the period isn't `confirmed`).
// Picking a yearMonth distinct from the auth.setup fixture's "11409" avoids collision.
const EMPTY_PERIOD_YYYMM = "11410";

// All tests in this file share firm state (the firms.settings JSONB), so run serially.
test.describe.configure({ mode: "serial" });

test.describe("Firm settings page → .TET_U pre-fill", () => {
  let supabase: SupabaseClient<Database>;
  let fixture: E2EFixture;
  let emptyPeriodId: string;

  test.beforeAll(async () => {
    supabase = getServiceClient();
    fixture = loadFixture();

    // Seed an empty tax-filing period so the .TET_U button is enabled
    const { data: period, error } = await supabase
      .from("tax_filing_periods")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        year_month: EMPTY_PERIOD_YYYMM,
        status: "open",
      })
      .select("id")
      .single();
    if (error || !period) throw error ?? new Error("seed period failed");
    emptyPeriodId = period.id;
  });

  test.afterAll(async () => {
    // Drop the seeded period
    if (emptyPeriodId) {
      await supabase.from("tax_filing_periods").delete().eq("id", emptyPeriodId);
    }
    // Wipe firm settings so other test files start clean
    await supabase
      .from("firms")
      .update({ settings: null })
      .eq("id", fixture.firmId);
  });

  test("saves firm settings and pre-fills the .TET_U dialog", async ({ page }) => {
    const settingsUrl = `/firm/${fixture.firmId}/settings`;
    const periodUrl = `/firm/${fixture.firmId}/client/${fixture.clientId}/period/${EMPTY_PERIOD_YYYMM}`;

    // ── Step 1: open settings page and fill firm-level TET_U fields ──
    await page.goto(settingsUrl);
    await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();

    await page.locator('input[name="settings.agent_registration_number"]').fill("AG-E2E-001");
    await page.locator('input[name="settings.declarer_name"]').fill("測試申報人");
    await page.locator('input[name="settings.declarer_id"]').fill("A123456789");
    await page.locator('input[name="settings.declarer_phone_area_code"]').fill("02");
    await page.locator('input[name="settings.declarer_phone"]').fill("27201234");
    await page.locator('input[name="settings.declarer_phone_extension"]').fill("100");

    await page.getByRole("button", { name: "儲存設定" }).click();
    await expect(page.locator("text=設定已儲存")).toBeVisible({ timeout: 5000 });

    // ── Step 2: reload settings to confirm persistence ──
    await page.goto(settingsUrl);
    await expect(
      page.locator('input[name="settings.agent_registration_number"]'),
    ).toHaveValue("AG-E2E-001");
    await expect(
      page.locator('input[name="settings.declarer_name"]'),
    ).toHaveValue("測試申報人");
    await expect(
      page.locator('input[name="settings.declarer_phone"]'),
    ).toHaveValue("27201234");

    // ── Step 3: navigate to the empty period, open the 報表產生 tab, click .TET_U ──
    await page.goto(periodUrl);
    await page.getByRole("tab", { name: "報表產生" }).click();
    const tetUButton = page.getByRole("button", { name: /產生申報書 \.TET_U/ });
    await expect(tetUButton).toBeEnabled({ timeout: 10000 });
    await tetUButton.click();

    // Dialog should appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // ── Step 4: verify firm-level fields are pre-filled from saved settings ──
    await expect(dialog.locator('input[name="agentRegistrationNumber"]')).toHaveValue(
      "AG-E2E-001",
    );
    await expect(dialog.locator('input[name="declarerName"]')).toHaveValue(
      "測試申報人",
    );
    await expect(dialog.locator('input[name="declarerId"]')).toHaveValue(
      "A123456789",
    );
    await expect(dialog.locator('input[name="declarerPhoneAreaCode"]')).toHaveValue(
      "02",
    );
    await expect(dialog.locator('input[name="declarerPhone"]')).toHaveValue(
      "27201234",
    );
    await expect(dialog.locator('input[name="declarerPhoneExtension"]')).toHaveValue(
      "100",
    );
  });
});
