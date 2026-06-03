import { describe, expect, it } from "vitest";
import type { Allowance, Invoice } from "@/lib/domain/models";
import {
  ACCT_BANK,
  ACCT_CASH,
  ACCT_INPUT_TAX,
  ACCT_OUTPUT_TAX,
  ACCT_REVENUE,
  CASH_THRESHOLD,
  type ComputedEntry,
  computeEntryFromAllowance,
  computeEntryFromInvoice,
  pickSettlementAccount,
} from "./journal-entry-generation";

const FIRM = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = new Date("2026-01-15T09:00:00Z");

function makeInvoice(overrides: Partial<Invoice> & {
  extracted_data?: Invoice["extracted_data"];
}): Invoice {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    firm_id: FIRM,
    client_id: CLIENT,
    storage_path: "demo/path.pdf",
    filename: "demo.pdf",
    in_or_out: "in",
    status: "processed",
    extracted_data: null,
    invoice_serial_code: null,
    year_month: null,
    tax_filing_period_id: null,
    uploaded_by: USER,
    created_at: CREATED_AT,
    ...overrides,
  };
}

function makeAllowance(overrides: Partial<Allowance> & {
  extracted_data?: Allowance["extracted_data"];
}): Allowance {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    firm_id: FIRM,
    client_id: CLIENT,
    tax_filing_period_id: null,
    allowance_serial_code: null,
    original_invoice_serial_code: null,
    original_invoice_id: null,
    in_or_out: "in",
    storage_path: "demo/path.pdf",
    filename: "demo.pdf",
    status: "processed",
    extracted_data: null,
    uploaded_by: USER,
    created_at: CREATED_AT,
    ...overrides,
  };
}

function sumBalance(lines: { debit: number; credit: number }[]) {
  const debit = lines.reduce((a, l) => a + l.debit, 0);
  const credit = lines.reduce((a, l) => a + l.credit, 0);
  return { debit, credit };
}

describe("pickSettlementAccount (§5.1)", () => {
  it("returns 現金 at threshold", () => {
    expect(pickSettlementAccount(CASH_THRESHOLD)).toBe(ACCT_CASH);
    expect(pickSettlementAccount(0)).toBe(ACCT_CASH);
  });

  it("returns 銀行存款 just above threshold", () => {
    expect(pickSettlementAccount(CASH_THRESHOLD + 1)).toBe(ACCT_BANK);
    expect(pickSettlementAccount(1_000_000)).toBe(ACCT_BANK);
  });
});

describe("computeEntryFromInvoice — §5.3 範例 A (進項可扣抵)", () => {
  // §5.3 範例 A uses "5102 旅費" but actual ACCOUNT_LIST has "6113 旅費"; same template, real code.
  const invoice = makeInvoice({
    in_or_out: "in",
    extracted_data: {
      date: "2026/01/15",
      totalSales: 10_000,
      tax: 500,
      totalAmount: 10_500,
      deductible: true,
      account: "6113 旅費",
      sellerName: "某客運股份有限公司",
    },
  });

  const computed = computeEntryFromInvoice(invoice);

  it("emits voucher_type=支出 and ISO entry_date", () => {
    expect(computed.voucher_type).toBe("支出");
    expect(computed.entry_date).toBe("2026-01-15");
  });

  it("emits 3 lines per §5.3 範例 A with bank settlement (> 10,000)", () => {
    expect(computed.lines).toEqual([
      { account_code: "6113", debit: 10_000, credit: 0, description: null },
      { account_code: ACCT_INPUT_TAX, debit: 500, credit: 0, description: null },
      { account_code: ACCT_BANK, debit: 0, credit: 10_500, description: null },
    ]);
  });

  it("balances", () => {
    expect(sumBalance(computed.lines)).toEqual({ debit: 10_500, credit: 10_500 });
  });
});

