import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateDraftEntriesByPeriod,
  upsertVatCloseEntry,
  deleteVatCloseEntry,
  postJournalEntries,
} from "@/lib/services/journal-entry";
import {
  ACCT_INPUT_TAX,
  ACCT_OUTPUT_TAX,
  ACCT_TAX_CREDIT,
  ACCT_TAX_PAYABLE,
} from "@/lib/services/journal-entry-generation";
import type { TaxFilingSummary } from "@/lib/domain/models";
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

// The period-close (營業稅結算) system entry: one draft per (client, year_month), keyed on
// system_entry_kind/key (no source document). markPeriodAsFiled / unfilePeriod use the
// cookie client and aren't reachable here, so we drive the same logic through the
// injectable-client helpers they call: generateDraftEntriesByPeriod, upsertVatCloseEntry,
// deleteVatCloseEntry.
describe.skipIf(!hasDbEnv)("VAT close entry — 營業稅結算", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixture: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (fixture) await cleanupTestFixture(supabase, fixture);
  });

  let ymCounter = 0;
  async function createPeriod(): Promise<{ id: string; yearMonth: string }> {
    const yearMonth = String(11601 + ymCounter++);
    const { data, error } = await supabase
      .from("tax_filing_periods")
      .insert({ firm_id: fixture.firmId, client_id: fixture.clientId, year_month: yearMonth })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id, yearMonth };
  }

  async function setSummary(
    periodId: string,
    s: Partial<TaxFilingSummary>,
  ): Promise<void> {
    const summary: TaxFilingSummary = {
      total_sales: 0,
      total_purchases: 0,
      tax_payable: 0,
      credit_carryover: 0,
      ...s,
    };
    const { error } = await supabase
      .from("tax_filing_periods")
      .update({
        filing: { snapshots: {}, attachments: [], summary } as unknown as Json,
      })
      .eq("id", periodId);
    if (error) throw error;
  }

  async function getCloseEntry(yearMonth: string) {
    const { data: entry } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("client_id", fixture.clientId)
      .eq("system_entry_kind", "vat_close")
      .eq("system_entry_key", yearMonth)
      .maybeSingle();
    if (!entry) return null;
    const { data: lines } = await supabase
      .from("journal_entry_lines")
      .select("*")
      .eq("journal_entry_id", entry.id)
      .order("line_number", { ascending: true });
    return { entry, lines: lines ?? [] };
  }

  const simplify = (lines: { account_code: string; debit: number; credit: number }[]) =>
    lines.map((l) => ({ account_code: l.account_code, debit: l.debit, credit: l.credit }));

  const opts = () => ({ supabaseClient: supabase, userId: fixture.userId });

  it("生成結算分錄 from filing.summary during 產生傳票 (payable case)", async () => {
    const { id, yearMonth } = await createPeriod();
    await setSummary(id, { output_tax: 50_000, input_tax: 30_000, prior_carryover: 0 });

    const res = await generateDraftEntriesByPeriod(id, opts());
    expect(res.vatClose).toBe("created");

    const close = await getCloseEntry(yearMonth);
    expect(close).not.toBeNull();
    expect(close!.entry.voucher_type).toBe("轉帳");
    expect(close!.entry.status).toBe("draft");
    expect(close!.entry.document_id).toBeNull();
    expect(simplify(close!.lines)).toEqual([
      { account_code: ACCT_OUTPUT_TAX, debit: 50_000, credit: 0 },
      { account_code: ACCT_INPUT_TAX, debit: 0, credit: 30_000 },
      { account_code: ACCT_TAX_PAYABLE, debit: 0, credit: 20_000 },
    ]);
  });

  it("is idempotent — re-running updates in place (one row, same id)", async () => {
    const { id, yearMonth } = await createPeriod();
    await setSummary(id, { output_tax: 50_000, input_tax: 30_000, prior_carryover: 0 });

    const first = await generateDraftEntriesByPeriod(id, opts());
    expect(first.vatClose).toBe("created");
    const firstId = (await getCloseEntry(yearMonth))!.entry.id;

    const second = await generateDraftEntriesByPeriod(id, opts());
    expect(second.vatClose).toBe("updated");
    const close = await getCloseEntry(yearMonth);
    expect(close!.entry.id).toBe(firstId);
  });

  it("skips with a note when .TET_U figures are absent", async () => {
    const { id, yearMonth } = await createPeriod();
    const res = await generateDraftEntriesByPeriod(id, opts());
    expect(res.vatClose).toBe("skipped-no-summary");
    expect(await getCloseEntry(yearMonth)).toBeNull();
  });

  it("upsertVatCloseEntry refreshes the draft after the figures change (carryover case)", async () => {
    const { id, yearMonth } = await createPeriod();
    await setSummary(id, { output_tax: 50_000, input_tax: 30_000, prior_carryover: 0 });
    await upsertVatCloseEntry(id, opts());

    // Now the period nets to a carry-forward credit: 進項 40,000 − 銷項 20,000.
    await setSummary(id, { output_tax: 20_000, input_tax: 40_000, prior_carryover: 0 });
    expect(await upsertVatCloseEntry(id, opts())).toBe("updated");

    const close = await getCloseEntry(yearMonth);
    expect(simplify(close!.lines)).toEqual([
      { account_code: ACCT_OUTPUT_TAX, debit: 20_000, credit: 0 },
      { account_code: ACCT_INPUT_TAX, debit: 0, credit: 40_000 },
      { account_code: ACCT_TAX_CREDIT, debit: 20_000, credit: 0 },
    ]);
  });

  it("removes the draft when the figures net to nothing", async () => {
    const { id, yearMonth } = await createPeriod();
    await setSummary(id, { output_tax: 50_000, input_tax: 30_000, prior_carryover: 0 });
    await upsertVatCloseEntry(id, opts());
    expect(await getCloseEntry(yearMonth)).not.toBeNull();

    await setSummary(id, { output_tax: 0, input_tax: 0, prior_carryover: 0 });
    expect(await upsertVatCloseEntry(id, opts())).toBe("removed");
    expect(await getCloseEntry(yearMonth)).toBeNull();
  });

  it("deleteVatCloseEntry drops a draft but keeps a posted one", async () => {
    const { id, yearMonth } = await createPeriod();
    await setSummary(id, { output_tax: 50_000, input_tax: 30_000, prior_carryover: 0 });
    await upsertVatCloseEntry(id, opts());

    // A draft is removed on 取消申報.
    await deleteVatCloseEntry(id, opts());
    expect(await getCloseEntry(yearMonth)).toBeNull();

    // Recreate, post it, then delete → the posted voucher must survive (no gap).
    await upsertVatCloseEntry(id, opts());
    const entryId = (await getCloseEntry(yearMonth))!.entry.id;
    const [posted] = await postJournalEntries(fixture.clientId, [entryId], opts());
    expect(posted.error).toBeNull();
    expect(posted.voucher_no).not.toBeNull();

    await deleteVatCloseEntry(id, opts());
    const stillThere = await getCloseEntry(yearMonth);
    expect(stillThere).not.toBeNull();
    expect(stillThere!.entry.status).toBe("posted");

    // And a refresh leaves the posted entry untouched.
    await setSummary(id, { output_tax: 99_000, input_tax: 1_000, prior_carryover: 0 });
    expect(await upsertVatCloseEntry(id, opts())).toBe("skipped-posted");
  });
});
