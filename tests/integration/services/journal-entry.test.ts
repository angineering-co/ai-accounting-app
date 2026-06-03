import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  syncInvoiceJournalEntry,
  syncAllowanceJournalEntry,
} from "@/lib/services/journal-entry";
import { updateInvoice } from "@/lib/services/invoice";
import { updateAllowance } from "@/lib/services/allowance";
import {
  cleanupTestFixture,
  createTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";
import type { Json } from "@/supabase/database.types";

// Drizzle (DATABASE_URL) + service client (Supabase URL / service-role key) are
// both required: the sync functions write via Drizzle, the test asserts via the
// service client.
const hasDbEnv = Boolean(
  process.env.DATABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasDbEnv)("journal-entry write-path (Phase 7)", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixture: TestFixture;
  let serialCounter = 0;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (fixture) await cleanupTestFixture(supabase, fixture);
  });

  // Unique serial per seeded row (client_id + serial is unique).
  function nextSerial(prefix: string): string {
    serialCounter += 1;
    return `${prefix}${String(serialCounter).padStart(8, "0")}`;
  }

  async function seedDocument(docType: "invoice" | "allowance"): Promise<string> {
    const { data, error } = await supabase
      .from("documents")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        doc_type: docType,
        type: "VAT",
        ocr_status: "done",
        doc_date: "2025-06-01",
        status: "active",
        created_by: fixture.userId,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("seedDocument failed");
    return data.id;
  }

  async function seedInvoice(args: {
    in_or_out: "in" | "out";
    extracted_data: Record<string, unknown>;
    status?: "processed" | "confirmed";
  }): Promise<{ invoiceId: string; documentId: string; serial: string }> {
    const documentId = await seedDocument("invoice");
    const serial = nextSerial("AB");
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        document_id: documentId,
        storage_path: "test/path.pdf",
        filename: "test.pdf",
        in_or_out: args.in_or_out,
        status: args.status ?? "confirmed",
        extracted_data: args.extracted_data as Json,
        uploaded_by: fixture.userId,
        invoice_serial_code: serial,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("seedInvoice failed");
    return { invoiceId: data.id, documentId, serial };
  }

  async function seedAllowance(args: {
    in_or_out: "in" | "out";
    extracted_data: Record<string, unknown>;
    original_invoice_id?: string | null;
    status?: "processed" | "confirmed";
  }): Promise<{ allowanceId: string; documentId: string }> {
    const documentId = await seedDocument("allowance");
    const { data, error } = await supabase
      .from("allowances")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        document_id: documentId,
        in_or_out: args.in_or_out,
        status: args.status ?? "confirmed",
        extracted_data: args.extracted_data as Json,
        original_invoice_id: args.original_invoice_id ?? null,
        uploaded_by: fixture.userId,
        allowance_serial_code: nextSerial("DA"),
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("seedAllowance failed");
    return { allowanceId: data.id, documentId };
  }

  async function getEntry(documentId: string) {
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
      .order("line_number");
    return { entry, lines: lines ?? [] };
  }

  // Compact [account_code, debit, credit] view for assertions.
  function lineTuples(lines: { account_code: string; debit: number; credit: number }[]) {
    return lines.map((l) => [l.account_code, l.debit, l.credit]);
  }

  describe("invoice templates", () => {
    it("進項可扣抵 → 3-line draft (expense / input-tax / settlement)", async () => {
      const { invoiceId, documentId } = await seedInvoice({
        in_or_out: "in",
        extracted_data: {
          date: "2025/06/01",
          totalSales: 10000,
          tax: 500,
          totalAmount: 10500,
          account: "6113 旅費",
          deductible: true,
          taxType: "應稅",
        },
      });

      const result = await syncInvoiceJournalEntry(invoiceId, fixture.userId);
      expect(result.status).toBe("ok");

      const got = await getEntry(documentId);
      expect(got).not.toBeNull();
      expect(got!.entry.status).toBe("draft");
      expect(got!.entry.voucher_no).toBeNull();
      expect(got!.entry.voucher_type).toBe("支出");
      expect(got!.entry.entry_date).toBe("2025-06-01");
      // 10500 > 10,000 → settlement is 1112 (銀行存款)
      expect(lineTuples(got!.lines)).toEqual([
        ["6113", 10000, 0],
        ["1144", 500, 0],
        ["1112", 0, 10500],
      ]);
      // balanced
      const dr = got!.lines.reduce((s, l) => s + l.debit, 0);
      const cr = got!.lines.reduce((s, l) => s + l.credit, 0);
      expect(dr).toBe(cr);
    });

    it("進項不可扣抵 → 2-line draft (expense absorbs tax)", async () => {
      const { invoiceId, documentId } = await seedInvoice({
        in_or_out: "in",
        extracted_data: {
          date: "2025/06/01",
          totalSales: 200,
          tax: 10,
          totalAmount: 210,
          account: "6113 旅費",
          deductible: false,
          taxType: "應稅",
        },
      });

      await syncInvoiceJournalEntry(invoiceId, fixture.userId);
      const got = await getEntry(documentId);
      // 210 <= 10,000 → settlement is 1111 (現金)
      expect(lineTuples(got!.lines)).toEqual([
        ["6113", 210, 0],
        ["1111", 0, 210],
      ]);
    });

    it("銷項 → 3-line draft (settlement / revenue / output-tax)", async () => {
      const { invoiceId, documentId } = await seedInvoice({
        in_or_out: "out",
        extracted_data: {
          date: "2025/06/01",
          totalSales: 10000,
          tax: 500,
          totalAmount: 10500,
          taxType: "應稅",
        },
      });

      await syncInvoiceJournalEntry(invoiceId, fixture.userId);
      const got = await getEntry(documentId);
      expect(got!.entry.voucher_type).toBe("收入");
      expect(lineTuples(got!.lines)).toEqual([
        ["1112", 10500, 0],
        ["4101", 0, 10000],
        ["2134", 0, 500],
      ]);
    });
  });

  describe("allowance mirroring (Decision #13)", () => {
    async function seedConfirmedInvoiceWithEntry(args: {
      in_or_out: "in" | "out";
      extracted_data: Record<string, unknown>;
    }) {
      const seeded = await seedInvoice(args);
      await syncInvoiceJournalEntry(seeded.invoiceId, fixture.userId);
      return seeded;
    }

    it("mirrors a deductible input → 3-line refund", async () => {
      const original = await seedConfirmedInvoiceWithEntry({
        in_or_out: "in",
        extracted_data: {
          totalSales: 10000,
          tax: 500,
          totalAmount: 10500,
          account: "6113 旅費",
          deductible: true,
          taxType: "應稅",
        },
      });

      const { allowanceId, documentId } = await seedAllowance({
        in_or_out: "in",
        original_invoice_id: original.invoiceId,
        extracted_data: { date: "2025/06/10", amount: 1000, taxAmount: 50 },
      });

      const result = await syncAllowanceJournalEntry(allowanceId, fixture.userId);
      expect(result.status).toBe("ok");

      const got = await getEntry(documentId);
      expect(got!.entry.voucher_type).toBe("收入");
      // settlement mirrors the original's channel (1112), not a re-run threshold
      expect(lineTuples(got!.lines)).toEqual([
        ["1112", 1050, 0],
        ["6113", 0, 1000],
        ["1144", 0, 50],
      ]);
    });

    it("mirrors a non-deductible input → 2-line refund", async () => {
      const original = await seedConfirmedInvoiceWithEntry({
        in_or_out: "in",
        extracted_data: {
          totalSales: 200,
          tax: 10,
          totalAmount: 210,
          account: "6113 旅費",
          deductible: false,
          taxType: "應稅",
        },
      });

      const { allowanceId, documentId } = await seedAllowance({
        in_or_out: "in",
        original_invoice_id: original.invoiceId,
        extracted_data: { amount: 100, taxAmount: 5 },
      });

      await syncAllowanceJournalEntry(allowanceId, fixture.userId);
      const got = await getEntry(documentId);
      // 2-line mirror: tax stays merged into the expense reversal (total 105)
      expect(lineTuples(got!.lines)).toEqual([
        ["1111", 105, 0],
        ["6113", 0, 105],
      ]);
    });

    it("mirrors a 銷項 invoice → 3-line allowance", async () => {
      const original = await seedConfirmedInvoiceWithEntry({
        in_or_out: "out",
        extracted_data: {
          totalSales: 10000,
          tax: 500,
          totalAmount: 10500,
          taxType: "應稅",
        },
      });

      const { allowanceId, documentId } = await seedAllowance({
        in_or_out: "out",
        original_invoice_id: original.invoiceId,
        extracted_data: { amount: 1000, taxAmount: 50 },
      });

      await syncAllowanceJournalEntry(allowanceId, fixture.userId);
      const got = await getEntry(documentId);
      expect(got!.entry.voucher_type).toBe("支出");
      expect(lineTuples(got!.lines)).toEqual([
        ["4101", 1000, 0],
        ["2134", 50, 0],
        ["1112", 0, 1050],
      ]);
    });

    it("follows a staff edit to the original entry's account", async () => {
      const original = await seedConfirmedInvoiceWithEntry({
        in_or_out: "in",
        extracted_data: {
          totalSales: 10000,
          tax: 500,
          totalAmount: 10500,
          account: "6113 旅費",
          deductible: true,
          taxType: "應稅",
        },
      });

      // Simulate a staff edit of the original draft: 6113 → 5404.
      const origEntry = await getEntry(original.documentId);
      await supabase
        .from("journal_entry_lines")
        .update({ account_code: "5404" })
        .eq("journal_entry_id", origEntry!.entry.id)
        .eq("account_code", "6113");

      const { allowanceId, documentId } = await seedAllowance({
        in_or_out: "in",
        original_invoice_id: original.invoiceId,
        extracted_data: { amount: 1000, taxAmount: 50 },
      });

      await syncAllowanceJournalEntry(allowanceId, fixture.userId);
      const got = await getEntry(documentId);
      // mirror reverses the *edited* account, not the invoice's original 6113
      expect(lineTuples(got!.lines)).toEqual([
        ["1112", 1050, 0],
        ["5404", 0, 1000],
        ["1144", 0, 50],
      ]);
    });
  });

  describe("default-account fallback (no original entry)", () => {
    it("進項折讓 with tax → 3-line draft (7044 其他收入 + 1144 + derived settlement)", async () => {
      const { allowanceId, documentId } = await seedAllowance({
        in_or_out: "in",
        original_invoice_id: null,
        extracted_data: { amount: 1000, taxAmount: 50 },
      });

      const result = await syncAllowanceJournalEntry(allowanceId, fixture.userId);
      expect(result.status).toBe("ok");

      const got = await getEntry(documentId);
      // total 1050 <= 10,000 → settlement 1111; taxAmount > 0 → separate 1144 line
      expect(lineTuples(got!.lines)).toEqual([
        ["1111", 1050, 0],
        ["7044", 0, 1000],
        ["1144", 0, 50],
      ]);
    });

    it("進項折讓 with no tax → 2-line draft (no 進項稅額 line)", async () => {
      const { allowanceId, documentId } = await seedAllowance({
        in_or_out: "in",
        original_invoice_id: null,
        extracted_data: { amount: 1000, taxAmount: 0 },
      });

      await syncAllowanceJournalEntry(allowanceId, fixture.userId);
      const got = await getEntry(documentId);
      expect(lineTuples(got!.lines)).toEqual([
        ["1111", 1000, 0],
        ["7044", 0, 1000],
      ]);
    });

    it("銷項折讓 with tax → 3-line draft (4101 營業收入 + 2134 + derived settlement)", async () => {
      const { allowanceId, documentId } = await seedAllowance({
        in_or_out: "out",
        original_invoice_id: null,
        extracted_data: { amount: 1000, taxAmount: 50 },
      });

      await syncAllowanceJournalEntry(allowanceId, fixture.userId);
      const got = await getEntry(documentId);
      expect(lineTuples(got!.lines)).toEqual([
        ["4101", 1000, 0],
        ["2134", 50, 0],
        ["1111", 0, 1050],
      ]);
    });

    it("銷項折讓 with no tax → 2-line draft (debit_credit_xor-safe, no 銷項稅額 line)", async () => {
      // Regression: a zero-tax output allowance must NOT emit a 0/0 2134 line,
      // which would violate the debit_credit_xor CHECK and abort the confirm.
      const { allowanceId, documentId } = await seedAllowance({
        in_or_out: "out",
        original_invoice_id: null,
        extracted_data: { amount: 1000, taxAmount: 0 },
      });

      const result = await syncAllowanceJournalEntry(allowanceId, fixture.userId);
      expect(result.status).toBe("ok");
      const got = await getEntry(documentId);
      expect(lineTuples(got!.lines)).toEqual([
        ["4101", 1000, 0],
        ["1111", 0, 1000],
      ]);
    });
  });

  describe("idempotency & regenerate", () => {
    it("re-syncing a confirmed invoice preserves entry id and replaces lines", async () => {
      const { invoiceId, documentId } = await seedInvoice({
        in_or_out: "in",
        extracted_data: {
          totalSales: 10000,
          tax: 500,
          totalAmount: 10500,
          account: "6113 旅費",
          deductible: true,
          taxType: "應稅",
        },
      });

      await syncInvoiceJournalEntry(invoiceId, fixture.userId);
      const first = await getEntry(documentId);
      const firstId = first!.entry.id;
      expect(first!.lines).toHaveLength(3);

      // Edit the source row, then regenerate.
      await supabase
        .from("invoices")
        .update({
          extracted_data: {
            totalSales: 8000,
            tax: 400,
            totalAmount: 8400,
            account: "6113 旅費",
            deductible: true,
            taxType: "應稅",
          } as Json,
        })
        .eq("id", invoiceId);

      await syncInvoiceJournalEntry(invoiceId, fixture.userId);
      const second = await getEntry(documentId);
      expect(second!.entry.id).toBe(firstId); // header preserved
      expect(second!.lines).toHaveLength(3); // wholesale replaced, no duplicates
      expect(lineTuples(second!.lines)).toEqual([
        ["6113", 8000, 0],
        ["1144", 400, 0],
        ["1111", 0, 8400], // 8400 <= 10,000 → settlement now 1111
      ]);
    });

    it("rejects regeneration once the entry is posted", async () => {
      const { invoiceId, documentId } = await seedInvoice({
        in_or_out: "in",
        extracted_data: {
          totalSales: 10000,
          tax: 500,
          totalAmount: 10500,
          account: "6113 旅費",
          deductible: true,
          taxType: "應稅",
        },
      });

      await syncInvoiceJournalEntry(invoiceId, fixture.userId);
      const got = await getEntry(documentId);
      // Simulate Phase 8 posting (no post RPC yet in this phase).
      await supabase
        .from("journal_entries")
        .update({ status: "posted", voucher_no: "20250601-00001" })
        .eq("id", got!.entry.id);

      await expect(
        syncInvoiceJournalEntry(invoiceId, fixture.userId),
      ).rejects.toThrow();
    });
  });

  describe("eligibility & authorization", () => {
    it.each(["作廢", "彙加"])(
      "skips ineligible taxType %s without creating an entry",
      async (taxType) => {
        const { invoiceId, documentId } = await seedInvoice({
          in_or_out: "in",
          extracted_data: {
            totalSales: 10000,
            tax: 500,
            totalAmount: 10500,
            account: "6113 旅費",
            taxType,
          },
        });

        const result = await syncInvoiceJournalEntry(invoiceId, fixture.userId);
        expect(result.status).toBe("skipped");
        expect(await getEntry(documentId)).toBeNull();
      },
    );

    it("skips 銷項 零稅率 (unsupported in v1) without creating an entry", async () => {
      const { invoiceId, documentId } = await seedInvoice({
        in_or_out: "out",
        extracted_data: {
          totalSales: 10000,
          tax: 0,
          totalAmount: 10000,
          taxType: "零稅率",
        },
      });

      const result = await syncInvoiceJournalEntry(invoiceId, fixture.userId);
      expect(result.status).toBe("skipped");
      expect(await getEntry(documentId)).toBeNull();
    });

    it("rolls back (writes nothing) when the caller is unauthorized", async () => {
      const { invoiceId, documentId } = await seedInvoice({
        in_or_out: "in",
        extracted_data: {
          totalSales: 10000,
          tax: 500,
          totalAmount: 10500,
          account: "6113 旅費",
          deductible: true,
          taxType: "應稅",
        },
      });

      await expect(
        syncInvoiceJournalEntry(invoiceId, randomUUID()),
      ).rejects.toThrow();
      expect(await getEntry(documentId)).toBeNull();
    });
  });

  // The point of the wholesale Drizzle conversion: the status flip and the entry
  // write commit (or roll back) together, driven through the real service.
  describe("atomic confirm via updateInvoice / updateAllowance", () => {
    async function invoiceStatus(id: string) {
      const { data } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", id)
        .single();
      return data?.status;
    }
    async function allowanceStatus(id: string) {
      const { data } = await supabase
        .from("allowances")
        .select("status")
        .eq("id", id)
        .single();
      return data?.status;
    }

    it("updateInvoice confirm flips status and writes the entry in one transaction", async () => {
      const { invoiceId, documentId } = await seedInvoice({
        in_or_out: "in",
        status: "processed",
        extracted_data: {
          totalSales: 10000,
          tax: 500,
          totalAmount: 10500,
          account: "6113 旅費",
          deductible: true,
          taxType: "應稅",
        },
      });

      const result = await updateInvoice(
        invoiceId,
        { status: "confirmed" },
        { userId: fixture.userId },
      );
      expect(result.success).toBe(true);
      expect(await invoiceStatus(invoiceId)).toBe("confirmed");
      const got = await getEntry(documentId);
      expect(got!.lines).toHaveLength(3);
    });

    it("rolls back the status flip when entry generation fails", async () => {
      // Input invoice missing `account` → computeEntryFromInvoice throws inside
      // the tx, so the status flip must roll back with it.
      const { invoiceId, documentId } = await seedInvoice({
        in_or_out: "in",
        status: "processed",
        extracted_data: {
          totalSales: 10000,
          tax: 500,
          totalAmount: 10500,
          deductible: true,
          taxType: "應稅",
        },
      });

      await expect(
        updateInvoice(invoiceId, { status: "confirmed" }, { userId: fixture.userId }),
      ).rejects.toThrow();

      expect(await invoiceStatus(invoiceId)).toBe("processed"); // not flipped
      expect(await getEntry(documentId)).toBeNull(); // no entry
    });

    it("returns serial_conflict and writes nothing on a duplicate serial", async () => {
      const a = await seedInvoice({
        in_or_out: "in",
        extracted_data: { totalAmount: 100, taxType: "應稅" },
      });
      const b = await seedInvoice({
        in_or_out: "in",
        status: "processed",
        extracted_data: { totalAmount: 200, taxType: "應稅" },
      });

      const result = await updateInvoice(
        b.invoiceId,
        { extracted_data: { invoiceSerialCode: a.serial } },
        { userId: fixture.userId },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("serial_conflict");
        expect(result.conflictingInvoiceId).toBe(a.invoiceId);
      }
      // b's serial was not changed — the failed update rolled back.
      const { data: bRow } = await supabase
        .from("invoices")
        .select("invoice_serial_code")
        .eq("id", b.invoiceId)
        .single();
      expect(bRow!.invoice_serial_code).toBe(b.serial);
    });

    it("updateAllowance confirm with no original entry writes a default-account draft in one transaction", async () => {
      const { allowanceId, documentId } = await seedAllowance({
        in_or_out: "in",
        status: "processed",
        original_invoice_id: null,
        extracted_data: { amount: 1000, taxAmount: 50 },
      });

      const updated = await updateAllowance(
        allowanceId,
        { status: "confirmed" },
        { userId: fixture.userId },
      );
      expect(updated.status).toBe("confirmed");
      expect(await allowanceStatus(allowanceId)).toBe("confirmed");
      const got = await getEntry(documentId);
      // total 1050 <= 10,000 → settlement 1111; default 進項折讓 account 7044
      expect(lineTuples(got!.lines)).toEqual([
        ["1111", 1050, 0],
        ["7044", 0, 1000],
        ["1144", 0, 50],
      ]);
    });
  });
});