describe("computeEntryFromInvoice — §5.3 範例 B (進項不可扣抵)", () => {
  const invoice = makeInvoice({
    in_or_out: "in",
    extracted_data: {
      date: "2026/02/03",
      totalSales: 200,
      tax: 10,
      totalAmount: 210,
      deductible: false,
      account: "6120 交際費",
    },
  });

  const computed = computeEntryFromInvoice(invoice);

  it("merges tax into expense and uses cash settlement (≤ 10,000)", () => {
    expect(computed.lines).toEqual([
      { account_code: "6120", debit: 210, credit: 0, description: null },
      { account_code: ACCT_CASH, debit: 0, credit: 210, description: null },
    ]);
  });

  it("balances and has voucher_type=支出", () => {
    expect(computed.voucher_type).toBe("支出");
    expect(sumBalance(computed.lines)).toEqual({ debit: 210, credit: 210 });
  });
});

describe("computeEntryFromInvoice — 銷項", () => {
  const invoice = makeInvoice({
    in_or_out: "out",
    extracted_data: {
      date: "2026/03/10",
      totalSales: 20_000,
      tax: 1_000,
      totalAmount: 21_000,
      deductible: true,
    },
  });

  const computed = computeEntryFromInvoice(invoice);

  it("emits 3 lines per §5.2 銷項 with bank settlement", () => {
    expect(computed.voucher_type).toBe("收入");
    expect(computed.lines).toEqual([
      { account_code: ACCT_BANK, debit: 21_000, credit: 0, description: null },
      { account_code: ACCT_REVENUE, debit: 0, credit: 20_000, description: null },
      { account_code: ACCT_OUTPUT_TAX, debit: 0, credit: 1_000, description: null },
    ]);
    expect(sumBalance(computed.lines)).toEqual({ debit: 21_000, credit: 21_000 });
  });
});

describe("computeEntryFromInvoice — taxType policy matrix (§5.2.1)", () => {
  // 作廢 / 彙加 always throw regardless of direction.
  for (const taxType of ["作廢", "彙加"] as const) {
    for (const direction of ["in", "out"] as const) {
      it(`throws on ${direction} + taxType='${taxType}'`, () => {
        const invoice = makeInvoice({
          in_or_out: direction,
          extracted_data: {
            totalSales: 100,
            tax: 5,
            totalAmount: 105,
            account: "6113 旅費",
            taxType,
          },
        });
        expect(() => computeEntryFromInvoice(invoice)).toThrow(
          /must not reach entry generation/,
        );
      });
    }
  }

  // 銷項 + 零稅率/免稅 throw (not supported in v1).
  for (const taxType of ["零稅率", "免稅"] as const) {
    it(`throws on 銷項 + taxType='${taxType}'`, () => {
      const invoice = makeInvoice({
        in_or_out: "out",
        extracted_data: {
          totalSales: 10_000,
          tax: 0,
          totalAmount: 10_000,
          taxType,
        },
      });
      expect(() => computeEntryFromInvoice(invoice)).toThrow(/not supported in v1/);
    });
  }

  // 進項 + 零稅率/免稅 routes through the 2-line non-deductible path.
  for (const taxType of ["零稅率", "免稅"] as const) {
    it(`進項 + taxType='${taxType}' → 2-line entry (NON_VAT-shaped)`, () => {
      const invoice = makeInvoice({
        in_or_out: "in",
        extracted_data: {
          totalSales: 5_000,
          tax: 0,
          totalAmount: 5_000,
          account: "6113 旅費",
          taxType,
          // Even if Gemini marks deductible=true, taxType wins.
          deductible: true,
        },
      });
      const { lines } = computeEntryFromInvoice(invoice);
      expect(lines).toEqual([
        { account_code: "6113", debit: 5_000, credit: 0, description: null },
        { account_code: ACCT_CASH, debit: 0, credit: 5_000, description: null },
      ]);
    });
  }

  it("accepts taxType='應稅' explicitly", () => {
    const invoice = makeInvoice({
      in_or_out: "in",
      extracted_data: {
        totalSales: 100,
        tax: 5,
        totalAmount: 105,
        account: "6113 旅費",
        taxType: "應稅",
      },
    });
    expect(() => computeEntryFromInvoice(invoice)).not.toThrow();
  });

  it("accepts undefined taxType (OCR omitted; treated as 應稅)", () => {
    const invoice = makeInvoice({
      in_or_out: "in",
      extracted_data: {
        totalSales: 100,
        tax: 5,
        totalAmount: 105,
        account: "6113 旅費",
        // taxType omitted
      },
    });
    expect(() => computeEntryFromInvoice(invoice)).not.toThrow();
  });
});

