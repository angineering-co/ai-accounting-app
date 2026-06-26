import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createManualEntry,
  type CreateManualEntryInput,
  type EditEntryLine,
} from "@/lib/services/journal-entry";
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

// createManualEntry = the write behind 新增傳票 / 期初開帳: a brand-new DRAFT entry
// with no source document (document_id NULL). The 期初開帳 preset is just this with
// voucher_type=轉帳 and description=期初開帳, so it shares every guard tested here.
describe.skipIf(!hasDbEnv)("createManualEntry — manual draft voucher (no document)", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixture: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (fixture) await cleanupTestFixture(supabase, fixture);
  });

  const opts = () => ({ supabaseClient: supabase, userId: fixture.userId });

  const BALANCED: EditEntryLine[] = [
    { account_code: "1111", debit: 1_000, credit: 0, description: "現金期初" },
    { account_code: "3432", debit: 0, credit: 1_000, description: null },
  ];
  // Two lines clearing the min-2 rule whose totals don't match (1500 Dr vs 0 Cr);
  // each line still passes the debit/credit XOR, isolating the balance check.
  const UNBALANCED: EditEntryLine[] = [
    { account_code: "1111", debit: 1_000, credit: 0, description: null },
    { account_code: "1112", debit: 500, credit: 0, description: null },
  ];

  const input = (over: Partial<CreateManualEntryInput> = {}): CreateManualEntryInput => ({
    voucher_type: "轉帳",
    entry_date: "2026-03-01",
    description: "期初開帳",
    lines: BALANCED,
    ...over,
  });

  async function getEntry(id: string) {
    const { data } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data;
  }

  async function getLines(id: string) {
    const { data } = await supabase
      .from("journal_entry_lines")
      .select("line_number, account_code, debit, credit, description")
      .eq("journal_entry_id", id)
      .order("line_number");
    return data ?? [];
  }

  it("creates a balanced draft with no source document and returns its id", async () => {
    const id = await createManualEntry(fixture.clientId, input(), opts());

    const entry = await getEntry(id);
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe("draft");
    expect(entry!.document_id).toBeNull();
    expect(entry!.voucher_no).toBeNull();
    expect(entry!.voucher_type).toBe("轉帳");
    expect(entry!.description).toBe("期初開帳");
    expect(entry!.created_by).toBe(fixture.userId);

    const lines = await getLines(id);
    expect(lines.map((l) => l.account_code)).toEqual(["1111", "3432"]);
    expect(lines[0]).toMatchObject({ line_number: 1, debit: 1_000, credit: 0, description: "現金期初" });
    expect(lines[1]).toMatchObject({ line_number: 2, debit: 0, credit: 1_000 });
  });

  it("rejects unbalanced lines", async () => {
    await expect(
      createManualEntry(fixture.clientId, input({ lines: UNBALANCED }), opts()),
    ).rejects.toThrow(/借貸不平衡/);
  });

  it("rejects a blank 摘要 (entry-level description is mandatory)", async () => {
    await expect(
      createManualEntry(fixture.clientId, input({ description: "   " }), opts()),
    ).rejects.toThrow(/摘要/);
  });

  it("rejects fewer than two lines", async () => {
    await expect(
      createManualEntry(
        fixture.clientId,
        input({ lines: [{ account_code: "1111", debit: 1_000, credit: 0, description: null }] }),
        opts(),
      ),
    ).rejects.toThrow();
  });

  it("rejects malformed input (bad entry_date, non-integer amount)", async () => {
    await expect(
      createManualEntry(fixture.clientId, input({ entry_date: "2026/03/01" }), opts()),
    ).rejects.toThrow();
    await expect(
      createManualEntry(
        fixture.clientId,
        input({
          lines: [
            { account_code: "1111", debit: 10.5, credit: 0, description: null },
            { account_code: "3432", debit: 0, credit: 10.5, description: null },
          ],
        }),
        opts(),
      ),
    ).rejects.toThrow();
  });

  it("rejects an entry_date in a closed fiscal year", async () => {
    const closedYear = 2045;
    await supabase.from("fiscal_year_closes").insert({
      firm_id: fixture.firmId,
      client_id: fixture.clientId,
      gregorian_year: closedYear,
      closed_by: fixture.userId,
    });
    try {
      await expect(
        createManualEntry(fixture.clientId, input({ entry_date: "2045-03-01" }), opts()),
      ).rejects.toThrow(/已關帳/);
    } finally {
      await supabase
        .from("fiscal_year_closes")
        .delete()
        .eq("client_id", fixture.clientId)
        .eq("gregorian_year", closedYear);
    }
  });
});
