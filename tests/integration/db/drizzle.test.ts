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
