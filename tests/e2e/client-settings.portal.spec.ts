import { test, expect, type Page, type Locator } from "@playwright/test";
import fs from "fs";
import path from "path";
import type { E2EFixture } from "./auth.setup";

function loadFixture(): E2EFixture {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, ".auth", "fixture.json"), "utf-8"),
  );
}

function getPortalSettingsUrl(): string {
  const f = loadFixture();
  return `/firm/${f.firmId}/client/${f.clientId}/portal/settings`;
}

// Helper: navigate to the portal settings page
async function goToSettings(page: Page) {
  await page.goto(getPortalSettingsUrl());
  await page.getByRole("heading", { name: "設定" }).waitFor({ timeout: 10000 });
}

// Helper: find a settings Card by its title text
function getSection(page: Page, title: string): Locator {
  // Each section is a Card. Filter by the CardTitle text content.
  return page.locator("[class*='card']").filter({
    has: page.getByText(title, { exact: true }),
  });
}

// All tests modify the same client record, so they must run serially.
test.describe.configure({ mode: "serial" });

// ─── Company basics section ─────────────────────────────────────────

test.describe("Portal settings — company basics", () => {
  test("name, tax_id, tax_payer_id are read-only on portal", async ({ page }) => {
    await goToSettings(page);

    const section = getSection(page, "公司基本資料");

    await expect(section.getByRole("textbox", { name: "公司名稱" })).toBeDisabled();
    await expect(section.getByRole("textbox", { name: "統一編號" })).toBeDisabled();
    await expect(section.getByRole("textbox", { name: "稅籍編號" })).toBeDisabled();
  });

  test("can save address, mailing address, phone, email", async ({ page }) => {
    await goToSettings(page);

    const section = getSection(page, "公司基本資料");

    await section.locator('input[placeholder="請輸入公司地址"]').fill("台北市大安區復興南路200號");
    await section.locator('input[placeholder="請輸入通訊地址"]').fill("台北市信義區松仁路100號");
    await section.locator('input[placeholder="請輸入聯絡電話"]').fill("02-2700-5678");
    await section.locator('input[placeholder="請輸入聯絡信箱"]').fill("portal@snapbooks.ai");

    await section.locator("button", { hasText: "儲存" }).click();
    await expect(page.locator("text=公司基本資料已儲存")).toBeVisible({ timeout: 5000 });

    // Reload and verify persistence
    await goToSettings(page);
    const s = getSection(page, "公司基本資料");
    await expect(s.locator('input[placeholder="請輸入公司地址"]')).toHaveValue("台北市大安區復興南路200號");
    await expect(s.locator('input[placeholder="請輸入通訊地址"]')).toHaveValue("台北市信義區松仁路100號");
    await expect(s.locator('input[placeholder="請輸入聯絡電話"]')).toHaveValue("02-2700-5678");
    await expect(s.locator('input[placeholder="請輸入聯絡信箱"]')).toHaveValue("portal@snapbooks.ai");
  });
});

// ─── People section ─────────────────────────────────────────────────

test.describe("Portal settings — people", () => {
  test("can save responsible person", async ({ page }) => {
    await goToSettings(page);

    const section = getSection(page, "負責人與股東");

    await section.locator('input[placeholder="負責人姓名"]').fill("陳美麗");
    await section.locator('input[placeholder="身分證字號"]').first().fill("B234567890");

    await section.locator("button", { hasText: "儲存" }).click();
    await expect(page.locator("text=負責人與股東資料已儲存")).toBeVisible({ timeout: 5000 });

    await goToSettings(page);
    const s = getSection(page, "負責人與股東");
    await expect(s.locator('input[placeholder="負責人姓名"]')).toHaveValue("陳美麗");
    await expect(s.locator('input[placeholder="身分證字號"]').first()).toHaveValue("B234567890");
  });
});

// ─── Landlord section ───────────────────────────────────────────────

test.describe("Portal settings — landlord", () => {
  test("can select landlord type and save rent amount", async ({ page }) => {
    await goToSettings(page);

    const section = getSection(page, "租賃與扣繳");

    await section.locator("label", { hasText: "公司" }).click();

    const rentInput = section.locator('input[placeholder="0"]');
    await rentInput.waitFor();
    await rentInput.fill("50000");

    await section.locator("button", { hasText: "儲存" }).click();
    await expect(page.locator("text=租賃與扣繳資料已儲存")).toBeVisible({ timeout: 5000 });

    await goToSettings(page);
    const s = getSection(page, "租賃與扣繳");
    await expect(s.locator("#landlord-company")).toBeChecked();
    await expect(s.locator('input[placeholder="0"]')).toHaveValue("50000");
  });
});

// ─── Invoice purchasing section ─────────────────────────────────────

test.describe("Portal settings — invoice purchasing", () => {
  test("enabling shows quantity inputs and saves", async ({ page }) => {
    await goToSettings(page);

    const section = getSection(page, "代購發票");

    await section.locator("label", { hasText: "需要代購發票" }).click();

    const quantityInputs = section.locator('.rounded-md.border input');
    await expect(quantityInputs).toHaveCount(4);
    await quantityInputs.first().fill("2");

    await section.locator("button", { hasText: "儲存" }).click();
    await expect(page.locator("text=代購發票設定已儲存")).toBeVisible({ timeout: 5000 });

    await goToSettings(page);
    const s = getSection(page, "代購發票");
    await expect(s.locator('.rounded-md.border input').first()).toHaveValue("2");
  });
});

// ─── Navigation ─────────────────────────────────────────────────────

test.describe("Portal settings — navigation", () => {
  test("設定 link exists in navigation", async ({ page }) => {
    await goToSettings(page);
    await expect(page.getByRole("link", { name: "設定" })).toBeAttached();
  });
});
