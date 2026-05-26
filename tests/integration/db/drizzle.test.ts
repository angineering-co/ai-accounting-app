import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { documents } from "@/lib/db/schema";
import {
  assertCallerCanAccessClient,
  assertCallerCanAccessFirm,
} from "@/lib/db/rls";
import {
  cleanupTestFixture,
  createTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";

const hasDbEnv = Boolean(
  process.env.DATABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasDbEnv)("Drizzle infrastructure", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixtureA: TestFixture;
  let fixtureB: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixtureA = await createTestFixture(supabase);
    fixtureB = await createTestFixture(supabase);
  });

  afterAll(async () => {
    await cleanupTestFixture(supabase, fixtureA);
    await cleanupTestFixture(supabase, fixtureB);
  });

  describe("connection", () => {
    it("postgres-js connects via DATABASE_URL with prepare:false", async () => {
      const rows = await db.execute<{ one: number }>(sql`SELECT 1 AS one`);
      // postgres-js returns row arrays directly
      expect(rows[0]?.one).toBe(1);
    });
  });

  describe("db.transaction", () => {
    it("rolls back all inserts when the transaction callback throws", async () => {
      const idA = randomUUID();
      const idB = randomUUID();

      const baseRow = {
        firm_id: fixtureA.firmId,
        client_id: fixtureA.clientId,
        doc_date: "2026-05-01",
        type: "VAT",
        doc_type: "invoice",
        created_by: fixtureA.userId,
        status: "active",
      };

      await expect(
        db.transaction(async (tx) => {
          await tx.insert(documents).values({ id: idA, ...baseRow });
          await tx.insert(documents).values({ id: idB, ...baseRow });
          throw new Error("intentional rollback");
        }),
      ).rejects.toThrow("intentional rollback");

      const found = await db
        .select({ id: documents.id })
        .from(documents)
        .where(inArray(documents.id, [idA, idB]));

      expect(found).toHaveLength(0);
    });

    it("commits inserts when the transaction callback returns normally", async () => {
      const id = randomUUID();

      await db.transaction(async (tx) => {
        await tx.insert(documents).values({
          id,
          firm_id: fixtureA.firmId,
          client_id: fixtureA.clientId,
          doc_date: "2026-05-02",
          type: "VAT",
          doc_type: "invoice",
          created_by: fixtureA.userId,
          status: "active",
        });
      });

      const found = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.id, id));

      expect(found).toHaveLength(1);
    });
  });

  describe("assertCallerCanAccessFirm", () => {
    it("passes when caller belongs to the firm", async () => {
      await db.transaction(async (tx) => {
        await assertCallerCanAccessFirm(tx, fixtureA.userId, fixtureA.firmId);
      });
    });

    it("throws when caller belongs to a different firm", async () => {
      await expect(
        db.transaction(async (tx) => {
          await assertCallerCanAccessFirm(tx, fixtureA.userId, fixtureB.firmId);
        }),
      ).rejects.toThrow(/cannot access this firm/i);
    });

    it("throws when caller profile is missing", async () => {
      const ghostUserId = randomUUID();
      await expect(
        db.transaction(async (tx) => {
          await assertCallerCanAccessFirm(tx, ghostUserId, fixtureA.firmId);
        }),
      ).rejects.toThrow(/profile not found/i);
    });
  });

  describe("assertCallerCanAccessClient", () => {
    it("passes for a firm-staff caller on a client in their firm", async () => {
      await db.transaction(async (tx) => {
        await assertCallerCanAccessClient(
          tx,
          fixtureA.userId,
          fixtureA.clientId,
        );
      });
    });

    it("throws for a firm-staff caller on a client in a different firm", async () => {
      await expect(
        db.transaction(async (tx) => {
          await assertCallerCanAccessClient(
            tx,
            fixtureA.userId,
            fixtureB.clientId,
          );
        }),
      ).rejects.toThrow(/cannot access this client/i);
    });
  });
});

