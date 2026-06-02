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
  clientUserId: string;
  clientUserEmail: string;
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
        sellerTaxId: "12000000",
        buyerName: "測試買方",
        buyerTaxId: "22000004",
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
        sellerTaxId: "32000003",
        buyerName: "測試買方",
        buyerTaxId: "42000002",
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
        buyerTaxId: "62000000",
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
        sellerTaxId: "72000004",
        buyerName: "測試買方",
        buyerTaxId: "82000003",
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
        // 二聯式 convention: tax embedded in totalSales, tax field is 0
        totalSales: 525,
        tax: 0,
        totalAmount: 525,
        sellerName: "我方公司",
        sellerTaxId: "92000002",
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
        // 二聯式 convention: tax embedded in totalSales, tax field is 0
        totalSales: 630,
        tax: 0,
        totalAmount: 630,
        sellerName: "我方公司",
        sellerTaxId: "92000002",
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
    {
      // Invoice 8: B2C with non-二聯式 invoiceType (regression — tax embedded by buyerTaxId, not invoiceType)
      firm_id: firm.id,
      client_id: client.id,
      tax_filing_period_id: period.id,
      filename: "e2e-b2c-electronic.pdf",
      storage_path: `e2e/${testId}/b2c-electronic.pdf`,
      in_or_out: "out" as const,
      uploaded_by: userId,
      status: "processed",
      year_month: yearMonth,
      invoice_serial_code: "HH00000008",
      extracted_data: {
        invoiceSerialCode: "HH00000008",
        date: "2025/09/22",
        // B2C convention: tax embedded in totalSales, tax field is 0 — even when
        // invoiceType is 電子發票 rather than 二聯式. The dialog should rely on
        // !buyerTaxId, not invoiceType, to decide tax-embedded validation.
        totalSales: 1050,
        tax: 0,
        totalAmount: 1050,
        sellerName: "我方公司",
        sellerTaxId: "92000002",
        buyerName: "",
        buyerTaxId: "",
        summary: "電商零售",
        deductible: false,
        account: "4101 營業收入",
        taxType: "應稅",
        invoiceType: "電子發票",
        inOrOut: "銷項",
      },
    },
    {
      // Invoice 9: B2B 二聯式收銀機 (buyer 統編 IS present, but tax still embedded)
      // Cash-register receipts in 二聯 format embed tax in totalSales even when
      // issued for B2B sales — see lib/services/reports.ts otherCertificates branch.
      firm_id: firm.id,
      client_id: client.id,
      tax_filing_period_id: period.id,
      filename: "e2e-b2b-cashregister.pdf",
      storage_path: `e2e/${testId}/b2b-cashregister.pdf`,
      in_or_out: "in" as const,
      uploaded_by: userId,
      status: "processed",
      year_month: yearMonth,
      invoice_serial_code: "II00000009",
      extracted_data: {
        invoiceSerialCode: "II00000009",
        date: "2025/09/23",
        totalSales: 1050,
        tax: 0,
        totalAmount: 1050,
        sellerName: "便利商店",
        sellerTaxId: "12345675",
        buyerName: "客戶公司",
        buyerTaxId: "91044604",
        summary: "辦公用品",
        deductible: true,
        account: "6112 文具用品",
        taxType: "應稅",
        invoiceType: "二聯式收銀機",
        inOrOut: "進項",
      },
    },
    {
      // Invoice 7: Zero-amount invoice (totalSales=0, tax=0)
      firm_id: firm.id,
      client_id: client.id,
      tax_filing_period_id: period.id,
      filename: "e2e-zero-amount.pdf",
      storage_path: `e2e/${testId}/zero-amount.pdf`,
      in_or_out: "in" as const,
      uploaded_by: userId,
      status: "processed",
      year_month: yearMonth,
      invoice_serial_code: "GG00000007",
      extracted_data: {
        invoiceSerialCode: "GG00000007",
        date: "2025/09/21",
        totalSales: 0,
        tax: 0,
        totalAmount: 0,
        sellerName: "測試賣方G",
        sellerTaxId: "12345675",
        buyerName: "測試買方",
        buyerTaxId: "12345670",
        summary: "零元發票",
        deductible: false,
        account: "6112 文具用品",
        taxType: "應稅",
        invoiceType: "手開三聯式",
        inOrOut: "進項",
      },
    },
  ];

  // Phase 6b Work C: every invoice needs a `documents` parent
  // (invoices.document_id is NOT NULL). Mint one document per invoice with
  // matching doc_date, then attach the resulting ids to the invoice rows.
  // Teardown doesn't touch documents explicitly — the firm/client cascade
  // deletes them when the test run wraps up.
  const documentIds = invoices.map(() => crypto.randomUUID());
  const documents = invoices.map((inv, i) => ({
    id: documentIds[i],
    firm_id: firm.id,
    client_id: client.id,
    doc_date: inv.extracted_data.date.replace(/\//g, "-"),
    type: "VAT" as const,
    doc_type: "invoice" as const,
    status: "active" as const,
    created_by: userId,
  }));
  const { error: docError } = await supabase.from("documents").insert(documents);
  if (docError) throw docError;

  const invoicesWithDocs = invoices.map((inv, i) => ({
    ...inv,
    document_id: documentIds[i],
  }));

  const { data: insertedInvoices, error: invoiceError } = await supabase
    .from("invoices")
    .insert(invoicesWithDocs)
    .select("id, invoice_serial_code");
  if (invoiceError) throw invoiceError;

  const invoiceIds = insertedInvoices?.map((i) => i.id) ?? [];

  // 7. Create client portal user
  const clientEmail = `e2e-client-${testId}@example.com`;
  const { data: clientUserData, error: clientUserError } =
    await supabase.auth.admin.createUser({
      email: clientEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "E2E Client User", role: "client", firm_id: firm.id, client_id: client.id },
    });
  if (clientUserError || !clientUserData.user)
    throw clientUserError ?? new Error("No client user");
  const clientUserId = clientUserData.user.id;

  // Link client user profile
  const { error: clientProfileError } = await supabase
    .from("profiles")
    .update({ firm_id: firm.id, client_id: client.id, name: "E2E Client User", role: "client" })
    .eq("id", clientUserId);
  if (clientProfileError) throw clientProfileError;

  // Save fixture data for tests and teardown
  const fixture: E2EFixture = {
    userId,
    userEmail: email,
    clientUserId,
    clientUserEmail: clientEmail,
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

  // 8. Log in as admin via the UI
  await page.goto("/auth/login");
  await page.fill('input#email', email);
  await page.fill('input#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
  await page.context().storageState({ path: path.join(authDir, "admin-user.json") });

  // 9. Log in as client portal user
  await page.goto("/auth/login");
  await page.fill('input#email', clientEmail);
  await page.fill('input#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/firm/**", { timeout: 15000 });
  await page.context().storageState({ path: path.join(authDir, "client-user.json") });
});
