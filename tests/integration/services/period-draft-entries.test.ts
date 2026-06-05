import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createInvoice } from "@/lib/services/invoice";
import { createAllowance } from "@/lib/services/allowance";
import {
  confirmInvoiceEntry,
  generatePeriodDraftEntries,
  getPeriodEntryStatus,
} from "@/lib/services/journal-entry";
import {
  ACCT_BANK,
  ACCT_CASH,
  ACCT_INPUT_TAX,
  ACCT_OTHER_INCOME,
  ACCT_OUTPUT_TAX,
  ACCT_REVENUE,
  shouldCreateEntry,
} from "@/lib/services/journal-entry-generation";
import type {
  ExtractedAllowanceData,
  ExtractedInvoiceData,
  Invoice,
} from "@/lib/domain/models";
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
describe.skipIf(!hasDbEnv)("Period draft entries — freshness + batch generation", () => {
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

  async function seedConfirmedAllowance(
    periodId: string,
    in_or_out: "in" | "out",
    extracted_data: ExtractedAllowanceData,
    original_invoice_id: string | null,
  ): Promise<{ id: string; document_id: string }> {
    const allowance = await createAllowance(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: `${fixture.firmId}/11505/${fixture.clientId}/${crypto.randomUUID()}.pdf`,
        filename: "all.pdf",
        in_or_out,
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );
    const { error } = await supabase
      .from("allowances")
      .update({
        status: "confirmed",
        tax_filing_period_id: periodId,
        extracted_data: extracted_data as unknown as Json,
        original_invoice_id,
      })
      .eq("id", allowance.id);
    if (error) throw error;
    return { id: allowance.id, document_id: allowance.document_id! };
  }

  // The voucher_generation_status column isn't in the generated Supabase types
  // yet (regenerated after the migration is applied), so write it via a cast.
  async function setGenerationFlag(
    periodId: string,
    status: "idle" | "running",
    startedAt: string,
  ): Promise<void> {
    const { error } = await (
      supabase.from("tax_filing_periods") as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => Promise<{ error: unknown }>;
        };
      }
    )
      .update({
        voucher_generation_status: status,
        voucher_generation_started_at: startedAt,
      })
      .eq("id", periodId);
    if (error) throw error;
  }

  async function getEntryWithLines(documentId: string) {
    const { data: entry } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("document_id", documentId)
      .maybeSingle();
    if (!entry) return null;
    const { data: lines } = await supabase
      .from("journal_entry_lines")
      .select("*")
      .eq("journal_entry_id", entry.id)
      .order("line_number", { ascending: true });
    return { entry, lines: lines ?? [] };
  }

  const simplify = (
    lines: { account_code: string; debit: number; credit: number }[],
  ) => lines.map((l) => ({ account_code: l.account_code, debit: l.debit, credit: l.credit }));

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

  // ---------- generatePeriodDraftEntries (batch) ----------

  it("generates draft entries for confirmed invoices (in + out)", async () => {
    const periodId = await createPeriod();
    const inInv = await seedConfirmedInvoice(periodId, "in", {
      date: "2026/01/15",
      totalSales: 10_000,
      tax: 500,
      totalAmount: 10_500,
      deductible: true,
      account: "6113 旅費",
    });
    const outInv = await seedConfirmedInvoice(periodId, "out", {
      totalSales: 20_000,
      tax: 1_000,
      totalAmount: 21_000,
    });

    const res = await generatePeriodDraftEntries(periodId, opts());
    expect(res.generated).toBe(2);
    expect(res.regenerated).toBe(0);
    expect(res.failures).toEqual([]);

    expect(simplify((await getEntryWithLines(inInv.document_id))!.lines)).toEqual([
      { account_code: "6113", debit: 10_000, credit: 0 },
      { account_code: ACCT_INPUT_TAX, debit: 500, credit: 0 },
      { account_code: ACCT_BANK, debit: 0, credit: 10_500 },
    ]);
    const out = await getEntryWithLines(outInv.document_id);
    expect(out!.entry.voucher_type).toBe("收入");
    expect(simplify(out!.lines)).toEqual([
      { account_code: ACCT_BANK, debit: 21_000, credit: 0 },
      { account_code: ACCT_REVENUE, debit: 0, credit: 20_000 },
      { account_code: ACCT_OUTPUT_TAX, debit: 0, credit: 1_000 },
    ]);

    const status = await getPeriodEntryStatus(periodId, opts());
    expect(status.missing).toBe(0);
    expect(status.generationStatus).toBe("idle"); // mutex released after the run
  });

  it("mirrors the original invoice entry (invoices processed first)", async () => {
    const periodId = await createPeriod();
    const original = await seedConfirmedInvoice(periodId, "out", {
      totalSales: 20_000,
      tax: 1_000,
      totalAmount: 21_000,
    });
    const allowance = await seedConfirmedAllowance(
      periodId,
      "out",
      { amount: 2_000, taxAmount: 100 },
      original.id,
    );

    const res = await generatePeriodDraftEntries(periodId, opts());
    expect(res.generated).toBe(2);
    expect(res.failures).toEqual([]);

    const got = await getEntryWithLines(allowance.document_id);
    expect(got!.entry.voucher_type).toBe("支出");
    expect(simplify(got!.lines)).toEqual([
      { account_code: ACCT_REVENUE, debit: 2_000, credit: 0 },
      { account_code: ACCT_OUTPUT_TAX, debit: 100, credit: 0 },
      { account_code: ACCT_BANK, debit: 0, credit: 2_100 },
    ]);
  });

  it("applies the default rule when an allowance has no original", async () => {
    const periodId = await createPeriod();
    const allowance = await seedConfirmedAllowance(
      periodId,
      "in",
      { amount: 1_000, taxAmount: 50 },
      null,
    );

    const res = await generatePeriodDraftEntries(periodId, opts());
    expect(res.generated).toBe(1);

    const got = await getEntryWithLines(allowance.document_id);
    expect(got!.entry.voucher_type).toBe("收入");
    expect(simplify(got!.lines)).toEqual([
      { account_code: ACCT_CASH, debit: 1_050, credit: 0 },
      { account_code: ACCT_OTHER_INCOME, debit: 0, credit: 1_000 },
      { account_code: ACCT_INPUT_TAX, debit: 0, credit: 50 },
    ]);
  });

  it("records a non-fatal failure when an allowance's original has no entry", async () => {
    const periodId = await createPeriod();
    // Original input invoice exists but is left 'uploaded' → never gets an entry.
    const orig = await createInvoice(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: `${fixture.firmId}/11505/${fixture.clientId}/${crypto.randomUUID()}.pdf`,
        filename: "inv.pdf",
        in_or_out: "in",
      },
      opts(),
    );
    const allowance = await seedConfirmedAllowance(
      periodId,
      "in",
      { amount: 100, taxAmount: 5 },
      orig.id,
    );
    // A healthy invoice in the same period must still generate.
    const healthy = await seedConfirmedInvoice(periodId, "in", {
      totalSales: 1_000,
      tax: 50,
      totalAmount: 1_050,
      deductible: true,
      account: "6113 旅費",
    });

    const res = await generatePeriodDraftEntries(periodId, opts());
    expect(res.failures.length).toBe(1);
    expect(res.failures[0]).toMatchObject({
      kind: "allowance",
      documentId: allowance.document_id,
    });
    expect(await getEntryWithLines(allowance.document_id)).toBeNull();
    expect(await getEntryWithLines(healthy.document_id)).not.toBeNull();
  });

  it("is idempotent: re-running keeps entry ids and reports no work", async () => {
    const periodId = await createPeriod();
    const inv = await seedConfirmedInvoice(periodId, "in", {
      totalSales: 10_000,
      tax: 500,
      totalAmount: 10_500,
      deductible: true,
      account: "6113 旅費",
    });

    const first = await generatePeriodDraftEntries(periodId, opts());
    expect(first.generated).toBe(1);
    const firstEntryId = (await getEntryWithLines(inv.document_id))!.entry.id;

    const second = await generatePeriodDraftEntries(periodId, opts());
    expect(second.generated).toBe(0);
    expect(second.regenerated).toBe(0);
    expect((await getEntryWithLines(inv.document_id))!.entry.id).toBe(firstEntryId);
  });

  it("regenerates a stale entry after the doc is edited, keeping entry.id", async () => {
    const periodId = await createPeriod();
    const inv = await seedConfirmedInvoice(periodId, "in", {
      totalSales: 10_000,
      tax: 500,
      totalAmount: 10_500,
      deductible: true,
      account: "6113 旅費",
    });
    await generatePeriodDraftEntries(periodId, opts());
    const entryId = (await getEntryWithLines(inv.document_id))!.entry.id;

    // Edit → sync_documents_cache trigger bumps documents.updated_at → stale.
    const { error } = await supabase
      .from("invoices")
      .update({
        extracted_data: {
          totalSales: 8_000,
          tax: 400,
          totalAmount: 8_400,
          deductible: true,
          account: "6120 交際費",
        } as unknown as Json,
      })
      .eq("id", inv.id);
    if (error) throw error;

    const res = await generatePeriodDraftEntries(periodId, opts());
    expect(res.generated).toBe(0);
    expect(res.regenerated).toBe(1);

    const got = await getEntryWithLines(inv.document_id);
    expect(got!.entry.id).toBe(entryId);
    expect(simplify(got!.lines)).toEqual([
      { account_code: "6120", debit: 8_000, credit: 0 },
      { account_code: ACCT_INPUT_TAX, debit: 400, credit: 0 },
      { account_code: ACCT_CASH, debit: 0, credit: 8_400 }, // 8,400 ≤ 10,000 → 1111
    ]);
  });

  it("rejects a concurrent run while one holds the period (mutex)", async () => {
    const periodId = await createPeriod();
    await setGenerationFlag(periodId, "running", new Date().toISOString());
    await expect(generatePeriodDraftEntries(periodId, opts())).rejects.toThrow(/進行中/);
  });

  it("reclaims a stale 'running' flag from a crashed run and completes", async () => {
    const periodId = await createPeriod();
    const inv = await seedConfirmedInvoice(periodId, "in", {
      totalSales: 1_000,
      tax: 50,
      totalAmount: 1_050,
      deductible: true,
      account: "6113 旅費",
    });
    // 20 minutes ago → past the 15-minute stale-run guard.
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await setGenerationFlag(periodId, "running", stale);

    const res = await generatePeriodDraftEntries(periodId, opts());
    expect(res.generated).toBe(1);
    expect(await getEntryWithLines(inv.document_id)).not.toBeNull();
    expect((await getPeriodEntryStatus(periodId, opts())).generationStatus).toBe("idle");
  });
});
