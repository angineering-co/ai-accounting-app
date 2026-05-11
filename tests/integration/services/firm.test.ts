import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { getFirmSettings, updateFirmSettings } from "@/lib/services/firm";
import {
  createTestFixture,
  cleanupTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/database.types";

describe("Firm settings service", () => {
  let supabase: SupabaseClient<Database>;
  let fixture: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    await cleanupTestFixture(supabase, fixture);
  });

  it("returns the firm row with null settings for a fresh firm", async () => {
    const firm = await getFirmSettings(fixture.firmId, {
      supabaseClient: supabase,
    });

    expect(firm.id).toBe(fixture.firmId);
    expect(firm.settings ?? null).toBeNull();
  });

  it("round-trips a partial settings update", async () => {
    await updateFirmSettings(
      fixture.firmId,
      {
        settings: {
          agent_registration_number: "AG-001",
          declarer_name: "王大明",
        },
      },
      { supabaseClient: supabase },
    );

    const firm = await getFirmSettings(fixture.firmId, {
      supabaseClient: supabase,
    });

    expect(firm.settings?.agent_registration_number).toBe("AG-001");
    expect(firm.settings?.declarer_name).toBe("王大明");
  });

  it("merges into existing settings JSONB instead of clobbering it", async () => {
    // Seed two keys
    await updateFirmSettings(
      fixture.firmId,
      {
        settings: {
          agent_registration_number: "AG-002",
          declarer_name: "李小華",
        },
      },
      { supabaseClient: supabase },
    );

    // Update only one key — the other must survive
    await updateFirmSettings(
      fixture.firmId,
      {
        settings: { declarer_phone: "0912345678" },
      },
      { supabaseClient: supabase },
    );

    const firm = await getFirmSettings(fixture.firmId, {
      supabaseClient: supabase,
    });

    expect(firm.settings?.agent_registration_number).toBe("AG-002");
    expect(firm.settings?.declarer_name).toBe("李小華");
    expect(firm.settings?.declarer_phone).toBe("0912345678");
  });

  it("updating top-level scalars does not touch settings JSONB", async () => {
    // Seed JSONB
    await updateFirmSettings(
      fixture.firmId,
      { settings: { agent_registration_number: "AG-003" } },
      { supabaseClient: supabase },
    );

    // Update only name — settings should be untouched
    const newName = "Renamed Firm " + Date.now();
    await updateFirmSettings(
      fixture.firmId,
      { name: newName },
      { supabaseClient: supabase },
    );

    const firm = await getFirmSettings(fixture.firmId, {
      supabaseClient: supabase,
    });

    expect(firm.name).toBe(newName);
    expect(firm.settings?.agent_registration_number).toBe("AG-003");
  });

  it("rejects invalid tax_id length via Zod validation", async () => {
    await expect(
      updateFirmSettings(
        fixture.firmId,
        { tax_id: "123" },
        { supabaseClient: supabase },
      ),
    ).rejects.toThrow(/資料驗證失敗/);
  });
});
