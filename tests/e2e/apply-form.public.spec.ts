import { test, expect, type Page } from "@playwright/test";

const HAS_TURNSTILE = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Seed window.dataLayer before any page script runs so we can assert on
// gtag/sendGAEvent calls regardless of whether NEXT_PUBLIC_GA_ID is set in
// the test environment.
async function instrumentDataLayer(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { dataLayer: unknown[] }).dataLayer = [];
  });
}

async function readApplySubmitEvent(page: Page) {
  return page.evaluate(() => {
    type GAEvent = ["event", string, Record<string, unknown>];
    const dl = (window as unknown as { dataLayer: unknown[] }).dataLayer ?? [];
    const events: GAEvent[] = dl.map((e) => Array.from(e as ArrayLike<unknown>) as GAEvent);
    return events.find((e) => e[0] === "event" && e[1] === "apply_submit") ?? null;
  });
}

// Wait for Turnstile (test site keys auto-pass) so the submit button enables.
// When Turnstile is not configured the widget is hidden and submit is enabled
// immediately — so this is a no-op in that case.
async function waitForSubmitReady(page: Page) {
  const submitBtn = page.locator("button", { hasText: "送出申請" });
  await expect(submitBtn).toBeEnabled({ timeout: 15_000 });
}

async function fillContactFields(page: Page) {
  await page.fill("input#contactName", "E2E 測試");
  await page.fill("input#email", "e2e-test@example.com");
  await page.fill("input#phone", "0912345678");
}

test.describe("Apply form (public)", () => {
  test.beforeEach(async ({ page }) => {
    await instrumentDataLayer(page);
  });

  test("renders hero, path selection, and Turnstile widget when configured", async ({
    page,
  }) => {
    await page.goto("/apply");

    await expect(page.locator("h1", { hasText: "合作申請" })).toBeVisible();
    await expect(page.locator("button", { hasText: "還沒有統編" })).toBeVisible();
    await expect(page.locator("button", { hasText: "已經有統編" })).toBeVisible();

    if (HAS_TURNSTILE) {
      // Choose a path so the rest of the form (and Turnstile) renders.
      await page.locator("button", { hasText: "已經有統編" }).click();
      await expect(
        page.locator('iframe[src*="challenges.cloudflare.com"]'),
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("bookkeeping submission fires apply_submit with value=15120", async ({
    page,
  }) => {
    await page.goto("/apply");

    await page.locator("button", { hasText: "已經有統編" }).click();
    await page.fill("input#companyName", "速博測試有限公司");
    await page.fill("input#taxId", "12345678");
    await fillContactFields(page);

    await waitForSubmitReady(page);
    await page.locator("button", { hasText: "送出申請" }).click();

    await expect(page.locator("text=申請已送出")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator("text=/SB-[A-Z0-9]{4}-[A-Z0-9]{4}/").first(),
    ).toBeVisible();

    const event = await readApplySubmitEvent(page);
    expect(event).not.toBeNull();
    expect(event?.[2]).toMatchObject({
      apply_path: "bookkeeping",
      value: 15120,
      currency: "TWD",
    });
  });

  test("registration submission fires apply_submit with value=21620", async ({
    page,
  }) => {
    await page.goto("/apply");

    await page.locator("button", { hasText: "還沒有統編" }).click();
    // Registration path has no required company fields — only contact.
    await fillContactFields(page);

    await waitForSubmitReady(page);
    await page.locator("button", { hasText: "送出申請" }).click();

    await expect(page.locator("text=申請已送出")).toBeVisible({
      timeout: 15_000,
    });

    const event = await readApplySubmitEvent(page);
    expect(event).not.toBeNull();
    expect(event?.[2]).toMatchObject({
      apply_path: "registration",
      value: 21620,
      currency: "TWD",
    });
  });
});
