import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createDocument,
  createOtherDocument,
  deleteOtherDocument,
} from "@/lib/services/document";
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

describe.skipIf(!hasDbEnv)("createDocument", () => {
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

  it("inserts an active documents row with the resolved creator", async () => {
    const documentId = await createDocument(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        doc_date: "2026-05-20",
        type: "VAT",
        doc_type: "invoice",
        file_url: `${fixture.firmId}/11505/${fixture.clientId}/doc.pdf`,
        ocr_status: "pending",
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );

    expect(documentId).toBeTruthy();

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (error || !data) {
      throw error ?? new Error("document row not found");
    }

    expect(data.firm_id).toBe(fixture.firmId);
    expect(data.client_id).toBe(fixture.clientId);
    expect(data.doc_type).toBe("invoice");
    expect(data.type).toBe("VAT");
    expect(data.status).toBe("active");
    expect(data.ocr_status).toBe("pending");
    expect(data.created_by).toBe(fixture.userId);
  });
});

describe.skipIf(!hasDbEnv)("createOtherDocument / deleteOtherDocument", () => {
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

  it("creates a childless NON_VAT 'other' document with OCR skipped", async () => {
    const documentId = await createOtherDocument(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: `${fixture.firmId}/${fixture.clientId}/other/file.pdf`,
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (error || !data) throw error ?? new Error("document row not found");

    expect(data.doc_type).toBe("other");
    expect(data.type).toBe("NON_VAT");
    expect(data.ocr_status).toBeNull();
    expect(data.status).toBe("active");
    expect(data.file_url).toBe(
      `${fixture.firmId}/${fixture.clientId}/other/file.pdf`,
    );
  });

  it("soft-deletes an 'other' document (status -> deleted)", async () => {
    const documentId = await createOtherDocument(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        storage_path: `${fixture.firmId}/${fixture.clientId}/other/del.pdf`,
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );

    await deleteOtherDocument(documentId, { supabaseClient: supabase });

    const { data, error } = await supabase
      .from("documents")
      .select("status")
      .eq("id", documentId)
      .single();

    if (error || !data) throw error ?? new Error("document row not found");
    expect(data.status).toBe("deleted");
  });

  it("refuses to delete a VAT document through the 'other' path", async () => {
    const documentId = await createDocument(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        doc_date: "2026-05-20",
        type: "VAT",
        doc_type: "invoice",
        file_url: `${fixture.firmId}/11505/${fixture.clientId}/inv.pdf`,
        ocr_status: "pending",
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );

    await expect(
      deleteOtherDocument(documentId, { supabaseClient: supabase }),
    ).rejects.toThrow(/doc_type='other'/);

    // The VAT document is untouched.
    const { data } = await supabase
      .from("documents")
      .select("status")
      .eq("id", documentId)
      .single();
    expect(data?.status).toBe("active");
  });
});
