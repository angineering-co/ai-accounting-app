import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  createTestFixture,
  cleanupTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/database.types";

// Phase 5 schema landing — verifies CHECK / UNIQUE / FK on each new table actually
// hold at the DB layer. Service-role client used throughout so RLS doesn't mask the
// constraint we're trying to test. RLS isolation is a separate concern (deferred to
// when we ship real reads via a user-context client).

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const NOT_NULL_VIOLATION = "23502";

describe("Voucher / GL schema constraints", () => {
  let supabase: SupabaseClient<Database>;
  let fixture: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    await cleanupTestFixture(supabase, fixture);
  });

  describe("documents", () => {
    it("accepts valid doc_type values", async () => {
      for (const dt of ["invoice", "allowance", "other"]) {
        const { error } = await supabase.from("documents").insert({
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          doc_date: "2026-05-01",
          type: dt === "other" ? "NON_VAT" : "VAT",
          doc_type: dt,
          status: "active",
          created_by: fixture.userId,
        });
        expect(error, `doc_type=${dt}`).toBeNull();
      }
    });

    it("rejects removed doc_type values", async () => {
      const { error } = await supabase.from("documents").insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        doc_date: "2026-05-01",
        type: "NON_VAT",
        doc_type: "receipt",
        status: "active",
        created_by: fixture.userId,
      });
      expect(error?.code).toBe(CHECK_VIOLATION);
    });

    it("rejects invalid status values (no 'duplicate', no 'void')", async () => {
      const { error } = await supabase.from("documents").insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        doc_date: "2026-05-01",
        type: "VAT",
        doc_type: "invoice",
        status: "duplicate",
        created_by: fixture.userId,
      });
      expect(error?.code).toBe(CHECK_VIOLATION);
    });

    it("rejects invalid type values", async () => {
      const { error } = await supabase.from("documents").insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        doc_date: "2026-05-01",
        type: "BOGUS",
        doc_type: "invoice",
        status: "active",
        created_by: fixture.userId,
      });
      expect(error?.code).toBe(CHECK_VIOLATION);
    });
  });

  describe("journal_entries", () => {
    it("accepts a draft entry with NULL voucher_no", async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .insert({
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          voucher_type: "收入",
          entry_date: "2026-05-01",
          status: "draft",
          voucher_no: null,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      // Cleanup so other tests have a clean slate
      if (data?.id) await supabase.from("journal_entries").delete().eq("id", data.id);
    });

    it("rejects a posted entry with NULL voucher_no (CHECK voucher_no_required_when_booked)", async () => {
      const { error } = await supabase.from("journal_entries").insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        voucher_type: "支出",
        entry_date: "2026-05-01",
        status: "posted",
        voucher_no: null,
      });
      expect(error?.code).toBe(CHECK_VIOLATION);
    });

    it("rejects invalid status / voucher_type", async () => {
      const badStatus = await supabase.from("journal_entries").insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        voucher_type: "收入",
        entry_date: "2026-05-01",
        status: "bogus",
      });
      expect(badStatus.error?.code).toBe(CHECK_VIOLATION);

      const badVoucherType = await supabase.from("journal_entries").insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        voucher_type: "外國話",
        entry_date: "2026-05-01",
        status: "draft",
      });
      expect(badVoucherType.error?.code).toBe(CHECK_VIOLATION);
    });

    it("enforces UNIQUE (client_id, voucher_no) for non-null voucher_no", async () => {
      const first = await supabase
        .from("journal_entries")
        .insert({
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          voucher_type: "收入",
          entry_date: "2026-05-01",
          status: "posted",
          voucher_no: "20260501-00001",
        })
        .select("id")
        .single();
      expect(first.error).toBeNull();

      const dup = await supabase.from("journal_entries").insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        voucher_type: "支出",
        entry_date: "2026-05-01",
        status: "posted",
        voucher_no: "20260501-00001",
      });
      expect(dup.error?.code).toBe(UNIQUE_VIOLATION);

      if (first.data?.id)
        await supabase.from("journal_entries").delete().eq("id", first.data.id);
    });

    it("UNIQUE on document_id (one entry per document)", async () => {
      const doc = await supabase
        .from("documents")
        .insert({
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          doc_date: "2026-05-01",
          type: "VAT",
          doc_type: "invoice",
          status: "active",
          created_by: fixture.userId,
        })
        .select("id")
        .single();
      expect(doc.error).toBeNull();

      const e1 = await supabase
        .from("journal_entries")
        .insert({
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          voucher_type: "收入",
          entry_date: "2026-05-01",
          status: "draft",
          document_id: doc.data!.id,
        })
        .select("id")
        .single();
      expect(e1.error).toBeNull();

      const e2 = await supabase.from("journal_entries").insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        voucher_type: "支出",
        entry_date: "2026-05-02",
        status: "draft",
        document_id: doc.data!.id,
      });
      expect(e2.error?.code).toBe(UNIQUE_VIOLATION);

      if (e1.data?.id)
        await supabase.from("journal_entries").delete().eq("id", e1.data.id);
      if (doc.data?.id)
        await supabase.from("documents").delete().eq("id", doc.data.id);
    });
  });

  describe("journal_entry_lines", () => {
    async function createDraftEntry(): Promise<string> {
      const { data, error } = await supabase
        .from("journal_entries")
        .insert({
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          voucher_type: "收入",
          entry_date: "2026-05-01",
          status: "draft",
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("entry insert failed");
      return data.id;
    }

    it("rejects lines where both debit > 0 and credit > 0 (CHECK debit_credit_xor)", async () => {
      const entryId = await createDraftEntry();
      try {
        const { error } = await supabase.from("journal_entry_lines").insert({
          journal_entry_id: entryId,
          line_number: 1,
          account_code: "5102",
          debit: 100,
          credit: 100,
        });
        expect(error?.code).toBe(CHECK_VIOLATION);
      } finally {
        await supabase.from("journal_entries").delete().eq("id", entryId);
      }
    });

    it("rejects lines where both debit = 0 and credit = 0", async () => {
      const entryId = await createDraftEntry();
      try {
        const { error } = await supabase.from("journal_entry_lines").insert({
          journal_entry_id: entryId,
          line_number: 1,
          account_code: "5102",
          debit: 0,
          credit: 0,
        });
        expect(error?.code).toBe(CHECK_VIOLATION);
      } finally {
        await supabase.from("journal_entries").delete().eq("id", entryId);
      }
    });

    it("rejects negative debit / credit (CHECK debit >= 0 / credit >= 0)", async () => {
      const entryId = await createDraftEntry();
      try {
        const { error } = await supabase.from("journal_entry_lines").insert({
          journal_entry_id: entryId,
          line_number: 1,
          account_code: "5102",
          debit: -100,
          credit: 0,
        });
        expect(error?.code).toBe(CHECK_VIOLATION);
      } finally {
        await supabase.from("journal_entries").delete().eq("id", entryId);
      }
    });

    it("UNIQUE (journal_entry_id, line_number)", async () => {
      const entryId = await createDraftEntry();
      try {
        const a = await supabase.from("journal_entry_lines").insert({
          journal_entry_id: entryId,
          line_number: 1,
          account_code: "5102",
          debit: 100,
          credit: 0,
        });
        expect(a.error).toBeNull();

        const b = await supabase.from("journal_entry_lines").insert({
          journal_entry_id: entryId,
          line_number: 1,
          account_code: "1111",
          debit: 0,
          credit: 100,
        });
        expect(b.error?.code).toBe(UNIQUE_VIOLATION);
      } finally {
        await supabase.from("journal_entries").delete().eq("id", entryId);
      }
    });

    it("FK CASCADE: deleting the parent entry deletes its lines", async () => {
      const entryId = await createDraftEntry();
      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entryId, line_number: 1, account_code: "5102", debit: 100, credit: 0 },
        { journal_entry_id: entryId, line_number: 2, account_code: "1111", debit: 0, credit: 100 },
      ]);

      await supabase.from("journal_entries").delete().eq("id", entryId);

      const { data } = await supabase
        .from("journal_entry_lines")
        .select("id")
        .eq("journal_entry_id", entryId);
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("fiscal_year_closes", () => {
    it("UNIQUE (client_id, gregorian_year)", async () => {
      const a = await supabase
        .from("fiscal_year_closes")
        .insert({
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          gregorian_year: 2025,
          closed_by: fixture.userId,
        })
        .select("id")
        .single();
      expect(a.error).toBeNull();

      const b = await supabase.from("fiscal_year_closes").insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        gregorian_year: 2025,
        closed_by: fixture.userId,
      });
      expect(b.error?.code).toBe(UNIQUE_VIOLATION);

      if (a.data?.id)
        await supabase.from("fiscal_year_closes").delete().eq("id", a.data.id);
    });
  });

  describe("voucher_sequences", () => {
    it("PRIMARY KEY (client_id, seq_date)", async () => {
      const a = await supabase.from("voucher_sequences").insert({
        client_id: fixture.clientId,
        seq_date: "2026-05-01",
        next_seq: 1,
      });
      expect(a.error).toBeNull();

      const b = await supabase.from("voucher_sequences").insert({
        client_id: fixture.clientId,
        seq_date: "2026-05-01",
        next_seq: 2,
      });
      expect(b.error?.code).toBe(UNIQUE_VIOLATION);

      await supabase
        .from("voucher_sequences")
        .delete()
        .eq("client_id", fixture.clientId)
        .eq("seq_date", "2026-05-01");
    });
  });

  describe("audit_trails", () => {
    it("rejects invalid action values", async () => {
      const { error } = await supabase.from("audit_trails").insert({
        firm_id: fixture.firmId,
        entity_table: "journal_entries",
        entity_id: crypto.randomUUID(),
        action: "voided",
        actor_id: fixture.userId,
      });
      expect(error?.code).toBe(CHECK_VIOLATION);
    });

    it("accepts a 'reversed' audit row with reason set", async () => {
      const { data, error } = await supabase
        .from("audit_trails")
        .insert({
          firm_id: fixture.firmId,
          entity_table: "journal_entries",
          entity_id: crypto.randomUUID(),
          action: "reversed",
          reason: "test reversal",
          actor_id: fixture.userId,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      if (data?.id) await supabase.from("audit_trails").delete().eq("id", data.id);
    });

    it("rejects missing required fields (entity_id NOT NULL)", async () => {
      // Intentionally bypass the typed insert API to send a payload missing entity_id;
      // we want to verify the DB CHECK fires, not the TS type. Postgres returns 23502.
      const payload: Record<string, unknown> = {
        firm_id: fixture.firmId,
        entity_table: "journal_entries",
        action: "created",
      };
      const { error } = await supabase
        .from("audit_trails")
        .insert(payload as never);
      expect(error?.code).toBe(NOT_NULL_VIOLATION);
    });
  });
});
