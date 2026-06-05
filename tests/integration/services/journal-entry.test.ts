import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createInvoice } from "@/lib/services/invoice";
import { createAllowance } from "@/lib/services/allowance";
import {
  confirmInvoiceEntry,
  confirmAllowanceEntry,
} from "@/lib/services/journal-entry";
import {
  ACCT_BANK,
  ACCT_CASH,
  ACCT_INPUT_TAX,
  ACCT_OTHER_INCOME,
  ACCT_OUTPUT_TAX,
  ACCT_REVENUE,
} from "@/lib/services/journal-entry-generation";
import type {
  ExtractedInvoiceData,
  ExtractedAllowanceData,
} from "@/lib/domain/models";
import type { Json } from "@/supabase/database.types";
import {
  cleanupTestFixture,
  createTestFixture,
  getEntryWithLines,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";

const hasDbEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    // The write service commits through Drizzle, which needs DATABASE_URL.
    process.env.DATABASE_URL,
);

// We exercise confirmInvoiceEntry / confirmAllowanceEntry directly (injected
// service client + userId). These are the per-document generators (compute +
// upsertDraftEntry); the period-level batch shares their compute/upsert layer
// rather than calling them, and is covered in its own suite.
describe.skipIf(!hasDbEnv)("Phase 7 — draft journal entry generators", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixture: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (fixture) await cleanupTestFixture(supabase, fixture);
  });

  async function seedConfirmedInvoice(
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
        extracted_data: extracted_data as unknown as Json,
      })
      .eq("id", invoice.id);
    if (error) throw error;
    return { id: invoice.id, document_id: invoice.document_id! };
  }

  async function seedConfirmedAllowance(
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
        extracted_data: extracted_data as unknown as Json,
        original_invoice_id,
      })
      .eq("id", allowance.id);
    if (error) throw error;
    return { id: allowance.id, document_id: allowance.document_id! };
  }

  const simplify = (lines: { account_code: string; debit: number; credit: number }[]) =>
    lines.map((l) => ({ account_code: l.account_code, debit: l.debit, credit: l.credit }));

  // ---------- invoice templates ----------

  it("進項可扣抵 → 3-line draft entry linked via document_id", async () => {
    const inv = await seedConfirmedInvoice("in", {
      date: "2026/01/15",
      totalSales: 10_000,
      tax: 500,
      totalAmount: 10_500,
      deductible: true,
      account: "6113 旅費",
    });

    const entryId = await confirmInvoiceEntry(inv.id, {
      supabaseClient: supabase,
      userId: fixture.userId,
    });
    expect(entryId).toBeTruthy();

    const result = await getEntryWithLines(supabase, inv.document_id);
    expect(result).not.toBeNull();
    expect(result!.entry.status).toBe("draft");
    expect(result!.entry.voucher_no).toBeNull();
    expect(result!.entry.voucher_type).toBe("支出");
    expect(result!.entry.entry_date).toBe("2026-01-15");
    expect(result!.entry.document_id).toBe(inv.document_id);
    expect(simplify(result!.lines)).toEqual([
      { account_code: "6113", debit: 10_000, credit: 0 },
      { account_code: ACCT_INPUT_TAX, debit: 500, credit: 0 },
      { account_code: ACCT_BANK, debit: 0, credit: 10_500 },
    ]);
  });

  it("進項不可扣抵 → 2-line draft entry", async () => {
    const inv = await seedConfirmedInvoice("in", {
      totalSales: 200,
      tax: 10,
      totalAmount: 210,
      deductible: false,
      account: "6120 交際費",
    });
    await confirmInvoiceEntry(inv.id, { supabaseClient: supabase, userId: fixture.userId });

    const result = await getEntryWithLines(supabase, inv.document_id);
    expect(simplify(result!.lines)).toEqual([
      { account_code: "6120", debit: 210, credit: 0 },
      { account_code: ACCT_CASH, debit: 0, credit: 210 },
    ]);
  });

  it("銷項 → 3-line draft entry", async () => {
    const inv = await seedConfirmedInvoice("out", {
      totalSales: 20_000,
      tax: 1_000,
      totalAmount: 21_000,
    });
    await confirmInvoiceEntry(inv.id, { supabaseClient: supabase, userId: fixture.userId });

    const result = await getEntryWithLines(supabase, inv.document_id);
    expect(result!.entry.voucher_type).toBe("收入");
    expect(simplify(result!.lines)).toEqual([
      { account_code: ACCT_BANK, debit: 21_000, credit: 0 },
      { account_code: ACCT_REVENUE, debit: 0, credit: 20_000 },
      { account_code: ACCT_OUTPUT_TAX, debit: 0, credit: 1_000 },
    ]);
  });

  // ---------- allowance mirror ----------

  it("進項折讓 with resolved original → mirrors the original entry", async () => {
    const original = await seedConfirmedInvoice("in", {
      totalSales: 10_000,
      tax: 500,
      totalAmount: 10_500,
      deductible: true,
      account: "6113 旅費",
    });
    await confirmInvoiceEntry(original.id, { supabaseClient: supabase, userId: fixture.userId });

    const allowance = await seedConfirmedAllowance(
      "in",
      { date: "2026/06/10", amount: 1_000, taxAmount: 50 },
      original.id,
    );
    await confirmAllowanceEntry(allowance.id, { supabaseClient: supabase, userId: fixture.userId });

    const result = await getEntryWithLines(supabase, allowance.document_id);
    expect(result!.entry.voucher_type).toBe("收入");
    expect(simplify(result!.lines)).toEqual([
      { account_code: ACCT_BANK, debit: 1_050, credit: 0 },
      { account_code: "6113", debit: 0, credit: 1_000 },
      { account_code: ACCT_INPUT_TAX, debit: 0, credit: 50 },
    ]);
  });

  it("銷項折讓 with resolved original → mirrors the original output entry", async () => {
    const original = await seedConfirmedInvoice("out", {
      totalSales: 20_000,
      tax: 1_000,
      totalAmount: 21_000,
    });
    await confirmInvoiceEntry(original.id, { supabaseClient: supabase, userId: fixture.userId });

    const allowance = await seedConfirmedAllowance(
      "out",
      { amount: 2_000, taxAmount: 100 },
      original.id,
    );
    await confirmAllowanceEntry(allowance.id, { supabaseClient: supabase, userId: fixture.userId });

    const result = await getEntryWithLines(supabase, allowance.document_id);
    expect(result!.entry.voucher_type).toBe("支出");
    expect(simplify(result!.lines)).toEqual([
      { account_code: ACCT_REVENUE, debit: 2_000, credit: 0 },
      { account_code: ACCT_OUTPUT_TAX, debit: 100, credit: 0 },
      { account_code: ACCT_BANK, debit: 0, credit: 2_100 },
    ]);
  });

  // ---------- allowance default rule (original_invoice_id IS NULL) ----------

  it("進項折讓 with no original → default rule (Cr 7044, tax line present)", async () => {
    const allowance = await seedConfirmedAllowance(
      "in",
      { amount: 1_000, taxAmount: 50 },
      null,
    );
    await confirmAllowanceEntry(allowance.id, { supabaseClient: supabase, userId: fixture.userId });

    const result = await getEntryWithLines(supabase, allowance.document_id);
    expect(result!.entry.voucher_type).toBe("收入");
    expect(simplify(result!.lines)).toEqual([
      { account_code: ACCT_CASH, debit: 1_050, credit: 0 },
      { account_code: ACCT_OTHER_INCOME, debit: 0, credit: 1_000 },
      { account_code: ACCT_INPUT_TAX, debit: 0, credit: 50 },
    ]);
  });

  it("銷項折讓 with no original and taxAmount=0 → default rule, no tax line", async () => {
    const allowance = await seedConfirmedAllowance(
      "out",
      { amount: 500, taxAmount: 0 },
      null,
    );
    await confirmAllowanceEntry(allowance.id, { supabaseClient: supabase, userId: fixture.userId });

    const result = await getEntryWithLines(supabase, allowance.document_id);
    expect(result!.entry.voucher_type).toBe("支出");
    expect(simplify(result!.lines)).toEqual([
      { account_code: ACCT_REVENUE, debit: 500, credit: 0 },
      { account_code: ACCT_CASH, debit: 0, credit: 500 },
    ]);
  });

  // ---------- fail-loud: original set but unresolvable ----------

  it("original_invoice_id set but original has no entry → throws (no fallback)", async () => {
    // Original invoice exists but is NOT confirmed into an entry.
    const original = await seedConfirmedInvoice("in", {
      totalSales: 1_000,
      tax: 50,
      totalAmount: 1_050,
      account: "6113 旅費",
    });
    const allowance = await seedConfirmedAllowance(
      "in",
      { amount: 100, taxAmount: 5 },
      original.id,
    );

    await expect(
      confirmAllowanceEntry(allowance.id, {
        supabaseClient: supabase,
        userId: fixture.userId,
      }),
    ).rejects.toThrow(/has no journal entry/);

    expect(await getEntryWithLines(supabase, allowance.document_id)).toBeNull();
  });

  // ---------- idempotency / regenerate ----------

  it("re-confirm replaces lines, keeps entry.id (idempotent regenerate)", async () => {
    const inv = await seedConfirmedInvoice("in", {
      totalSales: 10_000,
      tax: 500,
      totalAmount: 10_500,
      deductible: true,
      account: "6113 旅費",
    });
    const firstId = await confirmInvoiceEntry(inv.id, {
      supabaseClient: supabase,
      userId: fixture.userId,
    });

    // Edit the confirmed invoice's data, then re-confirm.
    await supabase
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
    const secondId = await confirmInvoiceEntry(inv.id, {
      supabaseClient: supabase,
      userId: fixture.userId,
    });

    expect(secondId).toBe(firstId);

    const { count } = await supabase
      .from("journal_entries")
      .select("*", { count: "exact", head: true })
      .eq("document_id", inv.document_id);
    expect(count).toBe(1);

    const result = await getEntryWithLines(supabase, inv.document_id);
    expect(simplify(result!.lines)).toEqual([
      { account_code: "6120", debit: 8_000, credit: 0 },
      { account_code: ACCT_INPUT_TAX, debit: 400, credit: 0 },
      { account_code: ACCT_CASH, debit: 0, credit: 8_400 },
    ]);
  });

  // ---------- non-postable skip ----------

  it("作廢 invoice → no entry, no throw", async () => {
    const inv = await seedConfirmedInvoice("in", {
      totalSales: 100,
      tax: 5,
      totalAmount: 105,
      account: "6113 旅費",
      taxType: "作廢",
    });
    const entryId = await confirmInvoiceEntry(inv.id, {
      supabaseClient: supabase,
      userId: fixture.userId,
    });
    expect(entryId).toBeNull();
    expect(await getEntryWithLines(supabase, inv.document_id)).toBeNull();
  });

  it("non-confirmed invoice → no entry", async () => {
    const invoice = await createInvoice(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: `${fixture.firmId}/11505/${fixture.clientId}/${crypto.randomUUID()}.pdf`,
        filename: "inv.pdf",
        in_or_out: "in",
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );
    // status stays 'uploaded'
    const entryId = await confirmInvoiceEntry(invoice.id, {
      supabaseClient: supabase,
      userId: fixture.userId,
    });
    expect(entryId).toBeNull();
    expect(await getEntryWithLines(supabase, invoice.document_id!)).toBeNull();
  });

});
