import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createInvoice } from "@/lib/services/invoice";
import { createOtherDocument } from "@/lib/services/document";
import {
  switchInOrOut,
  convertDocType,
  demoteToOther,
  promoteFromOther,
} from "@/lib/services/document";
import {
  cleanupTestFixture,
  createTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";

const hasDbEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    // These actions write through Drizzle, which needs DATABASE_URL.
    process.env.DATABASE_URL,
);

describe.skipIf(!hasDbEnv)("document re-classification actions", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixture: TestFixture;
  let opts: { supabaseClient: typeof supabase; userId: string };

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
    opts = { supabaseClient: supabase, userId: fixture.userId };
  });

  afterAll(async () => {
    if (fixture) {
      // Re-classification leaves children across both subtables; cleanup's
      // FK-ordered teardown by client_id handles whichever survive.
      await cleanupTestFixture(supabase, fixture);
    }
  });

  async function makePeriod(yearMonth: string): Promise<string> {
    const { data, error } = await supabase
      .from("tax_filing_periods")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        year_month: yearMonth,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("period insert failed");
    return data.id;
  }

  function path(name: string): string {
    return `${fixture.firmId}/${fixture.clientId}/other/${name}`;
  }

  describe("promoteFromOther", () => {
    it("turns an 'other' document into an invoice under the chosen period", async () => {
      const periodId = await makePeriod("11503");
      const documentId = await createOtherDocument(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("promote-inv.pdf"),
          filename: "誤丟的發票.pdf",
        },
        opts,
      );

      await promoteFromOther(
        documentId,
        { docType: "invoice", inOrOut: "in", taxFilingPeriodId: periodId },
        opts,
      );

      const { data: doc } = await supabase
        .from("documents")
        .select("doc_type, type, ocr_status, filename")
        .eq("id", documentId)
        .single();
      expect(doc?.doc_type).toBe("invoice");
      expect(doc?.type).toBe("VAT");
      expect(doc?.ocr_status).toBe("pending");
      // Subtable now owns the filename; parent copy is cleared.
      expect(doc?.filename).toBeNull();

      const { data: inv } = await supabase
        .from("invoices")
        .select("*")
        .eq("document_id", documentId)
        .single();
      expect(inv?.in_or_out).toBe("in");
      // Eligible for the period's「AI 提取」action.
      expect(inv?.status).toBe("uploaded");
      expect(inv?.storage_path).toBe(path("promote-inv.pdf"));
      expect(inv?.filename).toBe("誤丟的發票.pdf");
      expect(inv?.tax_filing_period_id).toBe(periodId);
      expect(inv?.year_month).toBe("11503");
    });

    it("promotes to an allowance with the chosen direction", async () => {
      const periodId = await makePeriod("11505");
      const documentId = await createOtherDocument(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("promote-allw.pdf"),
          filename: "折讓.pdf",
        },
        opts,
      );

      await promoteFromOther(
        documentId,
        { docType: "allowance", inOrOut: "out", taxFilingPeriodId: periodId },
        opts,
      );

      const { data: doc } = await supabase
        .from("documents")
        .select("doc_type, type")
        .eq("id", documentId)
        .single();
      expect(doc?.doc_type).toBe("allowance");
      expect(doc?.type).toBe("VAT");

      const { data: allw } = await supabase
        .from("allowances")
        .select("in_or_out, status, tax_filing_period_id")
        .eq("document_id", documentId)
        .single();
      expect(allw?.in_or_out).toBe("out");
      expect(allw?.status).toBe("uploaded");
      expect(allw?.tax_filing_period_id).toBe(periodId);
    });

    it("rejects a period that belongs to another client", async () => {
      const documentId = await createOtherDocument(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("bad-period.pdf"),
          filename: "x.pdf",
        },
        opts,
      );

      await expect(
        promoteFromOther(
          documentId,
          {
            docType: "invoice",
            inOrOut: "in",
            taxFilingPeriodId: crypto.randomUUID(),
          },
          opts,
        ),
      ).rejects.toThrow();

      // Untouched — still 'other'.
      const { data: doc } = await supabase
        .from("documents")
        .select("doc_type")
        .eq("id", documentId)
        .single();
      expect(doc?.doc_type).toBe("other");
    });
  });

  describe("convertDocType", () => {
    it("converts an invoice into an allowance, swapping the subtable", async () => {
      const invoice = await createInvoice(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("conv.pdf"),
          filename: "conv.pdf",
          in_or_out: "in",
        },
        opts,
      );

      await convertDocType(
        invoice.document_id!,
        { docType: "allowance", inOrOut: "in" },
        opts,
      );

      // Original invoice subtable is gone.
      const { data: invRow } = await supabase
        .from("invoices")
        .select("id")
        .eq("id", invoice.id)
        .maybeSingle();
      expect(invRow).toBeNull();

      // A fresh allowance hangs off the same document, ready to extract.
      const { data: allw } = await supabase
        .from("allowances")
        .select("status, in_or_out")
        .eq("document_id", invoice.document_id!)
        .single();
      expect(allw?.status).toBe("uploaded");
      expect(allw?.in_or_out).toBe("in");

      const { data: doc } = await supabase
        .from("documents")
        .select("doc_type, ocr_status")
        .eq("id", invoice.document_id!)
        .single();
      expect(doc?.doc_type).toBe("allowance");
      expect(doc?.ocr_status).toBe("pending");
    });

    it("refuses to convert to the same type", async () => {
      const invoice = await createInvoice(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("same.pdf"),
          filename: "same.pdf",
          in_or_out: "in",
        },
        opts,
      );

      await expect(
        convertDocType(invoice.document_id!, { docType: "invoice", inOrOut: "in" }, opts),
      ).rejects.toThrow();
    });
  });

  describe("demoteToOther", () => {
    it("drops the subtable and makes the document childless 'other'", async () => {
      const invoice = await createInvoice(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("demote.pdf"),
          filename: "收據.pdf",
          in_or_out: "in",
        },
        opts,
      );

      await demoteToOther(invoice.document_id!, opts);

      const { data: invRow } = await supabase
        .from("invoices")
        .select("id")
        .eq("id", invoice.id)
        .maybeSingle();
      expect(invRow).toBeNull();

      const { data: doc } = await supabase
        .from("documents")
        .select("doc_type, type, ocr_status, filename")
        .eq("id", invoice.document_id!)
        .single();
      expect(doc?.doc_type).toBe("other");
      expect(doc?.type).toBe("NON_VAT");
      expect(doc?.ocr_status).toBeNull();
      // Subtable filename is preserved onto the parent (now the source of truth).
      expect(doc?.filename).toBe("收據.pdf");
    });
  });

  describe("switchInOrOut", () => {
    it("flips direction and leaves an un-extracted doc queued as-is", async () => {
      const invoice = await createInvoice(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("switch-fresh.pdf"),
          filename: "switch.pdf",
          in_or_out: "in",
        },
        opts,
      );

      await switchInOrOut(invoice.document_id!, "out", opts);

      const { data: inv } = await supabase
        .from("invoices")
        .select("in_or_out, status")
        .eq("id", invoice.id)
        .single();
      expect(inv?.in_or_out).toBe("out");
      // Never extracted, so nothing to redo — still queued.
      expect(inv?.status).toBe("uploaded");
    });

    it("resets an already-extracted invoice to 'uploaded' for re-extraction", async () => {
      const invoice = await createInvoice(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("switch-done.pdf"),
          filename: "switch2.pdf",
          in_or_out: "in",
        },
        opts,
      );
      // Simulate a completed extraction.
      await supabase
        .from("invoices")
        .update({ status: "processed", extracted_data: { totalAmount: 100 } })
        .eq("id", invoice.id);

      await switchInOrOut(invoice.document_id!, "out", opts);

      const { data: inv } = await supabase
        .from("invoices")
        .select("in_or_out, status")
        .eq("id", invoice.id)
        .single();
      expect(inv?.in_or_out).toBe("out");
      // Stale result is dropped back to the queue.
      expect(inv?.status).toBe("uploaded");

      const { data: doc } = await supabase
        .from("documents")
        .select("ocr_status")
        .eq("id", invoice.document_id!)
        .single();
      expect(doc?.ocr_status).toBe("pending");
    });

    it("is idempotent — switching to the current value is a no-op", async () => {
      const invoice = await createInvoice(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("switch-same.pdf"),
          filename: "switch3.pdf",
          in_or_out: "in",
        },
        opts,
      );
      await supabase
        .from("invoices")
        .update({ status: "processed", extracted_data: { totalAmount: 50 } })
        .eq("id", invoice.id);

      await switchInOrOut(invoice.document_id!, "in", opts);

      const { data: inv } = await supabase
        .from("invoices")
        .select("in_or_out, status")
        .eq("id", invoice.id)
        .single();
      expect(inv?.in_or_out).toBe("in");
      // No re-extract triggered, so the 'processed' status stands.
      expect(inv?.status).toBe("processed");
    });
  });

  describe("downstream-commitment guard", () => {
    it("blocks demote when the subtable is confirmed", async () => {
      const invoice = await createInvoice(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("confirmed.pdf"),
          filename: "c.pdf",
          in_or_out: "in",
        },
        opts,
      );
      await supabase
        .from("invoices")
        .update({ status: "confirmed" })
        .eq("id", invoice.id);

      await expect(demoteToOther(invoice.document_id!, opts)).rejects.toThrow();

      // Still an invoice — untouched.
      const { data: doc } = await supabase
        .from("documents")
        .select("doc_type")
        .eq("id", invoice.document_id!)
        .single();
      expect(doc?.doc_type).toBe("invoice");
    });

    it("blocks convert when a journal entry exists for the document", async () => {
      const invoice = await createInvoice(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: path("with-entry.pdf"),
          filename: "e.pdf",
          in_or_out: "in",
        },
        opts,
      );
      const { error: entryErr } = await supabase.from("journal_entries").insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        document_id: invoice.document_id!,
        voucher_type: "支出",
        entry_date: "2026-05-20",
        status: "draft",
      });
      if (entryErr) throw entryErr;

      await expect(
        convertDocType(invoice.document_id!, { docType: "allowance", inOrOut: "in" }, opts),
      ).rejects.toThrow();

      const { data: invRow } = await supabase
        .from("invoices")
        .select("id")
        .eq("id", invoice.id)
        .maybeSingle();
      expect(invRow).not.toBeNull();
    });
  });
});
