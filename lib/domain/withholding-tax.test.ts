import { describe, it, expect } from "vitest";
import {
  calculateLabor,
  calculateRent,
  getProfessions,
  type LaborInput,
} from "./withholding-tax";

// Helper to create a default labor input
function labor(overrides: Partial<LaborInput> = {}): LaborInput {
  return {
    nationality: "domestic",
    healthInsuranceExempt: false,
    incomeCategory: "9A",
    professionCode: "92", // 程式設計師, 20%
    amount: 0,
    isNetAmount: false,
    ...overrides,
  };
}

describe("calculateLabor", () => {
  it("gross 60,000 domestic → tax 6,000 / health 1,266 / net 52,734", () => {
    const r = calculateLabor(labor({ amount: 60_000 }));
    expect(r.grossAmount).toBe(60_000);
    expect(r.withholdingTax).toBe(6_000);
    expect(r.healthInsurance).toBe(1_266);
    expect(r.netAmount).toBe(52_734);
    expect(r.expenseRate).toBe(0.2);
  });

  it("gross 20,001 domestic → tax 2,000 / health 422 / net 17,579", () => {
    const r = calculateLabor(labor({ amount: 20_001 }));
    expect(r.withholdingTax).toBe(2_000);
    expect(r.healthInsurance).toBe(422);
    expect(r.netAmount).toBe(17_579);
  });

  it("gross 20,000 domestic → no withholding, health 422", () => {
    const r = calculateLabor(labor({ amount: 20_000 }));
    expect(r.withholdingTax).toBe(0);
    expect(r.healthInsurance).toBe(422);
    expect(r.netAmount).toBe(19_578);
  });

  it("gross 19,999 domestic → no withholding, no health", () => {
    const r = calculateLabor(labor({ amount: 19_999 }));
    expect(r.withholdingTax).toBe(0);
    expect(r.healthInsurance).toBe(0);
    expect(r.netAmount).toBe(19_999);
  });

  it("gross 0 → all zero", () => {
    const r = calculateLabor(labor({ amount: 0 }));
    expect(r.grossAmount).toBe(0);
    expect(r.withholdingTax).toBe(0);
    expect(r.healthInsurance).toBe(0);
    expect(r.netAmount).toBe(0);
  });

  it("non-resident → 20% flat, no threshold", () => {
    const r = calculateLabor(
      labor({ nationality: "foreign_non_resident", amount: 10_000 }),
    );
    expect(r.withholdingTax).toBe(2_000);
    expect(r.withholdingRate).toBe(0.2);
    // health insurance still applies at >= 20,000; 10,000 < 20,000
    expect(r.healthInsurance).toBe(0);
    expect(r.netAmount).toBe(8_000);
  });

  it("non-resident 60,000 → 20% tax + health", () => {
    const r = calculateLabor(
      labor({ nationality: "foreign_non_resident", amount: 60_000 }),
    );
    expect(r.withholdingTax).toBe(12_000);
    expect(r.healthInsurance).toBe(1_266);
    expect(r.netAmount).toBe(46_734);
  });

  it("foreign resident → same rules as domestic", () => {
    const r = calculateLabor(
      labor({ nationality: "foreign_resident", amount: 60_000 }),
    );
    expect(r.withholdingTax).toBe(6_000);
    expect(r.healthInsurance).toBe(1_266);
    expect(r.netAmount).toBe(52_734);
  });

  it("health insurance exempt → no health deduction", () => {
    const r = calculateLabor(
      labor({ amount: 60_000, healthInsuranceExempt: true }),
    );
    expect(r.withholdingTax).toBe(6_000);
    expect(r.healthInsurance).toBe(0);
    expect(r.netAmount).toBe(54_000);
  });

  it("reverse: net 52,734 → produces correct net", () => {
    const r = calculateLabor(labor({ amount: 52_734, isNetAmount: true }));
    expect(r.netAmount).toBe(52_734);
    // Gross should be in the right ballpark (multiple gross values can map to same net due to floor rounding)
    expect(r.grossAmount).toBeGreaterThan(52_734);
    expect(r.withholdingTax).toBeGreaterThan(0);
  });

  it("reverse: net 19,999 (below threshold) → gross = net", () => {
    const r = calculateLabor(labor({ amount: 19_999, isNetAmount: true }));
    expect(r.grossAmount).toBe(19_999);
    expect(r.withholdingTax).toBe(0);
    expect(r.healthInsurance).toBe(0);
  });

  it("reverse: net roundtrips correctly for various amounts", () => {
    for (const gross of [25_000, 30_000, 40_000, 50_000, 60_000, 75_000, 100_000]) {
      const fwd = calculateLabor(labor({ amount: gross }));
      const rev = calculateLabor(labor({ amount: fwd.netAmount, isNetAmount: true }));
      // The key property: reverse-calculated result produces the same net
      expect(rev.netAmount).toBe(fwd.netAmount);
      // Reverse gross should be <= original (lowest valid gross)
      expect(rev.grossAmount).toBeLessThanOrEqual(gross);
    }
  });

  it("9B income category uses correct professions", () => {
    const profs = getProfessions("9B");
    expect(profs).toHaveLength(2);
    expect(profs[0].expenseRate).toBe(0.3);
    expect(profs[1].expenseRate).toBe(0.75);
  });

  it("92 income category → 0% expense rate", () => {
    const r = calculateLabor(
      labor({ incomeCategory: "92", professionCode: "00", amount: 30_000 }),
    );
    expect(r.expenseRate).toBe(0);
    expect(r.withholdingTax).toBe(3_000);
  });
});

describe("calculateRent", () => {
  it("含稅 individual 50,000 → 10% tax + 2.11% health, payout is less", () => {
    const r = calculateRent({
      landlordType: "individual",
      amount: 50_000,
      isTaxInclusive: true,
    });
    expect(r.grossRent).toBe(50_000);
    expect(r.withholdingTax).toBe(5_000);
    expect(r.healthInsurance).toBe(1_055);
    expect(r.netAmount).toBe(43_945);
  });

  it("含稅 individual <= 20,000 → no withholding", () => {
    const r = calculateRent({
      landlordType: "individual",
      amount: 15_000,
      isTaxInclusive: true,
    });
    expect(r.withholdingTax).toBe(0);
    expect(r.healthInsurance).toBe(0);
    expect(r.netAmount).toBe(15_000);
  });

  it("company → zero deductions", () => {
    const r = calculateRent({
      landlordType: "company",
      amount: 100_000,
      isTaxInclusive: false,
    });
    expect(r.withholdingTax).toBe(0);
    expect(r.healthInsurance).toBe(0);
    expect(r.netAmount).toBe(100_000);
  });

  it("未含稅 (default): amount is desired net → reverse calc gross", () => {
    const r = calculateRent({
      landlordType: "individual",
      amount: 43_945,
      isTaxInclusive: false,
    });
    // Landlord wants to receive 43,945 → gross must be higher
    expect(r.netAmount).toBe(43_945);
    expect(r.grossRent).toBeGreaterThan(43_945);
    expect(r.withholdingTax).toBeGreaterThan(0);
  });
});