describe("computeEntryFromInvoice — extracted_data.account precondition", () => {
  it("throws when input invoice's account is missing (precondition: must be confirmed)", () => {
    const invoice = makeInvoice({
      in_or_out: "in",
      extracted_data: {
        date: "2026/04/01",
        totalSales: 1_000,
        tax: 50,
        totalAmount: 1_050,
        deductible: true,
        // no account → caller violated precondition
      },
    });
    expect(() => computeEntryFromInvoice(invoice)).toThrow(/missing extracted_data\.account/);
  });

  it("does NOT require account for output invoices (銷項 uses fixed 4101)", () => {
    const invoice = makeInvoice({
      in_or_out: "out",
      extracted_data: {
        totalSales: 100,
        tax: 5,
        totalAmount: 105,
        // no account — fine for output
      },
    });
    expect(() => computeEntryFromInvoice(invoice)).not.toThrow();
  });

  it("defaults deductible=true when extracted_data omits it", () => {
    const invoice = makeInvoice({
      in_or_out: "in",
      extracted_data: {
        totalSales: 100,
        tax: 5,
        totalAmount: 105,
        account: "6113 旅費",
        // no deductible field
      },
    });
    const { lines } = computeEntryFromInvoice(invoice);
    // Defaults to deductible → 3 lines including 進項稅額
    expect(lines).toHaveLength(3);
    expect(lines[1]?.account_code).toBe(ACCT_INPUT_TAX);
  });
});

describe("computeEntryFromInvoice — entry_date fallback", () => {
  it("falls back to created_at when extracted date is missing", () => {
    const invoice = makeInvoice({
      created_at: new Date("2026-05-20T03:00:00Z"),
      extracted_data: {
        totalSales: 100,
        tax: 5,
        totalAmount: 105,
        account: "6113 旅費",
      },
    });
    const { entry_date } = computeEntryFromInvoice(invoice);
    expect(entry_date).toBe("2026-05-20");
  });
});

describe("computeEntryFromAllowance — 進項折讓 (mirrors deductible original)", () => {
  // Original was: Dr 6113 旅費 10,000 / Dr 1144 進項稅額 500 / Cr 1112 銀行存款 10,500
  const originalEntry = computeEntryFromInvoice(
    makeInvoice({
      in_or_out: "in",
      extracted_data: {
        date: "2026/01/15",
        totalSales: 10_000,
        tax: 500,
        totalAmount: 10_500,
        deductible: true,
        account: "6113 旅費",
      },
    }),
  );

  const allowance = makeAllowance({
    in_or_out: "in",
    extracted_data: {
      date: "2026/06/10",
      amount: 1_000,
      taxAmount: 50,
      sellerName: "某廠商",
      originalInvoiceSerialCode: "AB12345678",
    },
  });

  const computed = computeEntryFromAllowance(allowance, originalEntry);

  it("mirrors original: Dr 銀行存款 / Cr 旅費 / Cr 進項稅額 using allowance amounts", () => {
    expect(computed.voucher_type).toBe("收入");
    expect(computed.entry_date).toBe("2026-06-10");
    expect(computed.lines).toEqual([
      { account_code: ACCT_BANK, debit: 1_050, credit: 0, description: null },
      { account_code: "6113", debit: 0, credit: 1_000, description: null },
      { account_code: ACCT_INPUT_TAX, debit: 0, credit: 50, description: null },
    ]);
  });

  it("balances", () => {
    expect(sumBalance(computed.lines)).toEqual({ debit: 1_050, credit: 1_050 });
  });

  it("settlement mirrors original (bank), not §5.1 threshold on allowance amount", () => {
    // §5.1 threshold on 1,050 alone would pick 現金; mirror picks 銀行存款 because the original did.
    expect(computed.lines[0]?.account_code).toBe(ACCT_BANK);
  });
});

