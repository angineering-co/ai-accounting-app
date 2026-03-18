import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import type { E2EFixture } from "./auth.setup";

function loadFixture(): E2EFixture {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, ".auth", "fixture.json"), "utf-8"),
  );
}

function getPeriodUrl(): string {
  const f = loadFixture();
  return `/firm/${f.firmId}/client/${f.clientId}/period/${f.yearMonth}`;
}

// Helper: open review dialog by clicking on a row with the given serial code
async function openInvoiceDialog(
  page: import("@playwright/test").Page,
  serialCode: string,
) {
  await page.goto(getPeriodUrl());
  // Wait for the invoice table section to appear with loaded data
  await page.locator("text=發票").first().waitFor({ timeout: 10000 });

  // Wait for SWR data to arrive — invoice count should be > 0
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      // Match "發票 (N)" where N > 0
      const match = text.match(/發票 \((\d+)\)/);
      return match && parseInt(match[1]) > 0;
    },
    { timeout: 15000 },
  );
  // Click the row containing the serial code
  await page.locator(`table tbody tr:has-text("${serialCode}")`).click();
  // Wait for dialog to appear
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
}

// Helper: get the deductible select trigger inside the dialog
function deductibleSelect(page: import("@playwright/test").Page) {
  return page
    .locator('[role="dialog"]')
    .locator("label", { hasText: "可扣抵" })
    .locator("..")
    .locator("button[role='combobox']");
}

// Helper: get the confirm button
function confirmButton(page: import("@playwright/test").Page) {
  return page
    .locator('[role="dialog"]')
    .locator("button", { hasText: "確認並儲存" });
}

// Helper: get the account select trigger inside the dialog
function accountSelect(page: import("@playwright/test").Page) {
  return page
    .locator('[role="dialog"]')
    .locator("label", { hasText: "會計科目" })
    .locator("..")
    .locator("button[role='combobox']");
}

// ─── Group 1: Deductible field behavior ─────────────────────────────────────

test.describe("Deductible field behavior", () => {
  test("non-deductible account shows 否 and is disabled", async ({ page }) => {
    // Invoice 1: account = "6128 職工福利" (non-deductible)
    await openInvoiceDialog(page, "AA00000001");

    const select = deductibleSelect(page);
    await expect(select).toBeDisabled();
    await expect(select).toHaveText("否");
  });

  test("deductible account with DB deductible=false shows 否 and is enabled", async ({
    page,
  }) => {
    // Invoice 2: account = "6112 文具用品" (deductible), deductible=false
    await openInvoiceDialog(page, "BB00000002");

    const select = deductibleSelect(page);
    await expect(select).toBeEnabled();
    await expect(select).toHaveText("否");
  });

  test("deductible account with DB deductible=true shows 是 and is enabled", async ({
    page,
  }) => {
    // Invoice 3: account = "6112 文具用品" (deductible), deductible=true
    await openInvoiceDialog(page, "CC00000003");

    const select = deductibleSelect(page);
    await expect(select).toBeEnabled();
    await expect(select).toHaveText("是");
  });

  test("switching to non-deductible account disables deductible and sets to 否", async ({
    page,
  }) => {
    // Invoice 3: starts with deductible account
    await openInvoiceDialog(page, "CC00000003");

    // Initially enabled
    const select = deductibleSelect(page);
    await expect(select).toBeEnabled();

    // Change account to non-deductible "6128 職工福利"
    const acctSelect = accountSelect(page);
    await acctSelect.click();
    await page.locator('[role="option"]', { hasText: "6128 職工福利" }).click();

    // Now deductible should be disabled and show 否
    await expect(select).toBeDisabled();
    await expect(select).toHaveText("否");
  });
});

// ─── Group 2: Confirm button on confirmed invoice ───────────────────────────

