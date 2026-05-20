import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

describe.skipIf(!hasDbEnv)("createAllowance — documents-first", () => {
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

  it("creates a documents parent row and links the allowance to it", async () => {
    const storagePath = `${fixture.firmId}/11505/${fixture.clientId}/all.pdf`;
    const allowance = await createAllowance(
      {
        firm_id: fixture.firmId,
        client_id: fixture.clientId,
        in_or_out: "in",
        storage_path: storagePath,
        filename: "all.pdf",
      },
      { supabaseClient: supabase, userId: fixture.userId },
    );

    // External behavior unchanged.
    expect(allowance.status).toBe("uploaded");
    expect(allowance.uploaded_by).toBe(fixture.userId);
    expect(allowance.storage_path).toBe(storagePath);

    // New: the allowance is linked to a freshly created documents parent row.
    expect(allowance.document_id).toBeTruthy();

    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", allowance.document_id!)
      .single();

    if (error || !doc) {
      throw error ?? new Error("linked document row not found");
    }

    expect(doc.doc_type).toBe("allowance");
    expect(doc.type).toBe("VAT");
    expect(doc.ocr_status).toBe("pending");
    expect(doc.status).toBe("active");
    expect(doc.firm_id).toBe(fixture.firmId);
    expect(doc.client_id).toBe(fixture.clientId);
  });

  it("cleans up the orphan document when the allowance insert fails", async () => {
    const { count: before } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("client_id", fixture.clientId);

    await expect(
      createAllowance(
        {
          firm_id: fixture.firmId,
          client_id: fixture.clientId,
          in_or_out: "in",
          storage_path: `${fixture.firmId}/11505/${fixture.clientId}/bad.pdf`,
          filename: "bad.pdf",
          // Bogus FK — passes Zod (valid UUID) but fails the allowances insert,
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
