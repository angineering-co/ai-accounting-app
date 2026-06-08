import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MAX_POST_BATCH, postJournalEntries } from "@/lib/services/journal-entry";
import {
  cleanupTestFixture,
  createTestClient,
  createTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";

const hasDbEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.DATABASE_URL,
);

// post = draft → posted + no-gap voucher_no (§5.4). Posting is agnostic to how a
// draft was created, so these tests seed draft entries directly (full control over
// entry_date + balance) rather than going through generation. voucher_sequences is
// keyed (client_id, seq_date) and lives for the whole run, so each test uses a
// DISTINCT date to keep its expected sequence numbers independent.
describe.skipIf(!hasDbEnv)("postJournalEntries — no-gap batch posting", () => {
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

  const BALANCED = [
    { account_code: "1111", debit: 1_000, credit: 0 },
    { account_code: "4101", debit: 0, credit: 1_000 },
  ];
  // A single debit-only line: each line passes the debit_credit_xor CHECK, but the
  // entry's debit total (1000) ≠ credit total (0) → rejected at post.
  const UNBALANCED = [{ account_code: "1111", debit: 1_000, credit: 0 }];

  async function seedDraftEntry(
    entry_date: string, // YYYY-MM-DD
    lines: { account_code: string; debit: number; credit: number }[],
    clientId = fixture.clientId,
  ): Promise<string> {
    const { data: entry, error } = await supabase
      .from("journal_entries")
      .insert({
        firm_id: fixture.firmId,
        client_id: clientId,
        voucher_type: "支出",
        entry_date,
        status: "draft",
        created_by: fixture.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    const { error: lerr } = await supabase.from("journal_entry_lines").insert(
      lines.map((l, i) => ({
        journal_entry_id: entry.id,
        line_number: i + 1,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
      })),
    );
    if (lerr) throw lerr;
    return entry.id;
  }

  async function getEntry(id: string) {
    const { data } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("id", id)
      .single();
    return data!;
  }

  const resultFor = (
    results: Awaited<ReturnType<typeof postJournalEntries>>,
    id: string,
  ) => results.find((r) => r.entry_id === id)!;

  it("posts a single draft: status→posted, formatted voucher_no, posted_by/at set", async () => {
    const id = await seedDraftEntry("2026-01-05", BALANCED);
    const results = await postJournalEntries(fixture.clientId, [id], opts());

    expect(results).toHaveLength(1);
    expect(results[0].error).toBeNull();
    expect(results[0].voucher_no).toBe("20260105-00001");
    expect(results[0].voucher_no).toMatch(/^\d{8}-\d{5}$/);

    const row = await getEntry(id);
    expect(row.status).toBe("posted");
    expect(row.voucher_no).toBe("20260105-00001");
    expect(row.posted_by).toBe(fixture.userId);
    expect(row.posted_at).not.toBeNull();
  });

  it("assigns consecutive numbers to multiple drafts on the same date", async () => {
    const a = await seedDraftEntry("2026-01-06", BALANCED);
    const b = await seedDraftEntry("2026-01-06", BALANCED);
    const results = await postJournalEntries(fixture.clientId, [a, b], opts());

    expect(resultFor(results, a).voucher_no).toBe("20260106-00001");
    expect(resultFor(results, b).voucher_no).toBe("20260106-00002");
  });

  it("sequences reset per date (seq is keyed by client + date)", async () => {
    const e = await seedDraftEntry("2026-01-07", BALANCED);
    const f = await seedDraftEntry("2026-01-08", BALANCED);
    const results = await postJournalEntries(fixture.clientId, [e, f], opts());

    expect(resultFor(results, e).voucher_no).toBe("20260107-00001");
    expect(resultFor(results, f).voucher_no).toBe("20260108-00001");
  });

  it("is idempotent: re-posting returns the same voucher_no and consumes no number", async () => {
    const id = await seedDraftEntry("2026-01-09", BALANCED);
    const first = await postJournalEntries(fixture.clientId, [id], opts());
    expect(first[0].voucher_no).toBe("20260109-00001");

    const again = await postJournalEntries(fixture.clientId, [id], opts());
    expect(again[0].error).toBeNull();
    expect(again[0].voucher_no).toBe("20260109-00001");

    // A fresh draft on the same date gets 00002, proving the re-post didn't bump.
    const next = await seedDraftEntry("2026-01-09", BALANCED);
    const nextRes = await postJournalEntries(fixture.clientId, [next], opts());
    expect(nextRes[0].voucher_no).toBe("20260109-00002");
  });

  it("rejects an unbalanced entry and consumes no number", async () => {
    const u = await seedDraftEntry("2026-01-10", UNBALANCED);
    const a = await seedDraftEntry("2026-01-10", BALANCED);
    const results = await postJournalEntries(fixture.clientId, [u, a], opts());

    expect(resultFor(results, u).error).toBe("借貸不平衡");
    expect(resultFor(results, u).voucher_no).toBeNull();
    // The balanced one still gets 00001 — the unbalanced never took a number.
    expect(resultFor(results, a).voucher_no).toBe("20260110-00001");
    expect((await getEntry(u)).status).toBe("draft");

    const a2 = await seedDraftEntry("2026-01-10", BALANCED);
    const a2Res = await postJournalEntries(fixture.clientId, [a2], opts());
    expect(a2Res[0].voucher_no).toBe("20260110-00002");
  });

  it("partial success: skipped entries leave no gap in the successes (core invariant)", async () => {
    const a = await seedDraftEntry("2026-01-11", BALANCED);
    const b = await seedDraftEntry("2026-01-11", UNBALANCED);
    const c = await seedDraftEntry("2026-01-11", BALANCED);
    const results = await postJournalEntries(fixture.clientId, [a, b, c], opts());

    expect(resultFor(results, b).error).toBe("借貸不平衡");
    const nums = [resultFor(results, a).voucher_no, resultFor(results, c).voucher_no];
    // Successes are gap-free: 00001 then 00002, despite b being skipped between.
    expect(nums).toEqual(["20260111-00001", "20260111-00002"]);
  });

  it("rejects an entry whose year is closed, still posting other years", async () => {
    const closedYear = 2030;
    await supabase.from("fiscal_year_closes").insert({
      firm_id: fixture.firmId,
      client_id: fixture.clientId,
      gregorian_year: closedYear,
      closed_by: fixture.userId,
    });

    const closed = await seedDraftEntry("2030-06-01", BALANCED);
    const open = await seedDraftEntry("2031-06-01", BALANCED);
    const results = await postJournalEntries(fixture.clientId, [closed, open], opts());

    expect(resultFor(results, closed).error).toBe("該年度已關帳");
    expect(resultFor(results, closed).voucher_no).toBeNull();
    expect((await getEntry(closed)).status).toBe("draft");
    expect(resultFor(results, open).voucher_no).toBe("20310601-00001");

    // Keep the closed-year row from leaking into other tests' dates.
    await supabase
      .from("fiscal_year_closes")
      .delete()
      .eq("client_id", fixture.clientId)
      .eq("gregorian_year", closedYear);
  });

  it("row-scopes by client: posting another client's entry id is 找不到", async () => {
    const other = await createTestClient(supabase, fixture.firmId);
    const id = await seedDraftEntry("2026-01-12", BALANCED);

    // Caller is authorized for `other` (service client), but the entry belongs to
    // fixture.clientId, so the client-scoped row lock never matches it.
    const results = await postJournalEntries(other.id, [id], opts());
    expect(results).toHaveLength(1);
    expect(results[0].error).toBe("找不到");
    expect((await getEntry(id)).status).toBe("draft");
  });

  it("rejects an over-cap batch defensively (before touching the DB)", async () => {
    // Ids need not exist — the cap guard fires before the candidate fetch.
    const tooMany = Array.from({ length: MAX_POST_BATCH + 1 }, () =>
      crypto.randomUUID(),
    );
    await expect(
      postJournalEntries(fixture.clientId, tooMany, opts()),
    ).rejects.toThrow(/一次最多可過帳/);
  });

  it("rejects a non-staff (portal client-role) caller", async () => {
    const id = await seedDraftEntry("2026-01-13", BALANCED);
    // Temporarily demote the fixture caller to the portal client role — posting is
    // a firm-staff action, so even a client viewing their own client must be denied.
    await supabase
      .from("profiles")
      .update({ role: "client" })
      .eq("id", fixture.userId);
    try {
      await expect(
        postJournalEntries(fixture.clientId, [id], opts()),
      ).rejects.toThrow(/權限不足/);
      expect((await getEntry(id)).status).toBe("draft");
    } finally {
      await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", fixture.userId);
    }
  });
});
