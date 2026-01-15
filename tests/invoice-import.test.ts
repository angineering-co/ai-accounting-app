import path from "path";
import { readFileSync } from "fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { processElectronicInvoiceFile } from "@/lib/services/invoice-import";
import {
  cleanupTestFixture,
  createTestFixture,
  getServiceClient,
  type TestFixture,
} from "./fixtures/supabase";

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
    const filePath = path.resolve(__dirname, "data", "60707504.xlsx");
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

    const result1 = await processElectronicInvoiceFile(
      fixture.clientId,
      fixture.firmId,
      storagePath,
      "60707504.xlsx",
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
