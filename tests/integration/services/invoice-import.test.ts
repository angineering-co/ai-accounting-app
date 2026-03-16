import path from "path";
import { readFileSync } from "fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { processElectronicInvoiceFile } from "@/lib/services/invoice-import";
import {
  cleanupTestFixture,
  createTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";
interface ReferenceInvoice {
  id: string;
  in_or_out: string;
  invoice_serial_code: string;
  year_month: string;
  extracted_data: {
    source?: string;
    totalSales: number;
    tax: number;
    totalAmount: number;
    invoiceSerialCode: string;
    taxType: string;
    sellerTaxId?: string;
    buyerTaxId?: string;
    [key: string]: unknown;
  };
}

describe("processElectronicInvoiceFile", () => {
  const supabase = getServiceClient();
  let fixture: TestFixture;

  beforeAll(async () => {
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupTestFixture(supabase, fixture);
    }
  });

  it("upserts invoices based on client_id + invoice_serial_code", async () => {
    const filePath = path.resolve(__dirname, "../../fixtures/files", "60707504.xlsx");
    const fileBuffer = readFileSync(filePath);
    const storagePath = `${fixture.firmId}/${fixture.clientId}/60707504.xlsx`;

    const { error: uploadError } = await supabase.storage
      .from("electronic-invoices")
      .upload(storagePath, fileBuffer, {
        contentType: "text/plain",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    fixture.storagePaths.push(storagePath);

    // Create a tax period for testing
    const testPeriod = "11411"; // 2025-11/12 match the excel file data

    await supabase.from("tax_filing_periods").insert({
      firm_id: fixture.firmId,
      client_id: fixture.clientId,
      year_month: testPeriod,
      status: "open"
    });

    const result1 = await processElectronicInvoiceFile(
      fixture.clientId,
      fixture.firmId,
      storagePath,
      "60707504.xlsx",
      testPeriod,
      {
        supabaseClient: supabase,
        userId: fixture.userId,
      }
    );

    expect(result1.failed).toBe(0);
    expect(result1.inserted).toBeGreaterThan(0);
    expect(result1.updated).toBe(0);

    const { data: rowsAfterFirst, error: countErrorFirst } = await supabase
      .from("invoices")
      .select("id, invoice_serial_code")
      .eq("client_id", fixture.clientId);

    if (countErrorFirst || !rowsAfterFirst) {
      throw countErrorFirst ?? new Error("Failed to fetch invoices after import");
    }

    const firstCount = rowsAfterFirst.length;
    expect(firstCount).toBeGreaterThan(0);
    expect(
      new Set(rowsAfterFirst.map((row) => row.invoice_serial_code)).size
    ).toBe(firstCount);

    const result2 = await processElectronicInvoiceFile(
      fixture.clientId,
      fixture.firmId,
      storagePath,
      "60707504.xlsx",
      testPeriod,
      {
        supabaseClient: supabase,
        userId: fixture.userId,
      }
    );

    expect(result2.failed).toBe(0);
    expect(result2.inserted).toBe(0);
    expect(result2.updated).toBe(firstCount);

    const { data: rowsAfterSecond, error: countErrorSecond } = await supabase
      .from("invoices")
      .select("id, invoice_serial_code")
      .eq("client_id", fixture.clientId);

    if (countErrorSecond || !rowsAfterSecond) {
      throw (
        countErrorSecond ?? new Error("Failed to fetch invoices after re-import")
      );
    }

    expect(rowsAfterSecond.length).toBe(firstCount);
    expect(
      new Set(rowsAfterSecond.map((row) => row.invoice_serial_code)).size
    ).toBe(firstCount);
  });
});

describe("processElectronicInvoiceFile – 91044604", () => {
  const supabase = getServiceClient();
  let fixture: TestFixture;
  const testPeriod = "11501";

  const outFilename = "91044604_OUT_20260304155256.xlsx";
  const inFilename = "91044604_IN_20260304155303.xlsx";

  // Load reference data (only electronic/import-excel invoices)
  const referenceInvoices: ReferenceInvoice[] = JSON.parse(
    readFileSync(
      path.resolve(__dirname, "../../fixtures/reports/91044604/data/invoices.json"),
      "utf-8"
    )
  ).filter((inv: ReferenceInvoice) => inv.extracted_data.source === "import-excel");

  const referenceOut = referenceInvoices.filter((inv) => inv.in_or_out === "out");
  const referenceIn = referenceInvoices.filter((inv) => inv.in_or_out === "in");

  beforeAll(async () => {
    fixture = await createTestFixture(supabase);

    // Upload both Excel files
    for (const filename of [outFilename, inFilename]) {
      const filePath = path.resolve(__dirname, "../../fixtures/files/91044604", filename);
      const fileBuffer = readFileSync(filePath);
      const storagePath = `${fixture.firmId}/${fixture.clientId}/${filename}`;

      const { error } = await supabase.storage
        .from("electronic-invoices")
        .upload(storagePath, fileBuffer, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });

      if (error) throw error;
      fixture.storagePaths.push(storagePath);
    }

    // Create tax filing period
    await supabase.from("tax_filing_periods").insert({
      firm_id: fixture.firmId,
      client_id: fixture.clientId,
      year_month: testPeriod,
      status: "open",
    });
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupTestFixture(supabase, fixture);
    }
  });

  it("imports OUT and IN electronic invoices matching reference data", async () => {
    const outStoragePath = `${fixture.firmId}/${fixture.clientId}/${outFilename}`;
    const inStoragePath = `${fixture.firmId}/${fixture.clientId}/${inFilename}`;

    // Process OUT file
    const outResult = await processElectronicInvoiceFile(
      fixture.clientId,
      fixture.firmId,
      outStoragePath,
      outFilename,
      testPeriod,
      { supabaseClient: supabase, userId: fixture.userId }
    );

    expect(outResult.failed).toBe(0);
    expect(outResult.inserted).toBe(referenceOut.length);

    // Process IN file
    const inResult = await processElectronicInvoiceFile(
      fixture.clientId,
      fixture.firmId,
      inStoragePath,
      inFilename,
      testPeriod,
      { supabaseClient: supabase, userId: fixture.userId }
    );

    expect(inResult.failed).toBe(0);
    expect(inResult.inserted).toBe(referenceIn.length);

    // Fetch all imported invoices
    const { data: invoices, error } = await supabase
      .from("invoices")
      .select("invoice_serial_code, in_or_out, year_month, extracted_data")
      .eq("client_id", fixture.clientId);

    if (error || !invoices) {
      throw error ?? new Error("Failed to fetch invoices");
    }

    expect(invoices.length).toBe(referenceInvoices.length);

    // Verify each reference invoice against imported data
    for (const ref of referenceInvoices) {
      const imported = invoices.find(
        (inv) => inv.invoice_serial_code === ref.invoice_serial_code
      );
      expect(imported, `Missing invoice ${ref.invoice_serial_code}`).toBeDefined();

      const data = imported!.extracted_data as Record<string, unknown>;
      const code = ref.invoice_serial_code;

      expect(imported!.in_or_out, `${code} in_or_out`).toBe(ref.in_or_out);
      expect(imported!.year_month, `${code} year_month`).toBe(ref.year_month);
      expect(data.invoiceSerialCode, `${code} invoiceSerialCode`).toBe(ref.extracted_data.invoiceSerialCode);
      expect(data.totalSales, `${code} totalSales`).toBe(ref.extracted_data.totalSales);
      expect(data.tax, `${code} tax`).toBe(ref.extracted_data.tax);
      expect(data.totalAmount, `${code} totalAmount`).toBe(ref.extracted_data.totalAmount);
      expect(data.taxType, `${code} taxType`).toBe(ref.extracted_data.taxType);
      expect(data.sellerTaxId, `${code} sellerTaxId`).toBe(ref.extracted_data.sellerTaxId);

      if (ref.extracted_data.buyerTaxId) {
        expect(data.buyerTaxId, `${code} buyerTaxId`).toBe(ref.extracted_data.buyerTaxId);
      }
    }
  });

  it("re-import is idempotent (upsert)", async () => {
    const outStoragePath = `${fixture.firmId}/${fixture.clientId}/${outFilename}`;
    const inStoragePath = `${fixture.firmId}/${fixture.clientId}/${inFilename}`;

    // Re-process both files
    const outResult = await processElectronicInvoiceFile(
      fixture.clientId,
      fixture.firmId,
      outStoragePath,
      outFilename,
      testPeriod,
      { supabaseClient: supabase, userId: fixture.userId }
    );

    expect(outResult.failed).toBe(0);
    expect(outResult.inserted).toBe(0);
    expect(outResult.updated).toBe(referenceOut.length);

    const inResult = await processElectronicInvoiceFile(
      fixture.clientId,
      fixture.firmId,
      inStoragePath,
      inFilename,
      testPeriod,
      { supabaseClient: supabase, userId: fixture.userId }
    );

    expect(inResult.failed).toBe(0);
    expect(inResult.inserted).toBe(0);
    expect(inResult.updated).toBe(referenceIn.length);

    // Total count unchanged
    const { data: invoices, error } = await supabase
      .from("invoices")
      .select("id")
      .eq("client_id", fixture.clientId);

    if (error || !invoices) {
      throw error ?? new Error("Failed to fetch invoices");
    }

    expect(invoices.length).toBe(referenceInvoices.length);
  });
});
