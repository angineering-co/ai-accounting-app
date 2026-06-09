import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  deleteDraftEntry,
  editEntry,
  type EditEntryLine,
} from "@/lib/services/journal-entry";
import { auditTrailSchema } from "@/lib/domain/audit-trail";
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

// editEntry = in-place edit of a draft or posted entry (§5.6.1 B1b). A posted edit
// writes a mandatory audit_trails row; a draft edit does not. These tests seed
// entries directly (full control over status / lines / voucher_no) rather than
// going through generation + posting.
describe.skipIf(!hasDbEnv)("editEntry / deleteDraftEntry — in-place edit + audit", () => {
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
    { account_code: "1111", debit: 1_000, credit: 0, description: null },
    { account_code: "4101", debit: 0, credit: 1_000, description: null },
  ];
  const NEW_LINES: EditEntryLine[] = [
    { account_code: "5102", debit: 2_000, credit: 0, description: "差旅" },
    { account_code: "1112", debit: 0, credit: 2_000, description: null },
  ];
  // Two lines (clears the min-2 rule) whose totals don't match: 1500 Dr vs 0 Cr.
  // Each line still passes the debit/credit XOR, so this isolates the balance check.
  const UNBALANCED: EditEntryLine[] = [
    { account_code: "1111", debit: 1_000, credit: 0, description: null },
    { account_code: "5102", debit: 500, credit: 0, description: null },
  ];

  // Unique voucher_no suffix per seeded posted entry (the client+voucher_no unique
  // index forbids collisions across tests sharing a date).
  let vnoCounter = 0;

  async function insertLines(entryId: string, lines: EditEntryLine[]) {
    const { error } = await supabase.from("journal_entry_lines").insert(
      lines.map((l, i) => ({
        journal_entry_id: entryId,
        line_number: i + 1,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
    );
    if (error) throw error;
  }

  async function seedDraftEntry(
    entry_date: string,
    lines: EditEntryLine[] = BALANCED,
    clientId = fixture.clientId,
  ): Promise<string> {
    const { data, error } = await supabase
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
    await insertLines(data.id, lines);
    return data.id;
  }

  async function seedPostedEntry(
    entry_date: string,
    lines: EditEntryLine[] = BALANCED,
    extra: { description?: string | null; status?: "posted" | "reversed" } = {},
  ): Promise<string> {
    vnoCounter += 1;
    const voucher_no = `${entry_date.replaceAll("-", "")}-${String(vnoCounter).padStart(5, "0")}`;
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        voucher_type: "支出",
        entry_date,
        status: extra.status ?? "posted",
        voucher_no,
        posted_by: fixture.userId,
        posted_at: new Date().toISOString(),
        created_by: fixture.userId,
        description: extra.description ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    await insertLines(data.id, lines);
    return data.id;
  }

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

  // Parse through the domain schema so `before` is strongly typed (the raw
  // supabase row types it as loose Json).
  async function getAuditTrails(entryId: string) {
    const { data } = await supabase
      .from("audit_trails")
      .select("*")
      .eq("entity_table", "journal_entries")
      .eq("entity_id", entryId)
      .order("actor_at", { ascending: false });
    return auditTrailSchema.array().parse(data ?? []);
  }

  it("posted edit: patches header, replaces lines, keeps voucher_no/posted_*, writes audit before-snapshot", async () => {
    const id = await seedPostedEntry("2026-02-01", BALANCED, { description: "原始摘要" });
    const before = await getEntry(id);

    await editEntry(
      fixture.clientId,
      id,
      { voucher_type: "轉帳", description: "修正後摘要" },
      NEW_LINES,
      "OCR 科目錯誤，更正",
      opts(),
    );

    const after = await getEntry(id);
    expect(after!.status).toBe("posted");
    expect(after!.voucher_type).toBe("轉帳");
    expect(after!.description).toBe("修正後摘要");
    // Immutable: number + posting metadata unchanged.
    expect(after!.voucher_no).toBe(before!.voucher_no);
    expect(after!.posted_at).toBe(before!.posted_at);
    expect(after!.posted_by).toBe(before!.posted_by);

    const lines = await getLines(id);
    expect(lines.map((l) => l.account_code)).toEqual(["5102", "1112"]);
    expect(lines[0].debit).toBe(2_000);
    expect(lines[0].description).toBe("差旅");

    const trails = await getAuditTrails(id);
    expect(trails).toHaveLength(1);
    expect(trails[0].action).toBe("updated");
    expect(trails[0].reason).toBe("OCR 科目錯誤，更正");
    expect(trails[0].actor_id).toBe(fixture.userId);
    expect(trails[0].before?.entry).toMatchObject({
      voucher_type: "支出",
      entry_date: "2026-02-01",
      description: "原始摘要",
    });
    expect(trails[0].before?.lines).toHaveLength(2);
    expect(trails[0].before?.lines?.[0]).toMatchObject({
      line_number: 1,
      account_code: "1111",
      debit: 1_000,
      credit: 0,
    });
  });

  it("chain integrity: a second posted edit's before equals what the first edit wrote", async () => {
    const id = await seedPostedEntry("2026-02-02", BALANCED, { description: "v0" });

    const L1: EditEntryLine[] = [
      { account_code: "5102", debit: 500, credit: 0, description: null },
      { account_code: "1111", debit: 0, credit: 500, description: null },
    ];
    await editEntry(fixture.clientId, id, { description: "v1" }, L1, "first edit", opts());
    await editEntry(fixture.clientId, id, { description: "v2" }, NEW_LINES, "second edit", opts());

    const trails = await getAuditTrails(id); // newest first
    expect(trails).toHaveLength(2);
    const [second, first] = trails;
    expect(second.reason).toBe("second edit");
    expect(first.reason).toBe("first edit");

    // The first edit snapshotted v0; the second snapshotted exactly what the first wrote (v1 + L1).
    expect(first.before?.entry).toMatchObject({ description: "v0", voucher_type: "支出" });
    expect(second.before?.entry).toMatchObject({ description: "v1" });
    expect(second.before?.lines?.map((l) => l.account_code)).toEqual(["5102", "1111"]);
    expect(second.before?.lines?.[0]).toMatchObject({ debit: 500, credit: 0 });
  });

  it("rejects editing an entry in a closed fiscal year", async () => {
    const closedYear = 2040;
    const id = await seedPostedEntry("2040-03-01", BALANCED);
    await supabase.from("fiscal_year_closes").insert({
      firm_id: fixture.firmId,
      client_id: fixture.clientId,
      gregorian_year: closedYear,
      closed_by: fixture.userId,
    });
    try {
      await expect(
        editEntry(fixture.clientId, id, {}, NEW_LINES, "any", opts()),
      ).rejects.toThrow(/已關帳/);
      // Untouched.
      expect((await getLines(id)).map((l) => l.account_code)).toEqual(["1111", "4101"]);
      expect(await getAuditTrails(id)).toHaveLength(0);
    } finally {
      await supabase
        .from("fiscal_year_closes")
        .delete()
        .eq("client_id", fixture.clientId)
        .eq("gregorian_year", closedYear);
    }
  });

  it("rejects moving a DRAFT into a closed year via entry_date patch", async () => {
    // Posted vouchers can't change date at all (covered below); the move-into-a-
    // closed-year guard is reachable only for drafts.
    const closedYear = 2041;
    const id = await seedDraftEntry("2042-03-01", BALANCED);
    await supabase.from("fiscal_year_closes").insert({
      firm_id: fixture.firmId,
      client_id: fixture.clientId,
      gregorian_year: closedYear,
      closed_by: fixture.userId,
    });
    try {
      await expect(
        editEntry(fixture.clientId, id, { entry_date: "2041-12-31" }, NEW_LINES, "move", opts()),
      ).rejects.toThrow(/已關帳/);
    } finally {
      await supabase
        .from("fiscal_year_closes")
        .delete()
        .eq("client_id", fixture.clientId)
        .eq("gregorian_year", closedYear);
    }
  });

  it("rejects a posted edit with a blank reason and writes no audit row", async () => {
    const id = await seedPostedEntry("2026-02-03", BALANCED);
    await expect(
      editEntry(fixture.clientId, id, {}, NEW_LINES, "   ", opts()),
    ).rejects.toThrow(/必須填寫原因/);
    expect(await getAuditTrails(id)).toHaveLength(0);
    expect((await getLines(id)).map((l) => l.account_code)).toEqual(["1111", "4101"]);
  });

  it("rejects unbalanced new lines", async () => {
    const id = await seedPostedEntry("2026-02-04", BALANCED);
    await expect(
      editEntry(fixture.clientId, id, {}, UNBALANCED, "x", opts()),
    ).rejects.toThrow(/借貸不平衡/);
  });

  it("rejects editing a reversed entry", async () => {
    const id = await seedPostedEntry("2026-02-05", BALANCED, { status: "reversed" });
    await expect(
      editEntry(fixture.clientId, id, {}, NEW_LINES, "x", opts()),
    ).rejects.toThrow(/已沖銷/);
  });

  it("rejects changing entry_date on a posted voucher (number is date-derived)", async () => {
    const id = await seedPostedEntry("2026-02-10", BALANCED);
    await expect(
      editEntry(fixture.clientId, id, { entry_date: "2026-02-11" }, NEW_LINES, "x", opts()),
    ).rejects.toThrow(/不可修改記帳日期/);
    expect(await getAuditTrails(id)).toHaveLength(0);
  });

  it("rejects editing a reversal voucher (reverses_entry_id set)", async () => {
    const original = await seedPostedEntry("2026-02-11", BALANCED);
    // A reversal voucher: posted, with reverses_entry_id pointing at the original.
    vnoCounter += 1;
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        voucher_type: "支出",
        entry_date: "2026-02-12",
        status: "posted",
        voucher_no: `20260212-${String(vnoCounter).padStart(5, "0")}`,
        reverses_entry_id: original,
        posted_by: fixture.userId,
        posted_at: new Date().toISOString(),
        created_by: fixture.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    await insertLines(data.id, BALANCED);

    await expect(
      editEntry(fixture.clientId, data.id, {}, NEW_LINES, "x", opts()),
    ).rejects.toThrow(/沖銷分錄不可編輯/);
  });

  it("rejects malformed input server-side (bad entry_date, non-integer amount)", async () => {
    const id = await seedDraftEntry("2026-02-13", BALANCED);
    await expect(
      editEntry(fixture.clientId, id, { entry_date: "2026/02/13" }, NEW_LINES, "", opts()),
    ).rejects.toThrow();
    await expect(
      editEntry(
        fixture.clientId,
        id,
        {},
        [
          { account_code: "1111", debit: 10.5, credit: 0, description: null },
          { account_code: "4101", debit: 0, credit: 10.5, description: null },
        ],
        "",
        opts(),
      ),
    ).rejects.toThrow();
  });

  it("draft edit: replaces lines + header, writes NO audit row, tolerates empty reason", async () => {
    const id = await seedDraftEntry("2026-02-06", BALANCED);
    await editEntry(
      fixture.clientId,
      id,
      { voucher_type: "收入", description: "草稿改" },
      NEW_LINES,
      "",
      opts(),
    );

    const after = await getEntry(id);
    expect(after!.status).toBe("draft");
    expect(after!.voucher_type).toBe("收入");
    expect(after!.description).toBe("草稿改");
    expect((await getLines(id)).map((l) => l.account_code)).toEqual(["5102", "1112"]);
    expect(await getAuditTrails(id)).toHaveLength(0);
  });

  it("deleteDraftEntry removes the entry and its lines", async () => {
    const id = await seedDraftEntry("2026-02-07", BALANCED);
    await deleteDraftEntry(fixture.clientId, id, opts());
    expect(await getEntry(id)).toBeNull();
    expect(await getLines(id)).toHaveLength(0);
  });

  it("deleteDraftEntry rejects a posted entry", async () => {
    const id = await seedPostedEntry("2026-02-08", BALANCED);
    await expect(deleteDraftEntry(fixture.clientId, id, opts())).rejects.toThrow(
      /僅草稿可刪除/,
    );
    expect((await getEntry(id))!.status).toBe("posted");
  });

  it("row-scopes by client: editing/deleting another client's entry is 找不到", async () => {
    const other = await createTestClient(supabase, fixture.firmId);
    const id = await seedDraftEntry("2026-02-09", BALANCED);

    await expect(
      editEntry(other.id, id, {}, NEW_LINES, "x", opts()),
    ).rejects.toThrow(/找不到/);
    await expect(deleteDraftEntry(other.id, id, opts())).rejects.toThrow(/找不到/);
    // Untouched under its real client.
    expect((await getLines(id)).map((l) => l.account_code)).toEqual(["1111", "4101"]);
  });
});
