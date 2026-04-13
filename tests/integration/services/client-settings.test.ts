import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  cleanupTestFixture,
  createTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";
import {
  updateClientSettingsSchema,
  responsiblePersonSchema,
  shareholderSchema,
  landlordSchema,
  invoicePurchasingSchema,
  platformCredentialsSchema,
} from "@/lib/domain/models";

// ── Schema validation (unit tests) ──────────────────────────────────

describe("client settings schemas", () => {
  describe("responsiblePersonSchema", () => {
    it("accepts valid data", () => {
      const result = responsiblePersonSchema.safeParse({
        name: "王大明",
        national_id: "A123456789",
        address: "台北市中正區",
        capital_contribution: 1000000,
      });
      expect(result.success).toBe(true);
    });

    it("requires name", () => {
      const result = responsiblePersonSchema.safeParse({
        name: "",
        national_id: "A123456789",
      });
      expect(result.success).toBe(false);
    });

    it("validates national_id format", () => {
      const invalid = [
        "a123456789", // lowercase
        "AB12345678", // two letters
        "A12345678",  // 8 digits
        "A1234567890", // 10 digits
        "1234567890", // no letter
      ];
      for (const id of invalid) {
        const result = responsiblePersonSchema.safeParse({
          name: "Test",
          national_id: id,
        });
        expect(result.success, `expected "${id}" to fail`).toBe(false);
      }
    });

    it("allows empty national_id", () => {
      const result = responsiblePersonSchema.safeParse({
        name: "Test",
        national_id: "",
      });
      expect(result.success).toBe(true);
    });

    it("rejects decimal capital_contribution", () => {
      const result = responsiblePersonSchema.safeParse({
        name: "Test",
        capital_contribution: 100.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("shareholderSchema", () => {
    it("has same validation as responsiblePersonSchema", () => {
      const valid = shareholderSchema.safeParse({
        name: "李小華",
        national_id: "B987654321",
        capital_contribution: 500000,
      });
      expect(valid.success).toBe(true);

      const invalidId = shareholderSchema.safeParse({
        name: "Test",
        national_id: "invalid",
      });
      expect(invalidId.success).toBe(false);
    });
  });

  describe("landlordSchema", () => {
    it("accepts company type", () => {
      const result = landlordSchema.safeParse({
        type: "company",
        rent_amount: 30000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts individual type", () => {
      const result = landlordSchema.safeParse({
        type: "individual",
        rent_amount: 15000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid type", () => {
      const result = landlordSchema.safeParse({
        type: "other",
        rent_amount: 10000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects decimal rent_amount", () => {
      const result = landlordSchema.safeParse({
        type: "company",
        rent_amount: 30000.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("invoicePurchasingSchema", () => {
    it("accepts valid config", () => {
      const result = invoicePurchasingSchema.safeParse({
        enabled: true,
        two_part_manual: 2,
        three_part_manual: 1,
        two_part_register: 0,
        three_part_register: 0,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative quantities", () => {
      const result = invoicePurchasingSchema.safeParse({
        enabled: true,
        two_part_manual: -1,
        three_part_manual: 0,
        two_part_register: 0,
        three_part_register: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects decimal quantities", () => {
      const result = invoicePurchasingSchema.safeParse({
        enabled: true,
        two_part_manual: 1.5,
        three_part_manual: 0,
        two_part_register: 0,
        three_part_register: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("platformCredentialsSchema", () => {
    it("accepts all optional fields", () => {
      const result = platformCredentialsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts partial credentials", () => {
      const result = platformCredentialsSchema.safeParse({
        einvoice_username: "user@example.com",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("updateClientSettingsSchema", () => {
    it("accepts partial updates", () => {
      const result = updateClientSettingsSchema.safeParse({
        address: "台北市信義區",
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty object", () => {
      const result = updateClientSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("validates email format", () => {
      const result = updateClientSettingsSchema.safeParse({
        email: "not-an-email",
      });
      expect(result.success).toBe(false);
    });

    it("allows empty email string", () => {
      const result = updateClientSettingsSchema.safeParse({
        email: "",
      });
      expect(result.success).toBe(true);
    });

    it("validates nested schemas", () => {
      const result = updateClientSettingsSchema.safeParse({
        responsible_person: { name: "" }, // name required
      });
      expect(result.success).toBe(false);
    });
  });
});

// ── Integration tests (require local Supabase) ─────────────────────

const hasDbEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasDbEnv)("client settings DB operations", () => {
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

  it("updates basic contact fields", async () => {
    const { error } = await supabase
      .from("clients")
      .update({
        address: "台北市中正區忠孝東路一段1號",
        phone: "02-2345-6789",
        email: "test@example.com",
      })
      .eq("id", fixture.clientId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from("clients")
      .select("address, phone, email")
      .eq("id", fixture.clientId)
      .single();

    expect(data).toEqual({
      address: "台北市中正區忠孝東路一段1號",
      phone: "02-2345-6789",
      email: "test@example.com",
    });
  });

  it("stores and retrieves responsible_person JSONB", async () => {
    const responsiblePerson = {
      name: "王大明",
      national_id: "A123456789",
      address: "台北市大安區",
      capital_contribution: 5000000,
    };

    const { error } = await supabase
      .from("clients")
      .update({ responsible_person: responsiblePerson })
      .eq("id", fixture.clientId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from("clients")
      .select("responsible_person")
      .eq("id", fixture.clientId)
      .single();

    expect(data?.responsible_person).toEqual(responsiblePerson);
  });

  it("stores and retrieves shareholders JSONB array", async () => {
    const shareholders = [
      { name: "李小華", national_id: "B987654321", address: "新北市板橋區", capital_contribution: 3000000 },
      { name: "張美玲", national_id: "C246813579", address: "台中市西屯區", capital_contribution: 2000000 },
    ];

    const { error } = await supabase
      .from("clients")
      .update({ shareholders })
      .eq("id", fixture.clientId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from("clients")
      .select("shareholders")
      .eq("id", fixture.clientId)
      .single();

    expect(data?.shareholders).toEqual(shareholders);
  });

  it("stores and retrieves platform_credentials JSONB", async () => {
    const credentials = {
      einvoice_username: "user@einvoice.nat.gov.tw",
      einvoice_password: "secret123",
      tax_filing_password: "filing456",
    };

    const { error } = await supabase
      .from("clients")
      .update({ platform_credentials: credentials })
      .eq("id", fixture.clientId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from("clients")
      .select("platform_credentials")
      .eq("id", fixture.clientId)
      .single();

    expect(data?.platform_credentials).toEqual(credentials);
  });

  it("stores and retrieves landlord JSONB", async () => {
    const landlord = { type: "individual", rent_amount: 25000 };

    const { error } = await supabase
      .from("clients")
      .update({ landlord })
      .eq("id", fixture.clientId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from("clients")
      .select("landlord")
      .eq("id", fixture.clientId)
      .single();

    expect(data?.landlord).toEqual(landlord);
  });

  it("stores and retrieves invoice_purchasing JSONB", async () => {
    const invoicePurchasing = {
      enabled: true,
      two_part_manual: 3,
      three_part_manual: 1,
      two_part_register: 0,
      three_part_register: 0,
    };

    const { error } = await supabase
      .from("clients")
      .update({ invoice_purchasing: invoicePurchasing })
      .eq("id", fixture.clientId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from("clients")
      .select("invoice_purchasing")
      .eq("id", fixture.clientId)
      .single();

    expect(data?.invoice_purchasing).toEqual(invoicePurchasing);
  });

  it("handles partial updates without overwriting other fields", async () => {
    // Set initial values
    await supabase
      .from("clients")
      .update({
        address: "初始地址",
        phone: "02-1111-1111",
        landlord: { type: "company", rent_amount: 50000 },
      })
      .eq("id", fixture.clientId);

    // Update only phone
    const { error } = await supabase
      .from("clients")
      .update({ phone: "02-2222-2222" })
      .eq("id", fixture.clientId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from("clients")
      .select("address, phone, landlord")
      .eq("id", fixture.clientId)
      .single();

    expect(data?.phone).toBe("02-2222-2222");
    expect(data?.address).toBe("初始地址");
    expect(data?.landlord).toEqual({ type: "company", rent_amount: 50000 });
  });

  it("can set JSONB fields to null", async () => {
    // Set a value first
    await supabase
      .from("clients")
      .update({ landlord: { type: "individual", rent_amount: 10000 } })
      .eq("id", fixture.clientId);

    // Clear it
    const { error } = await supabase
      .from("clients")
      .update({ landlord: null })
      .eq("id", fixture.clientId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from("clients")
      .select("landlord")
      .eq("id", fixture.clientId)
      .single();

    expect(data?.landlord).toBeNull();
  });

  it("reads all settings fields via select *", async () => {
    // Set all fields
    await supabase
      .from("clients")
      .update({
        address: "完整測試地址",
        phone: "02-9999-9999",
        email: "full@test.com",
        responsible_person: { name: "測試負責人" },
        shareholders: [{ name: "測試股東" }],
        platform_credentials: { einvoice_username: "test" },
        landlord: { type: "company", rent_amount: 40000 },
        invoice_purchasing: { enabled: false, two_part_manual: 0, three_part_manual: 0, two_part_register: 0, three_part_register: 0 },
      })
      .eq("id", fixture.clientId);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", fixture.clientId)
      .single();

    expect(error).toBeNull();
    expect(data?.address).toBe("完整測試地址");
    expect(data?.phone).toBe("02-9999-9999");
    expect(data?.email).toBe("full@test.com");
    expect(data?.responsible_person).toEqual({ name: "測試負責人" });
    expect(data?.shareholders).toEqual([{ name: "測試股東" }]);
    expect(data?.platform_credentials).toEqual({ einvoice_username: "test" });
    expect(data?.landlord).toEqual({ type: "company", rent_amount: 40000 });
    expect(data?.invoice_purchasing).toEqual({
      enabled: false,
      two_part_manual: 0,
      three_part_manual: 0,
      two_part_register: 0,
      three_part_register: 0,
    });
  });
});
