import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/database.types";
import {
  createTestClient,
  createTestFirm,
  createTestUser,
  getServiceClient,
  signInAsTestUser,
} from "@/tests/utils/supabase";

const hasDbEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY && // getServiceClient (fixture setup)
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, // getAnonClient (portal user)
);

async function insertPostedEntry(
  service: SupabaseClient<Database>,
  firmId: string,
  clientId: string,
  voucherNo: string,
): Promise<string> {
  const { data: entry, error } = await service
    .from("journal_entries")
    .insert({
      firm_id: firmId,
      client_id: clientId,
      voucher_no: voucherNo,
      voucher_type: "收入",
      entry_date: "2024-09-01",
      status: "posted",
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: linesErr } = await service.from("journal_entry_lines").insert([
    { journal_entry_id: entry.id, line_number: 1, account_code: "1101", debit: 1000, credit: 0 },
    { journal_entry_id: entry.id, line_number: 2, account_code: "4101", debit: 0, credit: 1000 },
  ]);
  if (linesErr) throw linesErr;
  return entry.id;
}

// Verifies the client-scoped RLS added in 20260608000000: a portal user (role=client,
// bound to client A) must not be able to read another client B's general ledger, even
// within the same firm. journal_entries / journal_entry_lines RLS reads the caller's
// client_id from profiles via auth.uid(), so we exercise it as a real signed-in user.
describe.skipIf(!hasDbEnv)("journal_entries client-scoped RLS (portal isolation)", () => {
  const service = getServiceClient();
  let firmId: string;
  let clientAId: string;
  let clientBId: string;
  let portalUserId: string;
  let entryAId: string;
  let entryBId: string;
  let asPortal: SupabaseClient<Database>;

  beforeAll(async () => {
    const firm = await createTestFirm(service);
    firmId = firm.id;
    clientAId = (await createTestClient(service, firmId)).id;
    clientBId = (await createTestClient(service, firmId)).id;

    const user = await createTestUser(service);
    portalUserId = user.id;
    // Bind this user to client A as a portal user — RLS reads client_id from profiles.
    const { error: profErr } = await service
      .from("profiles")
      .update({
        firm_id: firmId,
        client_id: clientAId,
        role: "client",
        name: "Portal RLS Test",
      })
      .eq("id", portalUserId);
    if (profErr) throw profErr;

    entryAId = await insertPostedEntry(service, firmId, clientAId, "20240901-00001");
    entryBId = await insertPostedEntry(service, firmId, clientBId, "20240901-00002");

    asPortal = await signInAsTestUser(user.email);
  });

  afterAll(async () => {
    await service.from("journal_entries").delete().eq("firm_id", firmId); // lines cascade
    await service.from("clients").delete().eq("firm_id", firmId);
    await service.from("profiles").delete().eq("id", portalUserId);
    await service.from("firms").delete().eq("id", firmId);
    await service.auth.admin.deleteUser(portalUserId);
  });

  // PostgREST returns a DB/RLS error as `{ data: null, error }` rather than throwing,
  // so every query asserts `error` is null first — otherwise a "cannot read" assertion
  // could pass because the query errored, not because RLS filtered the rows.
  it("clients: portal user sees only their own client (basis of assertClientAccess)", async () => {
    const { data: b, error: errB } = await asPortal
      .from("clients")
      .select("id")
      .eq("id", clientBId)
      .maybeSingle();
    expect(errB).toBeNull();
    expect(b).toBeNull();

    const { data: a, error: errA } = await asPortal
      .from("clients")
      .select("id")
      .eq("id", clientAId)
      .maybeSingle();
    expect(errA).toBeNull();
    expect(a?.id).toBe(clientAId);
  });

  it("journal_entries: portal user cannot read a sibling client's entries", async () => {
    const { data: bRows, error: errRows } = await asPortal
      .from("journal_entries")
      .select("id")
      .eq("client_id", clientBId);
    expect(errRows).toBeNull();
    expect(bRows ?? []).toEqual([]);

    const { data: bById, error: errById } = await asPortal
      .from("journal_entries")
      .select("id")
      .eq("id", entryBId)
      .maybeSingle();
    expect(errById).toBeNull();
    expect(bById).toBeNull();
  });

  it("journal_entries: portal user can read their own client's entries", async () => {
    const { data: aRows, error: errRows } = await asPortal
      .from("journal_entries")
      .select("id")
      .eq("client_id", clientAId);
    expect(errRows).toBeNull();
    expect((aRows ?? []).map((r) => r.id)).toContain(entryAId);
  });

  it("journal_entry_lines: portal user cannot read a sibling client's lines", async () => {
    const { data: bLines, error: errLines } = await asPortal
      .from("journal_entry_lines")
      .select("id")
      .eq("journal_entry_id", entryBId);
    expect(errLines).toBeNull();
    expect(bLines ?? []).toEqual([]);
  });

  it("journal_entry_lines: portal user can read their own client's lines", async () => {
    const { data: aLines, error: errLines } = await asPortal
      .from("journal_entry_lines")
      .select("id")
      .eq("journal_entry_id", entryAId);
    expect(errLines).toBeNull();
    expect((aLines ?? []).length).toBeGreaterThan(0);
  });
});