// Tests that demote a profile to role='client' live in their own describe with
// their own fixture so the role mutation cannot leak into other groups.
describe.skipIf(!hasDbEnv)("Drizzle infrastructure (role=client scope)", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let clientFixture: TestFixture;
  let otherFixture: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    clientFixture = await createTestFixture(supabase);
    otherFixture = await createTestFixture(supabase);

    // Demote clientFixture's user to role=client tied to its own clientId.
    const { error } = await supabase
      .from("profiles")
      .update({ role: "client", client_id: clientFixture.clientId })
      .eq("id", clientFixture.userId);
    if (error) throw error;
  });

  afterAll(async () => {
    await cleanupTestFixture(supabase, clientFixture);
    await cleanupTestFixture(supabase, otherFixture);
  });

  it("assertCallerCanAccessClient: own client passes", async () => {
    await db.transaction(async (tx) => {
      await assertCallerCanAccessClient(
        tx,
        clientFixture.userId,
        clientFixture.clientId,
      );
    });
  });

  it("assertCallerCanAccessClient: another client throws", async () => {
    await expect(
      db.transaction(async (tx) => {
        await assertCallerCanAccessClient(
          tx,
          clientFixture.userId,
          otherFixture.clientId,
        );
      }),
    ).rejects.toThrow(/client user cannot access this client/i);
  });

  it("assertCallerCanAccessFirm: client-role caller is rejected even for their own firm", async () => {
    await expect(
      db.transaction(async (tx) => {
        await assertCallerCanAccessFirm(
          tx,
          clientFixture.userId,
          clientFixture.firmId,
        );
      }),
    ).rejects.toThrow(/client user cannot access firm-level operation/i);
  });
});

// Defense-in-depth: even if a future caller leaks nullish identifiers across
// type boundaries (un-validated Server Action input, casts), the guards must
// reject. The strict-inequality gate alone would let `null !== null` slip
// through; these tests pin the explicit !value short-circuits.
describe.skipIf(!hasDbEnv)("Drizzle infrastructure (null-bypass defense)", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let unlinkedUserId: string;
  let unlinkedClientUserId: string;

  beforeAll(async () => {
    supabase = getServiceClient();

    // A profile that exists but is not linked to any firm (firm_id NULL).
    const { data: u1, error: e1 } = await supabase.auth.admin.createUser({
      email: `test-unlinked-${randomUUID()}@example.com`,
      password: "TestPassword123!",
      email_confirm: true,
    });
    if (e1 || !u1.user) throw e1 ?? new Error("create unlinked user failed");
    unlinkedUserId = u1.user.id;

    // A client-role profile with NULL client_id (e.g., link not yet completed).
    const { data: u2, error: e2 } = await supabase.auth.admin.createUser({
      email: `test-unlinkedclient-${randomUUID()}@example.com`,
      password: "TestPassword123!",
      email_confirm: true,
    });
    if (e2 || !u2.user) throw e2 ?? new Error("create unlinkedclient user failed");
    unlinkedClientUserId = u2.user.id;
    const { error: e3 } = await supabase
      .from("profiles")
      .update({ role: "client" })
      .eq("id", unlinkedClientUserId);
    if (e3) throw e3;
  });

  afterAll(async () => {
    await supabase.from("profiles").delete().eq("id", unlinkedUserId);
    await supabase.from("profiles").delete().eq("id", unlinkedClientUserId);
    await supabase.auth.admin.deleteUser(unlinkedUserId);
    await supabase.auth.admin.deleteUser(unlinkedClientUserId);
  });

  it("assertCallerCanAccessFirm rejects unlinked profile (firm_id NULL) even with nullish firmId", async () => {
    await expect(
      db.transaction(async (tx) => {
        await assertCallerCanAccessFirm(
          tx,
          unlinkedUserId,
          null as unknown as string,
        );
      }),
    ).rejects.toThrow(/cannot access this firm/i);
  });

  it("assertCallerCanAccessClient (role=client) rejects null client_id even with nullish clientId", async () => {
    await expect(
      db.transaction(async (tx) => {
        await assertCallerCanAccessClient(
          tx,
          unlinkedClientUserId,
          null as unknown as string,
        );
      }),
    ).rejects.toThrow(/client user cannot access this client/i);
  });
});
