import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createInvoice } from "@/lib/services/invoice";
import {
  confirmInvoiceEntry,
  getPeriodEntryStatus,
} from "@/lib/services/journal-entry";
import { shouldCreateEntry } from "@/lib/services/journal-entry-generation";
import type { ExtractedInvoiceData, Invoice } from "@/lib/domain/models";
import type { Json } from "@/supabase/database.types";
import {
  cleanupTestFixture,
  createTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";

const hasDbEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.DATABASE_URL,
);

// Freshness summary that drives the period-page button. getPeriodEntryStatus is
// a set-based SQL aggregate; these tests pin its missing/stale counts and assert
// the SQL `produces_entry` filter matches the TS `shouldCreateEntry` predicate.
describe.skipIf(!hasDbEnv)("getPeriodEntryStatus — period draft-entry freshness", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixture: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (fixture) await cleanupTestFixture(supabase, fixture);
  });

  // Each test gets its own period (unique year_month) so missing/stale counts
  // don't bleed across tests. The fixture's client is fresh, so the
  // (client_id, year_month) unique constraint only needs per-test distinctness.
  let ymCounter = 0;
  async function createPeriod(): Promise<string> {
    const year_month = String(11501 + ymCounter++);
    const { data, error } = await supabase
      .from("tax_filing_periods")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        year_month,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function seedConfirmedInvoice(
    periodId: string,
    in_or_out: "in" | "out",
    extracted_data: ExtractedInvoiceData,
  ): Promise<{ id: string; document_id: string }> {
    const invoice = await createInvoice(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: `${fixture.firmId}/11505/${fixture.clientId}/${crypto.randomUUID()}.pdf`,
        filename: "inv.pdf",
        in_or_out,
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );
    const { error } = await supabase
      .from("invoices")
      .update({
        status: "confirmed",
        tax_filing_period_id: periodId,
        extracted_data: extracted_data as unknown as Json,
      })
      .eq("id", invoice.id);
    if (error) throw error;
    return { id: invoice.id, document_id: invoice.document_id! };
  }

  const opts = () => ({ supabaseClient: supabase, userId: fixture.userId });

  it("counts confirmed entry-producing invoices with no entry as missing", async () => {
    const periodId = await createPeriod();
    await seedConfirmedInvoice(periodId, "in", {
      totalSales: 10_000,
      tax: 500,
      totalAmount: 10_500,
      deductible: true,
      account: "6113 旅費",
    });
    await seedConfirmedInvoice(periodId, "out", {
      totalSales: 20_000,
      tax: 1_000,
      totalAmount: 21_000,
    });

    const status = await getPeriodEntryStatus(periodId, opts());
    expect(status.missing).toBe(2);
    expect(status.stale).toBe(0);
    expect(status.lastGenerated).toBeNull();
  });

  it("produces_entry matches shouldCreateEntry across taxType × in/out", async () => {
    const periodId = await createPeriod();
    const combos: { in_or_out: "in" | "out"; taxType: ExtractedInvoiceData["taxType"] }[] = [
      { in_or_out: "in", taxType: "應稅" },
      { in_or_out: "in", taxType: "零稅率" },
      { in_or_out: "in", taxType: "免稅" },
      { in_or_out: "in", taxType: "作廢" },
      { in_or_out: "in", taxType: "彙加" },
      { in_or_out: "out", taxType: "應稅" },
      { in_or_out: "out", taxType: "零稅率" },
      { in_or_out: "out", taxType: "免稅" },
      { in_or_out: "out", taxType: "作廢" },
      { in_or_out: "out", taxType: "彙加" },
    ];

    for (const c of combos) {
      await seedConfirmedInvoice(periodId, c.in_or_out, {
        totalSales: 1_000,
        tax: 50,
        totalAmount: 1_050,
        taxType: c.taxType,
      });
    }

    // The TS predicate is the source of truth; the SQL filter must agree.
    const expectedProducing = combos.filter((c) =>
      shouldCreateEntry({
        in_or_out: c.in_or_out,
        extracted_data: { taxType: c.taxType },
      } as unknown as Invoice),
    ).length;

    const status = await getPeriodEntryStatus(periodId, opts());
    expect(status.missing).toBe(expectedProducing);
  });

  it("generating an entry clears missing; editing the doc makes it stale", async () => {
    const periodId = await createPeriod();
    const inv = await seedConfirmedInvoice(periodId, "in", {
      date: "2026/01/15",
      totalSales: 10_000,
      tax: 500,
      totalAmount: 10_500,
      deductible: true,
      account: "6113 旅費",
    });

    expect((await getPeriodEntryStatus(periodId, opts())).missing).toBe(1);

    // Generate the entry via the per-document path (the batch reuses this).
    await confirmInvoiceEntry(inv.id, opts());

    const afterGen = await getPeriodEntryStatus(periodId, opts());
    expect(afterGen.missing).toBe(0);
    expect(afterGen.stale).toBe(0);
    expect(afterGen.lastGenerated).not.toBeNull();

    // Edit extracted_data → the sync_documents_cache trigger bumps
    // documents.updated_at past the entry's updated_at → stale.
    const { error } = await supabase
      .from("invoices")
      .update({
        extracted_data: {
          date: "2026/01/15",
          totalSales: 8_000,
          tax: 400,
          totalAmount: 8_400,
          deductible: true,
          account: "6120 交際費",
        } as unknown as Json,
      })
      .eq("id", inv.id);
    if (error) throw error;

    const afterEdit = await getPeriodEntryStatus(periodId, opts());
    expect(afterEdit.missing).toBe(0);
    expect(afterEdit.stale).toBe(1);
  });

  it("generationStatus is idle on a fresh period", async () => {
    const periodId = await createPeriod();
    const status = await getPeriodEntryStatus(periodId, opts());
    expect(status.generationStatus).toBe("idle");
  });
});