describe("computeEntryFromAllowance — 進項折讓 (mirrors non-deductible original)", () => {
  // Original was: Dr 6120 交際費 210 / Cr 1111 現金 210 (no separate tax line)
  const originalEntry = computeEntryFromInvoice(
    makeInvoice({
      in_or_out: "in",
      extracted_data: {
        totalSales: 200,
        tax: 10,
        totalAmount: 210,
        deductible: false,
        account: "6120 交際費",
      },
    }),
  );

  const allowance = makeAllowance({
    in_or_out: "in",
    extracted_data: { date: "2026/07/01", amount: 20, taxAmount: 1 },
  });

  const computed = computeEntryFromAllowance(allowance, originalEntry);

  it("mirrors non-deductible: 2 lines, tax merged into expense reversal", () => {
    expect(computed.voucher_type).toBe("收入");
    expect(computed.lines).toEqual([
      { account_code: ACCT_CASH, debit: 21, credit: 0, description: null },
      { account_code: "6120", debit: 0, credit: 21, description: null },
    ]);
    expect(sumBalance(computed.lines)).toEqual({ debit: 21, credit: 21 });
  });
});

describe("computeEntryFromAllowance — 進項折讓 mirrors 零稅率 進項 (2-line)", () => {
  // Original 零稅率 進項 posts as 2-line (no separate tax) per §5.2.1 policy.
  const originalEntry = computeEntryFromInvoice(
    makeInvoice({
      in_or_out: "in",
      extracted_data: {
        totalSales: 5_000,
        tax: 0,
        totalAmount: 5_000,
        taxType: "零稅率",
        account: "6113 旅費",
      },
    }),
  );

  // Sanity: original is 2-line, no tax line.
  expect(originalEntry.lines).toHaveLength(2);

  const allowance = makeAllowance({
    in_or_out: "in",
    extracted_data: { amount: 500, taxAmount: 0 },
  });

  it("mirrors 零稅率 進項 as 2-line offset (no 進項稅額 line)", () => {
    const { lines } = computeEntryFromAllowance(allowance, originalEntry);
    expect(lines).toEqual([
      { account_code: ACCT_CASH, debit: 500, credit: 0, description: null },
      { account_code: "6113", debit: 0, credit: 500, description: null },
    ]);
  });
});

describe("computeEntryFromAllowance — 進項折讓 tracks edited account", () => {
  it("uses the account from originalEntry, not from any invoice field", () => {
    // Staff manually edited original draft from 6113 → 5404 (旅費-(製))
    const originalEntry: ComputedEntry = {
      voucher_type: "支出",
      entry_date: "2026-01-15",
      description: null,
      lines: [
        { account_code: "5404", debit: 10_000, credit: 0, description: null },
        { account_code: ACCT_INPUT_TAX, debit: 500, credit: 0, description: null },
        { account_code: ACCT_BANK, debit: 0, credit: 10_500, description: null },
      ],
    };

    const allowance = makeAllowance({
      in_or_out: "in",
      extracted_data: { amount: 1_000, taxAmount: 50 },
    });

    const { lines } = computeEntryFromAllowance(allowance, originalEntry);
    expect(lines[1]?.account_code).toBe("5404"); // tracks edit, not the original 6113
  });
});

describe("computeEntryFromAllowance — 銷項折讓 (mirrors original output entry)", () => {
  // Original was: Dr 1112 銀行存款 21,000 / Cr 4101 營業收入 20,000 / Cr 2134 銷項稅額 1,000
  const originalEntry = computeEntryFromInvoice(
    makeInvoice({
      in_or_out: "out",
      extracted_data: {
        totalSales: 20_000,
        tax: 1_000,
        totalAmount: 21_000,
      },
    }),
  );

  const allowance = makeAllowance({
    in_or_out: "out",
    extracted_data: {
      date: "2026/07/15",
      amount: 2_000,
      taxAmount: 100,
      buyerName: "某客戶",
    },
  });

  const computed = computeEntryFromAllowance(allowance, originalEntry);

  it("mirrors output: Dr 4101 / Dr 2134 / Cr 銀行存款 using allowance amounts", () => {
    expect(computed.voucher_type).toBe("支出");
    expect(computed.lines).toEqual([
      { account_code: ACCT_REVENUE, debit: 2_000, credit: 0, description: null },
      { account_code: ACCT_OUTPUT_TAX, debit: 100, credit: 0, description: null },
      { account_code: ACCT_BANK, debit: 0, credit: 2_100, description: null },
    ]);
    expect(sumBalance(computed.lines)).toEqual({ debit: 2_100, credit: 2_100 });
  });
});

