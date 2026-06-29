import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  upsertVatCloseEntry,
  recordVatPayment,
  getVatPaymentInfo,
  deleteVatPaymentDraft,
  postJournalEntries,
} from "@/lib/services/journal-entry";
import { ACCT_TAX_PAYABLE } from "@/lib/services/journal-entry-generation";
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

const ACCT_BANK = "1112";
const ACCT_CASH = "1111";

// The 營業稅繳款 system entry: one draft per (client, year_month) that clears the 2132
// 應付稅捐 the close entry booked. The card's server actions use the cookie client and
// aren't reachable here, so we drive the same core helpers they call through the
// injectable-client options: recordVatPayment / getVatPaymentInfo / deleteVatPaymentDraft.
describe.skipIf(!hasDbEnv)("VAT payment entry — 營業稅繳款", () => {
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
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        year_month: yearMonth,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id, yearMonth };
  }

  // Set up a period that nets to 本期應繳 and materialise its close entry (貸 2132),
  // so a payable exists to pay against. Returns the period id / year_month and payable.
  async function createPayablePeriod(payable = 20_000) {
    const { id, yearMonth } = await createPeriod();
    const summary: TaxFilingSummary = {
      total_sales: 0,
      total_purchases: 0,
      tax_payable: payable,
      credit_carryover: 0,
      output_tax: 30_000 + payable,
      input_tax: 30_000,
      prior_carryover: 0,
    };
    const { error } = await supabase
      .from("tax_filing_periods")
      .update({
        filing: { snapshots: {}, attachments: [], summary } as unknown as Json,
      })
      .eq("id", id);
    if (error) throw error;
    await upsertVatCloseEntry(id, opts());
    return { id, yearMonth, payable };
  }

  async function getPaymentEntry(yearMonth: string) {
    const { data: entry } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("client_id", fixture.clientId)
      .eq("system_entry_type", "vat_payment")
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

  const simplify = (
    lines: { account_code: string; debit: number; credit: number }[],
  ) =>
    lines.map((l) => ({
      account_code: l.account_code,
      debit: l.debit,
      credit: l.credit,
    }));

  // Net 2132 across this period's POSTED entries (liability = credit − debit). After both
  // the close (貸) and the payment (借) post, it must return to 0.
  async function postedTaxPayableBalance(yearMonth: string): Promise<number> {
    const { data } = await supabase
      .from("journal_entries")
      .select("id, status, system_entry_key, journal_entry_lines(account_code, debit, credit)")
      .eq("client_id", fixture.clientId)
      .eq("system_entry_key", yearMonth)
      .eq("status", "posted");
    let net = 0;
    for (const e of data ?? []) {
      for (const l of e.journal_entry_lines ?? []) {
        if (l.account_code === ACCT_TAX_PAYABLE) net += l.credit - l.debit;
      }
    }
    return net;
  }

  const opts = () => ({ supabaseClient: supabase, userId: fixture.userId });

  it("getVatPaymentInfo reports the payable from the close entry, no payment yet", async () => {
    const { id } = await createPayablePeriod(20_000);
    const info = await getVatPaymentInfo(id, opts());
    expect(info.payable).toBe(20_000);
    expect(info.summaryPayable).toBe(20_000); // agrees with Field 91, no mismatch
    expect(info.payment).toBeNull();
  });

  it("surfaces summaryPayable so the card can flag a booked-vs-filed divergence", async () => {
    const { id, yearMonth } = await createPayablePeriod(20_000);
    // Simulate an edited close entry: bump the 2132 credit so the booked liability (21,000)
    // no longer matches Field 91 (20,000) still in the summary.
    const close = await supabase
      .from("journal_entries")
      .select("id")
      .eq("client_id", fixture.clientId)
      .eq("system_entry_type", "vat_close")
      .eq("system_entry_key", yearMonth)
      .single();
    await supabase
      .from("journal_entry_lines")
      .update({ credit: 21_000 })
      .eq("journal_entry_id", close.data!.id)
      .eq("account_code", ACCT_TAX_PAYABLE);

    const info = await getVatPaymentInfo(id, opts());
    expect(info.payable).toBe(21_000); // booked is authoritative
    expect(info.summaryPayable).toBe(20_000); // ≠ payable → card warns
  });

  it("records a balanced draft 借 2132 / 貸 1112", async () => {
    const { id, yearMonth } = await createPayablePeriod(20_000);
    await recordVatPayment(
      id,
      { entryDate: "2027-04-15", amount: 20_000, creditAccountCode: ACCT_BANK },
      opts(),
    );

    const pay = await getPaymentEntry(yearMonth);
    expect(pay).not.toBeNull();
    expect(pay!.entry.voucher_type).toBe("支出");
    expect(pay!.entry.status).toBe("draft");
    expect(pay!.entry.document_id).toBeNull();
    expect(simplify(pay!.lines)).toEqual([
      { account_code: ACCT_TAX_PAYABLE, debit: 20_000, credit: 0 },
      { account_code: ACCT_BANK, debit: 0, credit: 20_000 },
    ]);

    const info = await getVatPaymentInfo(id, opts());
    expect(info.payment).toMatchObject({
      status: "draft",
      amount: 20_000,
      entry_date: "2027-04-15",
      account_code: ACCT_BANK,
      voucher_no: null,
    });
  });

  it("re-recording updates the draft in place (one row, same id)", async () => {
    const { id, yearMonth } = await createPayablePeriod(20_000);
    await recordVatPayment(
      id,
      { entryDate: "2027-04-15", amount: 20_000, creditAccountCode: ACCT_BANK },
      opts(),
    );
    const firstId = (await getPaymentEntry(yearMonth))!.entry.id;

    // Pay by cash this time, slightly higher (rounding/surcharge), different date.
    await recordVatPayment(
      id,
      { entryDate: "2027-04-20", amount: 20_100, creditAccountCode: ACCT_CASH },
      opts(),
    );
    const pay = await getPaymentEntry(yearMonth);
    expect(pay!.entry.id).toBe(firstId);
    expect(pay!.entry.entry_date).toBe("2027-04-20");
    expect(simplify(pay!.lines)).toEqual([
      { account_code: ACCT_TAX_PAYABLE, debit: 20_100, credit: 0 },
      { account_code: ACCT_CASH, debit: 0, credit: 20_100 },
    ]);
  });

  it("after posting both close and payment, the 2132 balance nets to 0; re-record is rejected", async () => {
    const { id, yearMonth } = await createPayablePeriod(20_000);

    // Post the close entry (貸 2132 20,000).
    const close = await supabase
      .from("journal_entries")
      .select("id")
      .eq("client_id", fixture.clientId)
      .eq("system_entry_type", "vat_close")
      .eq("system_entry_key", yearMonth)
      .single();
    const [postedClose] = await postJournalEntries(
      fixture.clientId,
      [close.data!.id],
      opts(),
    );
    expect(postedClose.error).toBeNull();

    // Record + post the payment (借 2132 20,000).
    await recordVatPayment(
      id,
      { entryDate: "2027-04-15", amount: 20_000, creditAccountCode: ACCT_BANK },
      opts(),
    );
    const payId = (await getPaymentEntry(yearMonth))!.entry.id;
    const [postedPay] = await postJournalEntries(fixture.clientId, [payId], opts());
    expect(postedPay.error).toBeNull();
    expect(postedPay.voucher_no).not.toBeNull();

    expect(await postedTaxPayableBalance(yearMonth)).toBe(0);

    // A posted payment is immutable — re-recording must be refused.
    await expect(
      recordVatPayment(
        id,
        { entryDate: "2027-04-16", amount: 20_000, creditAccountCode: ACCT_BANK },
        opts(),
      ),
    ).rejects.toThrow();

    // getVatPaymentInfo surfaces the posted entry with its voucher number.
    const info = await getVatPaymentInfo(id, opts());
    expect(info.payment).toMatchObject({ status: "posted" });
    expect(info.payment!.voucher_no).toBe(postedPay.voucher_no);
  });

  it("deleteVatPaymentDraft removes a still-draft entry", async () => {
    const { id, yearMonth } = await createPayablePeriod(20_000);
    await recordVatPayment(
      id,
      { entryDate: "2027-04-15", amount: 20_000, creditAccountCode: ACCT_BANK },
      opts(),
    );
    expect(await getPaymentEntry(yearMonth)).not.toBeNull();

    await deleteVatPaymentDraft(id, opts());
    expect(await getPaymentEntry(yearMonth)).toBeNull();
    expect((await getVatPaymentInfo(id, opts())).payment).toBeNull();
  });

  it("rejects a payment dated into a closed fiscal year", async () => {
    const { id } = await createPayablePeriod(20_000);
    const { error } = await supabase.from("fiscal_year_closes").insert({
      firm_id: fixture.firmId,
      client_id: fixture.clientId,
      gregorian_year: 2025,
      closed_by: fixture.userId,
    });
    if (error) throw error;

    await expect(
      recordVatPayment(
        id,
        { entryDate: "2025-12-31", amount: 20_000, creditAccountCode: ACCT_BANK },
        opts(),
      ),
    ).rejects.toThrow("已關帳");
  });

  it("rejects a non-positive amount", async () => {
    const { id } = await createPayablePeriod(20_000);
    await expect(
      recordVatPayment(
        id,
        { entryDate: "2027-04-15", amount: 0, creditAccountCode: ACCT_BANK },
        opts(),
      ),
    ).rejects.toThrow();
  });
});
