import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { backfillDocumentIds } from "@/scripts/backfill-document-id";
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

describe.skipIf(!hasDbEnv)("backfillDocumentIds", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixture: TestFixture;

  // Legacy rows under test, inserted with document_id NULL.
  let validInvoiceId: string;
  let malformedDateInvoiceId: string;
  let nullUploaderAllowanceId: string;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);

    // A legacy invoice with a well-formed extracted date and a confirmed status.
    const { data: validInvoice, error: e1 } = await supabase
      .from("invoices")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        filename: "valid.pdf",
        storage_path: `${fixture.firmId}/valid.pdf`,
        in_or_out: "in",
        status: "confirmed",
        uploaded_by: fixture.userId,
        extracted_data: { date: "2026/03/15", totalAmount: 10500 },
      })
      .select("id")
      .single();
    if (e1 || !validInvoice) throw e1 ?? new Error("insert valid invoice failed");
    validInvoiceId = validInvoice.id;

    // A legacy invoice whose extracted date is malformed — doc_date must fall
    // back to the created_at date part. created_at is pinned so it is assertable.
    const { data: malformed, error: e2 } = await supabase
      .from("invoices")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        filename: "malformed.pdf",
        storage_path: `${fixture.firmId}/malformed.pdf`,
        in_or_out: "in",
        status: "uploaded",
        uploaded_by: fixture.userId,
        created_at: "2025-01-02T08:00:00.000Z",
        extracted_data: { date: "not-a-date" },
      })
      .select("id")
      .single();
    if (e2 || !malformed) throw e2 ?? new Error("insert malformed invoice failed");
    malformedDateInvoiceId = malformed.id;

    // A legacy allowance with no uploaded_by — created_by must fall back to the
    // firm's earliest profile (the fixture user).
    const { data: allowance, error: e3 } = await supabase
      .from("allowances")
      .insert({
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        filename: "allowance.pdf",
        storage_path: `${fixture.firmId}/allowance.pdf`,
        in_or_out: "in",
        status: "confirmed",
        uploaded_by: null,
        extracted_data: { date: "2026/03/20", amount: 1000, taxAmount: 50 },
      })
      .select("id")
      .single();
    if (e3 || !allowance) throw e3 ?? new Error("insert allowance failed");
    nullUploaderAllowanceId = allowance.id;
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupTestFixture(supabase, fixture);
    }
  });

  it("creates a documents parent for every legacy invoice/allowance", async () => {
    const result = await backfillDocumentIds(supabase, { clientId: fixture.clientId });

    // The scan is global; only assert that none of our rows failed.
    const ourIds = [validInvoiceId, malformedDateInvoiceId, nullUploaderAllowanceId];
    expect(result.failures.filter((f) => ourIds.includes(f.rowId))).toEqual([]);

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, document_id")
      .in("id", [validInvoiceId, malformedDateInvoiceId]);
    for (const inv of invoices ?? []) {
      expect(inv.document_id).toBeTruthy();
    }

    const { data: allowance } = await supabase
      .from("allowances")
      .select("document_id")
      .eq("id", nullUploaderAllowanceId)
      .single();
    expect(allowance?.document_id).toBeTruthy();
  });

  it("maps document fields from the source row", async () => {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("document_id")
      .eq("id", validInvoiceId)
      .single();
    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", invoice!.document_id!)
      .single();

    expect(doc!.doc_type).toBe("invoice");
    expect(doc!.type).toBe("VAT");
    expect(doc!.status).toBe("active");
    expect(doc!.ocr_status).toBe("done"); // status 'confirmed'
    expect(doc!.doc_date).toBe("2026-03-15");
    expect(doc!.amount).toBe(10500);
    expect(doc!.file_url).toBe(`${fixture.firmId}/valid.pdf`);
    expect(doc!.created_by).toBe(fixture.userId);
  });

  it("falls back to created_at when the extracted date is malformed", async () => {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("document_id")
      .eq("id", malformedDateInvoiceId)
      .single();
    const { data: doc } = await supabase
      .from("documents")
      .select("doc_date, ocr_status")
      .eq("id", invoice!.document_id!)
      .single();

    expect(doc!.doc_date).toBe("2025-01-02"); // created_at date part
    expect(doc!.ocr_status).toBe("pending"); // status 'uploaded'
  });

  it("falls back to the firm's earliest profile when uploaded_by is null", async () => {
    const { data: allowance } = await supabase
      .from("allowances")
      .select("document_id")
      .eq("id", nullUploaderAllowanceId)
      .single();
    const { data: doc } = await supabase
      .from("documents")
      .select("doc_type, created_by, amount, doc_date")
      .eq("id", allowance!.document_id!)
      .single();

    expect(doc!.doc_type).toBe("allowance");
    expect(doc!.created_by).toBe(fixture.userId);
    expect(doc!.amount).toBe(1050); // amount 1000 + taxAmount 50
    expect(doc!.doc_date).toBe("2026-03-20");
  });

  it("is idempotent — a second run creates no duplicate documents", async () => {
    const linkedBefore = await supabase
      .from("invoices")
      .select("document_id")
      .eq("id", validInvoiceId)
      .single();

    const countBefore = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("client_id", fixture.clientId);

    await backfillDocumentIds(supabase, { clientId: fixture.clientId });

    const linkedAfter = await supabase
      .from("invoices")
      .select("document_id")
      .eq("id", validInvoiceId)
      .single();
    const countAfter = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("client_id", fixture.clientId);

    // The document is not regenerated, and no extra documents appear for this
    // client (exactly the 3 created on the first run).
    expect(linkedAfter.data?.document_id).toBe(linkedBefore.data?.document_id);
    expect(countBefore.count).toBe(3);
    expect(countAfter.count).toBe(3);
  });

  it("recovers a crashed run without creating an orphan document", async () => {
    // Simulate a crash *after* the document was created but *before* the link
    // was written back: keep the document, null out the invoice's link.
    const { data: before } = await supabase
      .from("invoices")
      .select("document_id")
      .eq("id", validInvoiceId)
      .single();
    const originalDocId = before!.document_id!;

    await supabase
      .from("invoices")
      .update({ document_id: null })
      .eq("id", validInvoiceId);

    const countBefore = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("client_id", fixture.clientId);

    await backfillDocumentIds(supabase, { clientId: fixture.clientId });

    const { data: after } = await supabase
      .from("invoices")
      .select("document_id")
      .eq("id", validInvoiceId)
      .single();
    const countAfter = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("client_id", fixture.clientId);

    // Re-linked to the SAME document — the deterministic id made the retry's
    // insert conflict on the PK instead of stranding the existing one.
    expect(after!.document_id).toBe(originalDocId);
    expect(countAfter.count).toBe(countBefore.count);
  });
});
