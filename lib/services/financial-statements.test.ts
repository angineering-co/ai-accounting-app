import { describe, it, expect } from "vitest";
import {
  classifyAccount,
  computeBalanceSheet,
  computeIncomeStatement,
} from "./financial-statements";
import { generateVoucherDemoData } from "@/tests/fixtures/voucher-demo-generator";

const FIRM_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";

function freshDemo() {
  return generateVoucherDemoData({ firmId: FIRM_ID, clientId: CLIENT_ID });
}

describe("classifyAccount", () => {
  it.each([
    ["1111", "asset"],
    ["1611", "asset"],
    ["2121", "liability"],
    ["3110", "equity"],
    ["3440", "equity"],
    ["4101", "operating_revenue"],
    ["5021", "cogs"],
    ["6110", "opex"],
    ["7038", "non_operating_income"],
    ["8046", "non_operating_expense"],
    ["9999", "income_tax"],
  ] as const)("classifies %s as %s", (code, expected) => {
    expect(classifyAccount(code)).toBe(expected);
  });

  it("classifies 6-digit subaccounts by first digit", () => {
    expect(classifyAccount("119901")).toBe("asset");
    expect(classifyAccount("549001")).toBe("cogs");
    expect(classifyAccount("613201")).toBe("opex");
  });

  it("throws on unknown first digit", () => {
    expect(() => classifyAccount("0123")).toThrow(/Unknown account class/);
    expect(() => classifyAccount("a999")).toThrow(/Unknown account class/);
  });
});

describe("computeIncomeStatement on demo fixture", () => {
  // Posted entries 在 2026 全年 demo data 內:
  // entry1 (01-15, posted): 6133 +3000, 6173 nope, 1147 +300, 1111 -3300
  // entry2 (01-20, posted): 5102 +12000, 1147 +600, 1112 -12600
  // entry3 (02-05, posted, 折讓): 1111 +1050, 6133 -1000, 1147 -50
  // entry5 (02-15, posted, 反向): 4101 debit 20000(等同 -20000 revenue), 2271 debit 1000, 1112 credit 21000
  // entry6 (02-28, posted, 折舊): 6173 +5000, 1611 -5000
  // 排除:entry4 (reversed), draft1/2/3

  it("includes only posted entries; drafts and reversed are excluded", () => {
    const demo = freshDemo();
    const is = computeIncomeStatement({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });

    // 4101 出現在 entry4 (reversed,排除) + entry5 (posted reversal,包含) + draft2 (排除)
    // 只 entry5 計入:debit 20000,credit 0 → operating_revenue 自然方向 = -20000
    expect(is.operatingRevenue.rows).toEqual([
      { accountCode: "4101", accountName: "4101 營業收入", amount: -20000 },
    ]);
    expect(is.operatingRevenue.subtotal).toBe(-20000);
  });

  it("computes COGS / opex / gross profit / operating income correctly", () => {
    const demo = freshDemo();
    const is = computeIncomeStatement({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });

    // 5102:entry2 debit 12000 → 12000
    expect(is.cogs.subtotal).toBe(12000);
    // 6133:entry1 debit 3000,entry3 credit 1000 → 2000
    // 6173:entry6 debit 5000 → 5000
    expect(is.opex.subtotal).toBe(7000);

    expect(is.grossProfit).toBe(-20000 - 12000); // -32000
    expect(is.operatingIncome).toBe(-32000 - 7000); // -39000
  });

  it("net income reflects revenue − cost − expense (no 7/8/9 entries in fixture)", () => {
    const demo = freshDemo();
    const is = computeIncomeStatement({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });

    expect(is.nonOperatingIncome.rows).toEqual([]);
    expect(is.nonOperatingExpense.rows).toEqual([]);
    expect(is.incomeTax.rows).toEqual([]);
    expect(is.preTaxIncome).toBe(-39000);
    expect(is.netIncome).toBe(-39000);
  });

  it("draft entries with account 9999 do NOT leak into income tax section", () => {
    const demo = freshDemo();
    const is = computeIncomeStatement({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });

    // draft3 用 9999 作占位科目;若 draft 沒被過濾,9999 會出現在 income_tax
    expect(is.incomeTax.rows).toEqual([]);
  });

  it("filters by entry_date range inclusive", () => {
    const demo = freshDemo();
    // 只取 2026-02:
    const is = computeIncomeStatement({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      fromDate: "2026-02-01",
      toDate: "2026-02-28",
    });

    // entry3 (02-05,折讓): 6133 -1000
    // entry5 (02-15,反向): 4101 -20000
    // entry6 (02-28,折舊): 6173 +5000
    // entry1/entry2 (1 月) 被排除
    expect(is.operatingRevenue.subtotal).toBe(-20000);
    expect(is.cogs.subtotal).toBe(0);
    // 6133 -1000 + 6173 +5000 = 4000
    expect(is.opex.subtotal).toBe(4000);
  });

  it("empty date range returns all-zero statement", () => {
    const demo = freshDemo();
    const is = computeIncomeStatement({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
    });

    expect(is.operatingRevenue.subtotal).toBe(0);
    expect(is.cogs.subtotal).toBe(0);
    expect(is.opex.subtotal).toBe(0);
    expect(is.netIncome).toBe(0);
    expect(is.operatingRevenue.rows).toEqual([]);
  });

  it("filters by client_id (foreign client entries don't leak)", () => {
    const demo = freshDemo();
    const is = computeIncomeStatement({
      entries: demo.entries,
      lines: demo.lines,
      clientId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });

    expect(is.netIncome).toBe(0);
    expect(is.operatingRevenue.rows).toEqual([]);
  });
});