test.describe("Confirm button on confirmed invoice", () => {
  test("confirmed invoice with no edits has disabled confirm button", async ({
    page,
  }) => {
    // Invoice 4: status = "confirmed"
    await openInvoiceDialog(page, "DD00000004");

    const btn = confirmButton(page);
    await expect(btn).toBeDisabled();
  });

  test("editing a field on confirmed invoice enables confirm button", async ({
    page,
  }) => {
    // Invoice 4: confirmed
    await openInvoiceDialog(page, "DD00000004");

    const btn = confirmButton(page);
    await expect(btn).toBeDisabled();

    // Edit the summary field
    const summaryInput = page
      .locator('[role="dialog"]')
      .locator("label", { hasText: "摘要" })
      .locator("..")
      .locator("input");
    await summaryInput.fill("修改後的摘要");

    // Confirm button should now be enabled
    await expect(btn).toBeEnabled();
  });
});

// ─── Group 3: Consumer invoice validation ───────────────────────────────────

test.describe("Consumer invoice validation", () => {
  test("consumer invoice with empty buyerTaxId is valid and confirm is enabled", async ({
    page,
  }) => {
    // Invoice 5: buyerName="", buyerTaxId="" (consumer)
    await openInvoiceDialog(page, "EE00000005");

    const btn = confirmButton(page);
    await expect(btn).toBeEnabled();
  });

  test("non-consumer buyerName with empty buyerTaxId is still valid (superRefine removed)", async ({
    page,
  }) => {
    // Invoice 6: buyerName="某公司", buyerTaxId="" — should be valid (no superRefine)
    await openInvoiceDialog(page, "FF00000006");

    const btn = confirmButton(page);
    await expect(btn).toBeEnabled();
  });
});

// ─── Group 4: Computed total & AI mismatch warning ──────────────────────────

test.describe("Computed total and AI mismatch warning", () => {
  test("total field is computed from sales + tax and is read-only", async ({
    page,
  }) => {
    // Invoice 2: totalSales=2000, tax=100
    await openInvoiceDialog(page, "BB00000002");

    const dialog = page.locator('[role="dialog"]');
    const totalInput = dialog
      .locator("label", { hasText: "總計" })
      .locator("..")
      .locator("input");

    // Total should be computed (2000 + 100 = 2100) and disabled
    await expect(totalInput).toBeDisabled();
    await expect(totalInput).toHaveValue("2100");
  });

  test("total updates automatically when sales changes", async ({ page }) => {
    await openInvoiceDialog(page, "BB00000002");

    const dialog = page.locator('[role="dialog"]');
    const salesInput = dialog
      .locator("label", { hasText: "銷售額" })
      .locator("..")
      .locator("input");
    const totalInput = dialog
      .locator("label", { hasText: "總計" })
      .locator("..")
      .locator("input");

    // Change sales → total should auto-update
    await salesInput.fill("5000");
    await expect(totalInput).toHaveValue("5100"); // 5000 + 100
  });

  test("changing sales to mismatch AI total shows warning but does not block confirm", async ({
    page,
  }) => {
    // Invoice 2: AI extracted totalAmount=2100
    await openInvoiceDialog(page, "BB00000002");

    const dialog = page.locator('[role="dialog"]');
    const btn = confirmButton(page);
    await expect(btn).toBeEnabled();

    // No warning initially (sales=2000, tax=100, AI total=2100 → match)
    await expect(
      dialog.locator("text=AI 辨識總計為"),
    ).not.toBeVisible();

    // Change sales to create mismatch with AI's extracted total
    const salesInput = dialog
      .locator("label", { hasText: "銷售額" })
      .locator("..")
      .locator("input");
    await salesInput.fill("9999");

    // Warning should appear (AI total was 2100, computed is 9999+100=10099)
    await expect(
      dialog.locator("text=AI 辨識總計為 2100"),
    ).toBeVisible();

    // Confirm button should still be enabled (non-blocking warning)
    await expect(btn).toBeEnabled();
  });
});
