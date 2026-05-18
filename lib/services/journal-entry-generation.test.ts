import { describe, expect, it } from "vitest";
import type { Allowance, Invoice } from "@/lib/domain/models";
import {
  ACCT_BANK,
  ACCT_CASH,
  ACCT_INPUT_TAX,
  ACCT_OUTPUT_TAX,
  ACCT_REVENUE,
  CASH_THRESHOLD,
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

describe("computeEntryFromInvoice — 缺 extracted_data.account placeholder", () => {
  it("emits null account_code for the expense line (進項可扣抵)", () => {
    const invoice = makeInvoice({
      in_or_out: "in",
      extracted_data: {
        date: "2026/04/01",
        totalSales: 1_000,
        tax: 50,
        totalAmount: 1_050,
        deductible: true,
        // no account
      },
    });
    const { lines } = computeEntryFromInvoice(invoice);
    expect(lines[0]?.account_code).toBeNull();
    expect(lines[1]?.account_code).toBe(ACCT_INPUT_TAX);
    expect(lines[2]?.account_code).toBe(ACCT_CASH);
    expect(sumBalance(lines)).toEqual({ debit: 1_050, credit: 1_050 });
  });

  it("emits null account_code for the expense line (進項不可扣抵)", () => {
    const invoice = makeInvoice({
      in_or_out: "in",
      extracted_data: {
        totalSales: 100,
        tax: 5,
        totalAmount: 105,
        deductible: false,
      },
    });
    const { lines } = computeEntryFromInvoice(invoice);
    expect(lines[0]?.account_code).toBeNull();
    expect(lines[1]?.account_code).toBe(ACCT_CASH);
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

describe("computeEntryFromAllowance — 進項折讓", () => {
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

  const computed = computeEntryFromAllowance(allowance);

  it("emits Dr 結算 / Cr (費用待補 + 進項稅額) per §5.2", () => {
    expect(computed.voucher_type).toBe("收入");
    expect(computed.entry_date).toBe("2026-06-10");
    expect(computed.lines).toEqual([
      { account_code: ACCT_CASH, debit: 1_050, credit: 0, description: null },
      { account_code: null, debit: 0, credit: 1_000, description: null },
      { account_code: ACCT_INPUT_TAX, debit: 0, credit: 50, description: null },
    ]);
  });

  it("balances", () => {
    expect(sumBalance(computed.lines)).toEqual({ debit: 1_050, credit: 1_050 });
  });
});

describe("computeEntryFromAllowance — 銷項折讓", () => {
  const allowance = makeAllowance({
    in_or_out: "out",
    extracted_data: {
      date: "2026/07/15",
      amount: 20_000,
      taxAmount: 1_000,
      buyerName: "某客戶",
    },
  });

  const computed = computeEntryFromAllowance(allowance);

  it("emits Dr (營業收入 + 銷項稅額) / Cr 結算 per §5.2, bank settlement", () => {
    expect(computed.voucher_type).toBe("支出");
    expect(computed.lines).toEqual([
      { account_code: ACCT_REVENUE, debit: 20_000, credit: 0, description: null },
      { account_code: ACCT_OUTPUT_TAX, debit: 1_000, credit: 0, description: null },
      { account_code: ACCT_BANK, debit: 0, credit: 21_000, description: null },
    ]);
    expect(sumBalance(computed.lines)).toEqual({ debit: 21_000, credit: 21_000 });
  });
});

describe("computeEntryFromAllowance — entry_date fallback", () => {
  it("falls back to created_at when extracted date is missing", () => {
    const allowance = makeAllowance({
      created_at: new Date("2026-08-01T00:00:00Z"),
      extracted_data: {
        amount: 100,
        taxAmount: 5,
      },
    });
    expect(computeEntryFromAllowance(allowance).entry_date).toBe("2026-08-01");
  });
});
