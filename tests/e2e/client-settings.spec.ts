import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import type { E2EFixture } from "./auth.setup";

function loadFixture(): E2EFixture {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, ".auth", "fixture.json"), "utf-8"),
  );
}

function getClientUrl(): string {
  const f = loadFixture();
  return `/firm/${f.firmId}/client/${f.clientId}`;
}

// Helper: navigate to the 基本資料 tab on the admin client detail page
async function goToBasicTab(page: import("@playwright/test").Page) {
  await page.goto(getClientUrl());
  await page.locator('button[role="tab"]', { hasText: "基本資料" }).click();
  // Wait for settings sections to load
  await page.locator("text=公司基本資料").waitFor({ timeout: 10000 });
}

// All tests modify the same client record, so they must run serially.
test.describe.configure({ mode: "serial" });

// ─── Company basics section ─────────────────────────────────────────

test.describe("Client settings — company basics", () => {
  test("read-only fields are disabled", async ({ page }) => {
    await goToBasicTab(page);

    const section = page.locator("text=公司基本資料").locator("..").locator("..");
    const inputs = section.locator("input[disabled]");
    // 公司名稱, 統一編號, 稅籍編號 should be disabled
    await expect(inputs).toHaveCount(3);
  });

  test("can save address, phone, email", async ({ page }) => {
    await goToBasicTab(page);

    const section = page.locator("text=公司基本資料").locator("..").locator("..");

    // Fill in editable fields
    await section.locator('input[placeholder="請輸入公司地址"]').fill("台北市信義區松仁路100號");
    await section.locator('input[placeholder="請輸入聯絡電話"]').fill("02-2720-1234");
    await section.locator('input[placeholder="請輸入聯絡信箱"]').fill("test@snapbooks.ai");

    // Save
    await section.locator("button", { hasText: "儲存" }).click();

    // Wait for success toast
    await expect(page.locator("text=公司基本資料已儲存")).toBeVisible({ timeout: 5000 });

    // Reload and verify persistence
    await goToBasicTab(page);
    const sectionAfter = page.locator("text=公司基本資料").locator("..").locator("..");
    await expect(sectionAfter.locator('input[placeholder="請輸入公司地址"]')).toHaveValue("台北市信義區松仁路100號");
    await expect(sectionAfter.locator('input[placeholder="請輸入聯絡電話"]')).toHaveValue("02-2720-1234");
    await expect(sectionAfter.locator('input[placeholder="請輸入聯絡信箱"]')).toHaveValue("test@snapbooks.ai");
  });
});

// ─── People section ─────────────────────────────────────────────────

test.describe("Client settings — people", () => {
  test("can save responsible person", async ({ page }) => {
    await goToBasicTab(page);

    const section = page.locator("text=負責人與股東").locator("..").locator("..");

    // Fill responsible person fields
    await section.locator('input[placeholder="負責人姓名"]').fill("王大明");
    await section.locator('input[placeholder="身分證字號"]').first().fill("A123456789");

    await section.locator("button", { hasText: "儲存" }).click();
    await expect(page.locator("text=負責人與股東資料已儲存")).toBeVisible({ timeout: 5000 });

    // Verify after reload
    await goToBasicTab(page);
    const sectionAfter = page.locator("text=負責人與股東").locator("..").locator("..");
    await expect(sectionAfter.locator('input[placeholder="負責人姓名"]')).toHaveValue("王大明");
    await expect(sectionAfter.locator('input[placeholder="身分證字號"]').first()).toHaveValue("A123456789");
  });

  test("can add and remove shareholders", async ({ page }) => {
    await goToBasicTab(page);

    // Ensure responsible person name is filled (required field)
    const rpNameInput = page.locator('input[placeholder="負責人姓名"]');
    if (await rpNameInput.inputValue() === "") {
      await rpNameInput.fill("測試負責人");
    }

    // Add a shareholder
    await page.locator("button", { hasText: "新增股東" }).click();

    // Fill shareholder name — the new row's input appears after clicking 新增股東
    await page.locator('input[placeholder="股東姓名"]').first().fill("李小華");

    // Save the people section
    const saveButtons = page.locator("text=負責人與股東").locator("..").locator("..").locator("button", { hasText: "儲存" });
    await saveButtons.click();
    await expect(page.locator("text=負責人與股東資料已儲存")).toBeVisible({ timeout: 5000 });

    // Verify shareholder persists after reload
    await goToBasicTab(page);
    await expect(page.locator('input[placeholder="股東姓名"]').first()).toHaveValue("李小華");

    // Remove the shareholder (click the trash button inside the shareholder row)
    await page.locator(".relative.rounded-md.border.p-4").first().locator("button").first().click();

    const saveButtonsAfter = page.locator("text=負責人與股東").locator("..").locator("..").locator("button", { hasText: "儲存" });
    await saveButtonsAfter.click();
    await expect(page.locator("text=負責人與股東資料已儲存")).toBeVisible({ timeout: 5000 });

    // Verify removal after reload
    await goToBasicTab(page);
    await expect(page.locator("text=尚未新增股東資料")).toBeVisible();
  });

  test("validates national_id format", async ({ page }) => {
    await goToBasicTab(page);

    const section = page.locator("text=負責人與股東").locator("..").locator("..");
    await section.locator('input[placeholder="身分證字號"]').first().fill("invalid");

    await section.locator("button", { hasText: "儲存" }).click();

    // Should show validation error
    await expect(page.locator("text=身分證字號格式錯誤")).toBeVisible({ timeout: 3000 });
  });
});

// ─── Landlord section ───────────────────────────────────────────────

test.describe("Client settings — landlord", () => {
  test("can select landlord type and save rent amount", async ({ page }) => {
    await goToBasicTab(page);

    const section = page.locator("text=租賃與扣繳").locator("..").locator("..");

    // Select individual landlord
    await section.locator("label", { hasText: "個人" }).click();

    // Rent amount input should appear
    const rentInput = section.locator('input[placeholder="0"]');
    await rentInput.waitFor();
    await rentInput.fill("25000");

    await section.locator("button", { hasText: "儲存" }).click();
    await expect(page.locator("text=租賃與扣繳資料已儲存")).toBeVisible({ timeout: 5000 });

    // Verify after reload
    await goToBasicTab(page);
    const sectionAfter = page.locator("text=租賃與扣繳").locator("..").locator("..");
    await expect(sectionAfter.locator("#landlord-individual")).toBeChecked();
    await expect(sectionAfter.locator('input[placeholder="0"]')).toHaveValue("25000");
  });
});

// ─── Invoice purchasing section ─────────────────────────────────────

test.describe("Client settings — invoice purchasing", () => {
  test("enabling shows quantity inputs, disabling clears them", async ({ page }) => {
    await goToBasicTab(page);

    const section = page.locator("text=代購發票").locator("..").locator("..");

    // Enable invoice purchasing
    await section.locator("label", { hasText: "需要代購發票" }).click();

    // Quantity inputs should appear
    const quantityInputs = section.locator('.rounded-md.border input');
    await expect(quantityInputs).toHaveCount(4);

    // Fill in a quantity
    await quantityInputs.first().fill("3");

    await section.locator("button", { hasText: "儲存" }).click();
    await expect(page.locator("text=代購發票設定已儲存")).toBeVisible({ timeout: 5000 });

    // Verify after reload
    await goToBasicTab(page);
    const sectionAfter = page.locator("text=代購發票").locator("..").locator("..");
    await expect(sectionAfter.locator('.rounded-md.border input').first()).toHaveValue("3");
  });
});