describe("computeEntryFromAllowance — 銷項折讓 zero-tax (no 銷項稅額 line)", () => {
  // Original taxed 銷項 (3-line) but the allowance itself carries no tax — the
  // mirror must drop the 2134 line rather than emit a 0/0 line (debit_credit_xor).
  const originalEntry = computeEntryFromInvoice(
    makeInvoice({
      in_or_out: "out",
      extracted_data: { totalSales: 20_000, tax: 1_000, totalAmount: 21_000 },
    }),
  );

  const allowance = makeAllowance({
    in_or_out: "out",
    extracted_data: { amount: 2_000, taxAmount: 0 },
  });

  it("emits 2 balanced lines (Dr 4101 / Cr 結算), no 2134", () => {
    const { lines } = computeEntryFromAllowance(allowance, originalEntry);
    expect(lines).toEqual([
      { account_code: ACCT_REVENUE, debit: 2_000, credit: 0, description: null },
      { account_code: ACCT_BANK, debit: 0, credit: 2_000, description: null },
    ]);
    expect(sumBalance(lines)).toEqual({ debit: 2_000, credit: 2_000 });
  });
});

describe("computeEntryFromAllowance — 進項折讓 zero-tax against deductible original", () => {
  // Deductible original (separate tax line) but the allowance carries no tax —
  // the mirror must drop the 1144 line rather than emit a 0/0 line.
  const originalEntry = computeEntryFromInvoice(
    makeInvoice({
      in_or_out: "in",
      extracted_data: {
        totalSales: 10_000,
        tax: 500,
        totalAmount: 10_500,
        deductible: true,
        account: "6113 旅費",
      },
    }),
  );

  const allowance = makeAllowance({
    in_or_out: "in",
    extracted_data: { amount: 1_000, taxAmount: 0 },
  });

  it("emits 2 balanced lines (Dr 結算 / Cr 費用), no 1144", () => {
    const { lines } = computeEntryFromAllowance(allowance, originalEntry);
    expect(lines).toEqual([
      { account_code: ACCT_BANK, debit: 1_000, credit: 0, description: null },
      { account_code: "6113", debit: 0, credit: 1_000, description: null },
    ]);
    expect(sumBalance(lines)).toEqual({ debit: 1_000, credit: 1_000 });
  });
});

describe("computeEntryFromAllowance — malformed original entry", () => {
  it("throws when input original has wrong number of Cr lines", () => {
    const malformed: ComputedEntry = {
      voucher_type: "支出",
      entry_date: "2026-01-15",
      description: null,
      lines: [
        { account_code: "6113", debit: 1_000, credit: 0, description: null },
      ], // missing Cr settlement
    };
    expect(() =>
      computeEntryFromAllowance(
        makeAllowance({ in_or_out: "in", extracted_data: { amount: 100, taxAmount: 5 } }),
        malformed,
      ),
    ).toThrow(/exactly 1 Cr/);
  });

  it("throws when output original has wrong number of Dr lines", () => {
    const malformed: ComputedEntry = {
      voucher_type: "收入",
      entry_date: "2026-01-15",
      description: null,
      lines: [
        { account_code: ACCT_REVENUE, debit: 0, credit: 1_000, description: null },
      ],
    };
    expect(() =>
      computeEntryFromAllowance(
        makeAllowance({ in_or_out: "out", extracted_data: { amount: 100, taxAmount: 5 } }),
        malformed,
      ),
    ).toThrow(/exactly 1 Dr/);
  });
});

describe("computeEntryFromAllowance — entry_date fallback", () => {
  it("falls back to created_at when extracted date is missing", () => {
    const originalEntry = computeEntryFromInvoice(
      makeInvoice({
        in_or_out: "in",
        extracted_data: {
          totalSales: 100,
          tax: 5,
          totalAmount: 105,
          account: "6113 旅費",
        },
      }),
    );
    const allowance = makeAllowance({
      created_at: new Date("2026-08-01T00:00:00Z"),
      extracted_data: { amount: 100, taxAmount: 5 },
    });
    expect(computeEntryFromAllowance(allowance, originalEntry).entry_date).toBe("2026-08-01");
  });
});
