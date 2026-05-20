import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createInvoice, deleteInvoice } from "@/lib/services/invoice";
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

describe.skipIf(!hasDbEnv)("createInvoice — documents-first", () => {
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

  it("creates a documents parent row and links the invoice to it", async () => {
    const storagePath = `${fixture.firmId}/11505/${fixture.clientId}/inv.pdf`;
    const invoice = await createInvoice(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: storagePath,
        filename: "inv.pdf",
        in_or_out: "in",
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );

    // External behavior unchanged.
    expect(invoice.status).toBe("uploaded");
    expect(invoice.uploaded_by).toBe(fixture.userId);
    expect(invoice.filename).toBe("inv.pdf");
    expect(invoice.storage_path).toBe(storagePath);

    // New: the invoice is linked to a freshly created documents parent row.
    expect(invoice.document_id).toBeTruthy();

    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", invoice.document_id!)
      .single();

    if (error || !doc) {
      throw error ?? new Error("linked document row not found");
    }

    expect(doc.doc_type).toBe("invoice");
    expect(doc.type).toBe("VAT");
    expect(doc.ocr_status).toBe("pending");
    expect(doc.status).toBe("active");
    expect(doc.firm_id).toBe(fixture.firmId);
    expect(doc.client_id).toBe(fixture.clientId);
  });

  it("cleans up the orphan document when the invoice insert fails", async () => {
    const { count: before } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("client_id", fixture.clientId);

    await expect(
      createInvoice(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          storage_path: `${fixture.firmId}/11505/${fixture.clientId}/bad.pdf`,
          filename: "bad.pdf",
          in_or_out: "in",
          // Bogus FK — passes Zod (valid UUID) but fails the invoices insert,
          // which must trigger best-effort cleanup of the just-created document.
          tax_filing_period_id: crypto.randomUUID(),
        },
        { supabaseClient: supabase, userId: fixture.userId },
      ),
    ).rejects.toThrow();

    const { count: after } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("client_id", fixture.clientId);

    expect(after).toBe(before);
  });
});

describe.skipIf(!hasDbEnv)("deleteInvoice — documents-first", () => {
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

  it("deletes the linked documents parent row along with the invoice", async () => {
    const invoice = await createInvoice(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: `${fixture.firmId}/11505/${fixture.clientId}/del.pdf`,
        filename: "del.pdf",
        in_or_out: "in",
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );
    const documentId = invoice.document_id!;
    expect(documentId).toBeTruthy();

    await deleteInvoice(invoice.id, { supabaseClient: supabase });

    const { data: invoiceRow } = await supabase
      .from("invoices")
      .select("id")
      .eq("id", invoice.id)
      .maybeSingle();
    expect(invoiceRow).toBeNull();

    const { data: documentRow } = await supabase
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();
    expect(documentRow).toBeNull();
  });
});
