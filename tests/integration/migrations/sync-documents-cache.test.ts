/**
 * Tests for the `sync_documents_cache_from_invoices` /
 * `sync_documents_cache_from_allowances` triggers in
 * `supabase/migrations/20260526000000_sync_documents_cache_from_subtables.sql`.
 *
 * The triggers keep `documents.amount` / `doc_date` / `ocr_status` aligned with
 * the subtable `extracted_data` and `status`. Forward-sync only — historical
 * backfill is handled by `scripts/backfill-document-id.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createInvoice } from "@/lib/services/invoice";
import { createAllowance } from "@/lib/services/allowance";
import {
  cleanupTestFixture,
  createTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";

const hasDbEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasDbEnv)("documents cache sync — invoices", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixture: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupTestFixture(supabase, fixture);
    }
  });

  async function createUploadedInvoice() {
    return createInvoice(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: `${fixture.firmId}/11505/${fixture.clientId}/${crypto.randomUUID()}.pdf`,
        filename: "inv.pdf",
        in_or_out: "in",
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );
  }

  async function readDoc(documentId: string) {
    const { data, error } = await supabase
      .from("documents")
      .select("amount, doc_date, ocr_status, updated_at")
      .eq("id", documentId)
      .single();
    if (error || !data) throw error ?? new Error("doc not found");
    return data;
  }

  it("OCR completion writes amount / doc_date / ocr_status to documents", async () => {
    const invoice = await createUploadedInvoice();
    const docBefore = await readDoc(invoice.document_id!);
    expect(docBefore.ocr_status).toBe("pending");
    expect(docBefore.amount).toBeNull();

    const { error } = await supabase
      .from("invoices")
      .update({
        extracted_data: { date: "2026/05/20", totalAmount: 10500 },
        status: "processed",
      })
      .eq("id", invoice.id);
    expect(error).toBeNull();

    const docAfter = await readDoc(invoice.document_id!);
    expect(docAfter.amount).toBe(10500);
    expect(docAfter.doc_date).toBe("2026-05-20");
    expect(docAfter.ocr_status).toBe("done");
  });

  it("review edit propagates amount / date changes", async () => {
    const invoice = await createUploadedInvoice();
    await supabase
      .from("invoices")
      .update({
        extracted_data: { date: "2026/05/20", totalAmount: 10500 },
        status: "processed",
      })
      .eq("id", invoice.id);

    await supabase
      .from("invoices")
      .update({
        extracted_data: { date: "2026/05/21", totalAmount: 11000 },
      })
      .eq("id", invoice.id);

    const doc = await readDoc(invoice.document_id!);
    expect(doc.amount).toBe(11000);
    expect(doc.doc_date).toBe("2026-05-21");
  });

  it("status flip without extracted_data change still re-derives ocr_status", async () => {
    const invoice = await createUploadedInvoice();
    // failed first
    await supabase
      .from("invoices")
      .update({
        extracted_data: { date: "2026/05/20", totalAmount: 10500 },
        status: "failed",
      })
      .eq("id", invoice.id);
    expect((await readDoc(invoice.document_id!)).ocr_status).toBe("failed");

    // recover to processed without touching extracted_data
    await supabase
      .from("invoices")
      .update({ status: "processed" })
      .eq("id", invoice.id);
    expect((await readDoc(invoice.document_id!)).ocr_status).toBe("done");

    // staff confirm — also maps to done
    await supabase
      .from("invoices")
      .update({ status: "confirmed" })
      .eq("id", invoice.id);
    expect((await readDoc(invoice.document_id!)).ocr_status).toBe("done");
  });

  it("malformed date keeps documents.doc_date intact but still writes amount", async () => {
    const invoice = await createUploadedInvoice();
    const placeholder = (await readDoc(invoice.document_id!)).doc_date;

    await supabase
      .from("invoices")
      .update({
        extracted_data: { date: "2026/02/30", totalAmount: 7000 },
        status: "processed",
      })
      .eq("id", invoice.id);

    const doc = await readDoc(invoice.document_id!);
    expect(doc.doc_date).toBe(placeholder);
    expect(doc.amount).toBe(7000);

    // Garbage string — same outcome.
    await supabase
      .from("invoices")
      .update({
        extracted_data: { date: "not-a-date", totalAmount: 7000 },
      })
      .eq("id", invoice.id);
    expect((await readDoc(invoice.document_id!)).doc_date).toBe(placeholder);
  });

  it("clearing totalAmount sets documents.amount back to NULL", async () => {
    const invoice = await createUploadedInvoice();
    await supabase
      .from("invoices")
      .update({
        extracted_data: { date: "2026/05/20", totalAmount: 10500 },
        status: "processed",
      })
      .eq("id", invoice.id);
    expect((await readDoc(invoice.document_id!)).amount).toBe(10500);

    await supabase
      .from("invoices")
      .update({ extracted_data: { date: "2026/05/20" } })
      .eq("id", invoice.id);
    expect((await readDoc(invoice.document_id!)).amount).toBeNull();
  });

  it("invoice with document_id NULL — trigger is a no-op", async () => {
    // Simulates a Phase 6b-era bulk-import row that hasn't been linked yet.
    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: `${fixture.firmId}/orphan/${crypto.randomUUID()}.pdf`,
        filename: "orphan.pdf",
        in_or_out: "in",
        uploaded_by: fixture.userId,
        document_id: null,
        status: "uploaded",
      })
      .select("id")
      .single();
    if (error || !inv) throw error ?? new Error("insert failed");

    const { error: updErr } = await supabase
      .from("invoices")
      .update({
        extracted_data: { date: "2026/05/20", totalAmount: 5000 },
        status: "processed",
      })
      .eq("id", inv.id);
    expect(updErr).toBeNull();
  });

  it("INSERT path syncs documents on the same statement", async () => {
    // Mirrors a future Phase 6b documents-first bulk import: documents row
    // exists, then INSERT invoices with extracted_data already populated.
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        doc_date: "2020-01-01",
        type: "VAT",
        doc_type: "invoice",
        ocr_status: "pending",
        amount: null,
        created_by: fixture.userId,
      })
      .select("id")
      .single();
    if (docErr || !doc) throw docErr ?? new Error("doc insert failed");

    const { error: invErr } = await supabase
      .from("invoices")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: `${fixture.firmId}/bulk/${crypto.randomUUID()}.pdf`,
        filename: "bulk.pdf",
        in_or_out: "in",
        uploaded_by: fixture.userId,
        document_id: doc.id,
        status: "processed",
        extracted_data: { date: "2026/05/22", totalAmount: 8800 },
      });
    expect(invErr).toBeNull();

    const after = await readDoc(doc.id);
    expect(after.amount).toBe(8800);
    expect(after.doc_date).toBe("2026-05-22");
    expect(after.ocr_status).toBe("done");
  });

  it("string-typed totalAmount is treated as missing (lockstep with backfill)", async () => {
    // The extraction-worker writes Gemini's raw JSON.parse output with no
    // Zod validation. If Gemini ever returns `"totalAmount": "10500"` as a
    // string, the trigger must NOT cache it — backfill rejects strings via
    // `typeof === 'number'`, so the trigger must match.
    const invoice = await createUploadedInvoice();

    await supabase
      .from("invoices")
      .update({
        extracted_data: { date: "2026/05/20", totalAmount: "10500" },
        status: "processed",
      })
      .eq("id", invoice.id);

    expect((await readDoc(invoice.document_id!)).amount).toBeNull();
  });

  it("INSERT with NULL extracted_data leaves placeholders intact", async () => {
    // The trigger's `extracted_data IS NULL` branch only writes ocr_status.
    // The just-created documents row should still have its placeholder
    // doc_date and NULL amount.
    const invoice = await createUploadedInvoice();
    const doc = await readDoc(invoice.document_id!);
    expect(doc.ocr_status).toBe("pending");
    expect(doc.amount).toBeNull();
    // doc_date is the upload-day placeholder; just confirm it's a real date.
    expect(doc.doc_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe.skipIf(!hasDbEnv)("documents cache sync — cross-firm safety", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let firmA: TestFixture;
  let firmB: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    firmA = await createTestFixture(supabase);
    firmB = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (firmA) await cleanupTestFixture(supabase, firmA);
    if (firmB) await cleanupTestFixture(supabase, firmB);
  });

  it("SECURITY DEFINER trigger refuses to write across firm boundaries", async () => {
    // Set up: firm B has a clean documents row.
    const { data: victimDoc, error: victimErr } = await supabase
      .from("documents")
      .insert({
        firm_id: firmB.firmId,
        client_id: firmB.clientId,
        doc_date: "2024-01-01",
        type: "VAT",
        doc_type: "invoice",
        ocr_status: "pending",
        amount: null,
        created_by: firmB.userId,
      })
      .select("id, doc_date, amount, ocr_status")
      .single();
    if (victimErr || !victimDoc) throw victimErr ?? new Error("victim doc");

    // Firm A inserts an invoice (in its own firm) pointing at firm B's
    // documents row. Service role lets us emulate any path that could
    // smuggle a bad document_id past the app layer (future bulk import,
    // direct SQL, etc).
    const { data: attackerInvoice, error: invErr } = await supabase
      .from("invoices")
      .insert({
        firm_id: firmA.firmId,
        client_id: firmA.clientId,
        storage_path: `${firmA.firmId}/attack/${crypto.randomUUID()}.pdf`,
        filename: "attack.pdf",
        in_or_out: "in",
        uploaded_by: firmA.userId,
        document_id: victimDoc.id,
        status: "uploaded",
      })
      .select("id")
      .single();
    if (invErr || !attackerInvoice) throw invErr ?? new Error("attacker inv");

    // Fire the trigger with payload that, without the firm_id scope, would
    // overwrite victimDoc.amount / doc_date / ocr_status.
    const { error: updErr } = await supabase
      .from("invoices")
      .update({
        extracted_data: { date: "2099/12/31", totalAmount: 99999 },
        status: "processed",
      })
      .eq("id", attackerInvoice.id);
    expect(updErr).toBeNull();

    // Victim doc must be unchanged.
    const { data: after, error: readErr } = await supabase
      .from("documents")
      .select("doc_date, amount, ocr_status")
      .eq("id", victimDoc.id)
      .single();
    if (readErr || !after) throw readErr ?? new Error("victim re-read");

    expect(after.doc_date).toBe(victimDoc.doc_date);
    expect(after.amount).toBe(victimDoc.amount);
    expect(after.ocr_status).toBe(victimDoc.ocr_status);
  });
});

describe.skipIf(!hasDbEnv)("documents cache sync — allowances", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixture: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupTestFixture(supabase, fixture);
    }
  });

  async function createUploadedAllowance() {
    return createAllowance(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        in_or_out: "in",
        storage_path: `${fixture.firmId}/11505/${fixture.clientId}/${crypto.randomUUID()}.pdf`,
        filename: "all.pdf",
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );
  }

  async function readDoc(documentId: string) {
    const { data, error } = await supabase
      .from("documents")
      .select("amount, doc_date, ocr_status")
      .eq("id", documentId)
      .single();
    if (error || !data) throw error ?? new Error("doc not found");
    return data;
  }

  it("OCR completion writes amount = net + tax, doc_date, ocr_status", async () => {
    const allowance = await createUploadedAllowance();

    await supabase
      .from("allowances")
      .update({
        extracted_data: { date: "2026/05/22", amount: 1000, taxAmount: 50 },
        status: "processed",
      })
      .eq("id", allowance.id);

    const doc = await readDoc(allowance.document_id!);
    expect(doc.amount).toBe(1050);
    expect(doc.doc_date).toBe("2026-05-22");
    expect(doc.ocr_status).toBe("done");
  });

  it("missing taxAmount falls back to amount-only", async () => {
    const allowance = await createUploadedAllowance();

    await supabase
      .from("allowances")
      .update({
        extracted_data: { date: "2026/05/22", amount: 800 },
        status: "processed",
      })
      .eq("id", allowance.id);

    expect((await readDoc(allowance.document_id!)).amount).toBe(800);
  });

  it("both amount and taxAmount missing → documents.amount = NULL", async () => {
    const allowance = await createUploadedAllowance();

    await supabase
      .from("allowances")
      .update({
        extracted_data: { date: "2026/05/22" },
        status: "processed",
      })
      .eq("id", allowance.id);

    expect((await readDoc(allowance.document_id!)).amount).toBeNull();
  });

  it("malformed allowance date keeps placeholder; amounts still cache", async () => {
    const allowance = await createUploadedAllowance();
    const placeholder = (await readDoc(allowance.document_id!)).doc_date;

    await supabase
      .from("allowances")
      .update({
        extracted_data: { date: "2026/02/30", amount: 800, taxAmount: 40 },
        status: "processed",
      })
      .eq("id", allowance.id);

    const doc = await readDoc(allowance.document_id!);
    expect(doc.doc_date).toBe(placeholder);
    expect(doc.amount).toBe(840);
  });

  it("string-typed amount is treated as missing (lockstep with backfill)", async () => {
    const allowance = await createUploadedAllowance();

    await supabase
      .from("allowances")
      .update({
        extracted_data: { date: "2026/05/22", amount: "800", taxAmount: 40 },
        status: "processed",
      })
      .eq("id", allowance.id);

    // Backfill computes total = 0 + 40 = 40 (string amount rejected by
    // typeof check); trigger must match.
    expect((await readDoc(allowance.document_id!)).amount).toBe(40);
  });
});
