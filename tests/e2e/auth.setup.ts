import { test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";

// Load env vars from .env.local
const projectRoot = path.resolve(__dirname, "../..");
loadEnvConfig(projectRoot, true);

const TEST_PASSWORD = "TestPassword123!";

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getServiceClient() {
  return createClient(
    getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL"),
    getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export interface E2EFixture {
  userId: string;
  userEmail: string;
  firmId: string;
  clientId: string;
  periodId: string;
  yearMonth: string;
  invoiceIds: string[];
}

setup("create test data and authenticate", async ({ page }) => {
  const supabase = getServiceClient();
  const testId = randomUUID().slice(0, 8);
  const email = `e2e-${testId}@example.com`;
  const yearMonth = "11409"; // Sep 2025 in ROC calendar

  // 1. Create test user
  const { data: userData, error: userError } =
    await supabase.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "E2E Test User", role: "admin" },
    });
  if (userError || !userData.user) throw userError ?? new Error("No user");
  const userId = userData.user.id;

  // 2. Create firm
  const { data: firm, error: firmError } = await supabase
    .from("firms")
    .insert({
      name: `E2E Firm ${testId}`,
      tax_id: Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, "0"),
    })
    .select("id")
    .single();
  if (firmError || !firm) throw firmError ?? new Error("No firm");

  // 3. Link profile to firm
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ firm_id: firm.id, name: "E2E Test User", role: "admin" })
    .eq("id", userId);
  if (profileError) throw profileError;

  // 4. Create client
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      firm_id: firm.id,
      name: `E2E Client ${testId}`,
      tax_id: Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, "0"),
      tax_payer_id: Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, "0"),
    })
    .select("id")
    .single();
  if (clientError || !client) throw clientError ?? new Error("No client");

  // 5. Create tax filing period
  const { data: period, error: periodError } = await supabase
    .from("tax_filing_periods")
    .insert({
      firm_id: firm.id,
      client_id: client.id,
      year_month: yearMonth,
      status: "open",
    })
    .select("id")
    .single();
  if (periodError || !period) throw periodError ?? new Error("No period");

  // 6. Create test invoices with different configurations
  const invoices = [
    {
      // Invoice 1: Non-deductible account (6128 職工福利), processed
      firm_id: firm.id,
      client_id: client.id,
      tax_filing_period_id: period.id,
      filename: "e2e-nondeductible.pdf",
      storage_path: `e2e/${testId}/nondeductible.pdf`,
      in_or_out: "in" as const,
      uploaded_by: userId,
      status: "processed",
      year_month: yearMonth,
      invoice_serial_code: "AA00000001",
      extracted_data: {
        invoiceSerialCode: "AA00000001",
        date: "2025/09/15",
        totalSales: 1000,
        tax: 50,
        totalAmount: 1050,
        sellerName: "測試賣方A",
        sellerTaxId: "11111111",
        buyerName: "測試買方",
        buyerTaxId: "22222222",
        summary: "員工福利品",
        deductible: false,
        account: "6128 職工福利",
        taxType: "應稅",
        invoiceType: "手開三聯式",
        inOrOut: "進項",
      },
    },
    {
      // Invoice 2: Deductible account with deductible=false from DB, processed
      firm_id: firm.id,
      client_id: client.id,
      tax_filing_period_id: period.id,
      filename: "e2e-deductible-false.pdf",
      storage_path: `e2e/${testId}/deductible-false.pdf`,
      in_or_out: "in" as const,
      uploaded_by: userId,
      status: "processed",
      year_month: yearMonth,
      invoice_serial_code: "BB00000002",
      extracted_data: {
        invoiceSerialCode: "BB00000002",
        date: "2025/09/16",
        totalSales: 2000,
        tax: 100,
        totalAmount: 2100,
        sellerName: "測試賣方B",
        sellerTaxId: "33333333",
        buyerName: "測試買方",
        buyerTaxId: "44444444",
        summary: "文具用品",
        deductible: false,
        account: "6112 文具用品",
        taxType: "應稅",
        invoiceType: "手開三聯式",
        inOrOut: "進項",
      },
    },
    {
      // Invoice 3: Deductible account with deductible=true, processed
      firm_id: firm.id,
      client_id: client.id,
      tax_filing_period_id: period.id,
      filename: "e2e-deductible-true.pdf",
      storage_path: `e2e/${testId}/deductible-true.pdf`,
      in_or_out: "in" as const,
      uploaded_by: userId,
      status: "processed",
      year_month: yearMonth,
      invoice_serial_code: "CC00000003",
      extracted_data: {
        invoiceSerialCode: "CC00000003",
        date: "2025/09/17",
        totalSales: 3000,
        tax: 150,
        totalAmount: 3150,
        sellerName: "測試賣方C",
        sellerTaxId: "55555555",
        buyerName: "測試買方",
        buyerTaxId: "66666666",
        summary: "辦公文具",
        deductible: true,
        account: "6112 文具用品",
        taxType: "應稅",
        invoiceType: "手開三聯式",
        inOrOut: "進項",
      },
    },
    {
      // Invoice 4: Confirmed invoice (for testing confirm button disable)
      firm_id: firm.id,
      client_id: client.id,
      tax_filing_period_id: period.id,
      filename: "e2e-confirmed.pdf",
      storage_path: `e2e/${testId}/confirmed.pdf`,
      in_or_out: "in" as const,
      uploaded_by: userId,
      status: "confirmed",
      year_month: yearMonth,
      invoice_serial_code: "DD00000004",
      extracted_data: {
        invoiceSerialCode: "DD00000004",
        date: "2025/09/18",
        totalSales: 4000,
        tax: 200,
        totalAmount: 4200,
        sellerName: "測試賣方D",
        sellerTaxId: "77777777",
        buyerName: "測試買方",
        buyerTaxId: "88888888",
        summary: "設備維修",
        deductible: true,
        account: "6115 郵電費",
        taxType: "應稅",
        invoiceType: "手開三聯式",
        inOrOut: "進項",
      },
    },
    {
      // Invoice 5: Consumer invoice (empty buyerTaxId), processed
      firm_id: firm.id,
      client_id: client.id,
      tax_filing_period_id: period.id,
      filename: "e2e-consumer.pdf",
      storage_path: `e2e/${testId}/consumer.pdf`,
      in_or_out: "out" as const,
      uploaded_by: userId,
      status: "processed",
      year_month: yearMonth,
      invoice_serial_code: "EE00000005",
      extracted_data: {
        invoiceSerialCode: "EE00000005",
        date: "2025/09/19",
        totalSales: 500,
        tax: 25,
        totalAmount: 525,
        sellerName: "我方公司",
        sellerTaxId: "99999999",
        buyerName: "",
        buyerTaxId: "",
        summary: "零售商品",
        deductible: false,
        account: "4101 營業收入",
        taxType: "應稅",
        invoiceType: "手開二聯式",
        inOrOut: "銷項",
      },
    },
    {
      // Invoice 6: Non-consumer with non-empty buyerName but empty buyerTaxId (regression test)
      firm_id: firm.id,
      client_id: client.id,
      tax_filing_period_id: period.id,
      filename: "e2e-no-taxid.pdf",
      storage_path: `e2e/${testId}/no-taxid.pdf`,
      in_or_out: "out" as const,
      uploaded_by: userId,
      status: "processed",
      year_month: yearMonth,
      invoice_serial_code: "FF00000006",
      extracted_data: {
        invoiceSerialCode: "FF00000006",
        date: "2025/09/20",
        totalSales: 600,
        tax: 30,
        totalAmount: 630,
        sellerName: "我方公司",
        sellerTaxId: "99999999",
        buyerName: "某公司",
        buyerTaxId: "",
        summary: "服務費",
        deductible: false,
        account: "4101 營業收入",
        taxType: "應稅",
        invoiceType: "手開二聯式",
        inOrOut: "銷項",
      },
    },
  ];

  const { data: insertedInvoices, error: invoiceError } = await supabase
    .from("invoices")
    .insert(invoices)
    .select("id, invoice_serial_code");
  if (invoiceError) throw invoiceError;

  const invoiceIds = insertedInvoices?.map((i) => i.id) ?? [];

  // Save fixture data for tests and teardown
  const fixture: E2EFixture = {
    userId,
    userEmail: email,
    firmId: firm.id,
    clientId: client.id,
    periodId: period.id,
    yearMonth,
    invoiceIds,
  };

  const authDir = path.join(__dirname, ".auth");
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(
    path.join(authDir, "fixture.json"),
    JSON.stringify(fixture, null, 2),
  );

  // 7. Log in via the UI
  await page.goto("/auth/login");
  await page.fill('input#email', email);
  await page.fill('input#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard (successful login)
  await page.waitForURL("**/dashboard**", { timeout: 15000 });

  // Save authenticated state
  await page.context().storageState({ path: path.join(authDir, "user.json") });
});