describe("computeBalanceSheet on demo fixture", () => {
  it("classifies asset / liability / equity by first digit", () => {
    const demo = freshDemo();
    const bs = computeBalanceSheet({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      asOfDate: "2026-12-31",
    });

    // Posted 累計:
    // 1111: debit 1050 - credit 3300 = -2250
    // 1112: 0 - 12600 - 21000 = -33600
    // 1147: (300+600) - 50 = 850
    // 1611: 0 - 5000 = -5000 (contra-asset,保留負數,不換邊)
    const assetByCode = Object.fromEntries(
      bs.assets.rows.map((r) => [r.accountCode, r.amount]),
    );
    expect(assetByCode).toEqual({
      "1111": -2250,
      "1112": -33600,
      "1147": 850,
      "1611": -5000,
    });

    // 2271: credit 0 - debit 1000 = -1000 (entry5 debit,反向)
    // 註:2271 不在 ACCOUNTS 字典中,accountLabel fallback 只回 code
    expect(bs.liabilities.rows).toEqual([
      { accountCode: "2271", accountName: "2271", amount: -1000 },
    ]);
  });

  it("synthesizes 3440 row equal to cumulative net income; equity face is empty in demo", () => {
    const demo = freshDemo();
    const bs = computeBalanceSheet({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      asOfDate: "2026-12-31",
    });

    // 累計 net income through 2026-12-31 == -39000(demo 內所有 P&L 活動)
    expect(bs.netIncomeToDate).toBe(-39000);
    expect(bs.equity.rows).toHaveLength(1);
    expect(bs.equity.rows[0]).toEqual({
      accountCode: "3440",
      accountName: "3440 本期損益(稅後)",
      amount: -39000,
    });
  });

  it("totals balance: assets === liabilities + equity (with synthetic net income)", () => {
    const demo = freshDemo();
    const bs = computeBalanceSheet({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      asOfDate: "2026-12-31",
    });

    // 資產合計 = -2250 - 33600 + 850 - 5000 = -40000
    expect(bs.totalAssets).toBe(-40000);
    // 負債 -1000 + 權益 -39000 = -40000
    expect(bs.totalLiabilitiesAndEquity).toBe(-40000);
    expect(bs.imbalance).toBe(0);
    expect(bs.isBalanced).toBe(true);
  });

  it("netIncomeToDate matches IS netIncome over all-time-to-asOfDate range", () => {
    const demo = freshDemo();
    const bs = computeBalanceSheet({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      asOfDate: "2026-02-28",
    });

    const is = computeIncomeStatement({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      fromDate: "0001-01-01",
      toDate: "2026-02-28",
    });

    expect(bs.netIncomeToDate).toBe(is.netIncome);
  });

  it("empty / future asOfDate yields zero totals and balanced report", () => {
    const demo = freshDemo();
    const bs = computeBalanceSheet({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      asOfDate: "2026-05-15",
    });

    // 所有 entry_date <= 2026-05-15 都會被收進來,所以 total 仍 -40000;
    // 為了測「無資料 + 平衡」,改用未來客戶 id
    const bsEmpty = computeBalanceSheet({
      entries: demo.entries,
      lines: demo.lines,
      clientId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      asOfDate: "2026-05-15",
    });
    expect(bsEmpty.totalAssets).toBe(0);
    expect(bsEmpty.totalLiabilitiesAndEquity).toBe(0);
    expect(bsEmpty.isBalanced).toBe(true);
    expect(bsEmpty.equity.rows).toEqual([]);

    // BS 全期到 2026-05 仍應平衡(同一份 demo 資料)
    expect(bs.isBalanced).toBe(true);
  });

  it("unknown account codes still render with bare code (accountLabel fallback)", () => {
    const demo = freshDemo();
    // 構造一筆 posted entry 帶未知科目
    const customLine = {
      id: "00000000-0000-4000-8000-cccccccccc01",
      journal_entry_id: demo.entries[0].id, // entry1 posted
      line_number: 99,
      account_code: "1888", // 未在 ACCOUNTS 字典裡
      debit: 100,
      credit: 0,
      description: null,
    };
    const bs = computeBalanceSheet({
      entries: demo.entries,
      lines: [...demo.lines, customLine],
      clientId: CLIENT_ID,
      asOfDate: "2026-12-31",
    });
    const row = bs.assets.rows.find((r) => r.accountCode === "1888");
    expect(row).toBeDefined();
    expect(row?.accountName).toBe("1888"); // fallback:沒對應名稱時就顯示 code
  });

  it("hard-skips stale 3440 face balance to avoid double-counting with synthetic row", () => {
    const demo = freshDemo();
    // 在 entry1(posted) 下插一筆假的 3440 credit row(模擬將來 stale rollup)
    const staleLine = {
      id: "00000000-0000-4000-8000-cccccccccc02",
      journal_entry_id: demo.entries[0].id,
      line_number: 99,
      account_code: "3440",
      debit: 0,
      credit: 99999,
      description: null,
    };
    const bs = computeBalanceSheet({
      entries: demo.entries,
      lines: [...demo.lines, staleLine],
      clientId: CLIENT_ID,
      asOfDate: "2026-12-31",
    });

    // 3440 應只出現一次(合成 row),金額 = netIncomeToDate,不含 99999
    const rows3440 = bs.equity.rows.filter((r) => r.accountCode === "3440");
    expect(rows3440).toHaveLength(1);
    expect(rows3440[0].amount).toBe(bs.netIncomeToDate);
  });
});
