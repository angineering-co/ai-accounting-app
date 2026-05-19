import { describe, it, expect } from "vitest";
import {
  classifyAccount,
  computeBalanceSheet,
  computeIncomeStatement,
  getAccountLedger,
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
    ["1462", "asset"],
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
  // Booked (posted + reversed) entries 在 2026 全年 demo data 內:
  // entry1 (01-15, posted): 6112 +3000, 1144 +300, 1111 -3300
  // entry2 (01-20, posted): 6113 +12000, 1144 +600, 1112 -12600
  // entry3 (02-05, posted, 折讓): 1111 +1050, 6112 -1000, 1144 -50
  // entry4 (02-10, reversed): 1112 +21000, 4101 +20000, 2134 +1000
  // entry5 (02-15, posted, 反向 entry4): 4101 -20000, 2134 -1000, 1112 -21000
  // entry6 (02-28, posted, 折舊): 6124 +5000, 1462 -5000
  // 排除:draft1/2/3 (status='draft' 從未過帳)
  // entry4 + entry5 反向 pair 算術抵消 → 4101 / 2134 / 1112 from this pair 淨 0

  it("includes posted + reversed (reversal pair cancels); drafts excluded", () => {
    const demo = freshDemo();
    const is = computeIncomeStatement({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });

    // 4101 出現在 entry4 (reversed, +20000) + entry5 (posted reversal, -20000) + draft2 (排除)
    // 反向 pair 淨 0,row 不應出現
    expect(is.operatingRevenue.rows).toEqual([]);
    expect(is.operatingRevenue.subtotal).toBe(0);
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

    // 沒有 5xxx 科目活動 → cogs 為 0
    expect(is.cogs.subtotal).toBe(0);
    // 6112 (文具):entry1 +3000 + entry3 -1000 = 2000
    // 6113 (旅費):entry2 +12000
    // 6124 (折舊):entry6 +5000
    // opex 合計 = 19000
    expect(is.opex.subtotal).toBe(19000);

    expect(is.grossProfit).toBe(0 - 0); // 0
    expect(is.operatingIncome).toBe(0 - 19000); // -19000
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
    expect(is.preTaxIncome).toBe(-19000);
    expect(is.netIncome).toBe(-19000);
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

    // entry3 (02-05,折讓): 6112 -1000
    // entry4 (02-10, reversed): 4101 +20000
    // entry5 (02-15, posted 反向 entry4): 4101 -20000 → 反向 pair 淨 0
    // entry6 (02-28,折舊): 6124 +5000
    // entry1/entry2 (1 月) 被排除
    expect(is.operatingRevenue.subtotal).toBe(0);
    expect(is.cogs.subtotal).toBe(0);
    // 6112 -1000 + 6124 +5000 = 4000
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

    // Booked 累計 (entry4 reversed + entry5 反向 pair 相抵):
    // 1111: debit 1050 - credit 3300 = -2250
    // 1112: entry2 -12600 + entry4 +21000 + entry5 -21000 = -12600
    // 1144: (300+600) - 50 = 850
    // 1462: 0 - 5000 = -5000 (contra-asset,保留負數,不換邊)
    const assetByCode = Object.fromEntries(
      bs.assets.rows.map((r) => [r.accountCode, r.amount]),
    );
    expect(assetByCode).toEqual({
      "1111": -2250,
      "1112": -12600,
      "1144": 850,
      "1462": -5000,
    });

    // 2134: entry4 credit 1000 + entry5 debit 1000 → 反向 pair 淨 0,row 不應出現
    expect(bs.liabilities.rows).toEqual([]);
  });

  it("synthesizes 3440 row equal to cumulative net income; equity face is empty in demo", () => {
    const demo = freshDemo();
    const bs = computeBalanceSheet({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      asOfDate: "2026-12-31",
    });

    // 累計 net income through 2026-12-31 == -19000(demo 內所有 P&L 活動;
    // entry4/entry5 反向 pair 對 4101 / 2134 / 1112 淨 0)
    expect(bs.netIncomeToDate).toBe(-19000);
    expect(bs.equity.rows).toHaveLength(1);
    expect(bs.equity.rows[0]).toEqual({
      accountCode: "3440",
      accountName: "3440 本期損益(稅後)",
      amount: -19000,
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

    // 資產合計 = -2250 - 12600 + 850 - 5000 = -19000
    expect(bs.totalAssets).toBe(-19000);
    // 負債 0 + 權益 -19000 = -19000
    expect(bs.totalLiabilitiesAndEquity).toBe(-19000);
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

    // 所有 entry_date <= 2026-05-15 都會被收進來,所以 total 仍 -19000;
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

describe("getAccountLedger on demo fixture", () => {
  // 用 demo 內已 booked 的 entry:
  // entry1 (01-15, posted, 20260115-00001): 6112 +3000, 1144 +300, 1111 -3300
  // entry2 (01-20, posted, 20260120-00001): 6113 +12000, 1144 +600, 1112 -12600
  // entry3 (02-05, posted, 20260205-00001, 折讓): 1111 +1050, 6112 -1000, 1144 -50
  // entry4 (02-10, reversed, 20260210-00001): 1112 +21000, 4101 +20000, 2134 +1000
  // entry5 (02-15, posted, 20260215-00001, 反向 entry4): 4101 -20000, 2134 -1000, 1112 -21000
  // entry6 (02-28, posted, 20260228-00001, 折舊): 6124 +5000, 1462 -5000

  it("returns asset ledger sorted by voucher_no with closing balance matching BS", () => {
    const demo = freshDemo();
    const ledger = getAccountLedger({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      accountCode: "1111",
      asOfDate: "2026-12-31",
    });

    // 1111 出現在 entry1(credit 3300)+ entry3(debit 1050)。asset 自然方向 = debit - credit
    expect(ledger.accountCode).toBe("1111");
    expect(ledger.accountClass).toBe("asset");
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0]).toMatchObject({
      voucherNo: "20260115-00001",
      entryDate: "2026-01-15",
      status: "posted",
      debit: 0,
      credit: 3300,
      runningBalance: -3300,
    });
    expect(ledger.rows[1]).toMatchObject({
      voucherNo: "20260205-00001",
      entryDate: "2026-02-05",
      status: "posted",
      debit: 1050,
      credit: 0,
      runningBalance: -2250,
    });
    expect(ledger.closingBalance).toBe(-2250);
  });

  it("marks reversed entries with status='reversed' and reverses-pair cancels to 0", () => {
    const demo = freshDemo();
    const ledger = getAccountLedger({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      accountCode: "4101",
      asOfDate: "2026-12-31",
    });

    // operating_revenue 自然方向 = credit - debit
    // entry4 (reversed):credit 20000 → running 20000
    // entry5 (posted 反向):debit 20000 → running 0
    expect(ledger.accountClass).toBe("operating_revenue");
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows[0].status).toBe("reversed");
    expect(ledger.rows[0].voucherNo).toBe("20260210-00001");
    expect(ledger.rows[0].runningBalance).toBe(20000);
    expect(ledger.rows[1].status).toBe("posted");
    expect(ledger.rows[1].voucherNo).toBe("20260215-00001");
    expect(ledger.rows[1].runningBalance).toBe(0);
    expect(ledger.closingBalance).toBe(0);
  });

  it("walks running balance correctly across an asset with reversal pair (1112)", () => {
    const demo = freshDemo();
    const ledger = getAccountLedger({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      accountCode: "1112",
      asOfDate: "2026-12-31",
    });

    // asset (debit - credit):
    // entry2 (20260120-00001):credit 12600 → -12600
    // entry4 (20260210-00001, reversed):debit 21000 → -12600 + 21000 = 8400
    // entry5 (20260215-00001):credit 21000 → 8400 - 21000 = -12600
    expect(ledger.rows.map((r) => r.runningBalance)).toEqual([
      -12600,
      8400,
      -12600,
    ]);
    expect(ledger.closingBalance).toBe(-12600);
  });

  it("filters by asOfDate (inclusive)", () => {
    const demo = freshDemo();
    const ledger = getAccountLedger({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      accountCode: "1112",
      asOfDate: "2026-02-10",
    });

    // 只看到 entry2(01-20)+ entry4(02-10),不看到 entry5(02-15)
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows.map((r) => r.voucherNo)).toEqual([
      "20260120-00001",
      "20260210-00001",
    ]);
    expect(ledger.closingBalance).toBe(8400);
  });

  it("excludes drafts; foreign client returns empty", () => {
    const demo = freshDemo();
    const ledger = getAccountLedger({
      entries: demo.entries,
      lines: demo.lines,
      clientId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      accountCode: "1111",
      asOfDate: "2026-12-31",
    });

    expect(ledger.rows).toEqual([]);
    expect(ledger.closingBalance).toBe(0);
  });

  it("returns empty ledger with closingBalance=0 when account has no booked lines", () => {
    const demo = freshDemo();
    // 1141 沒在任何 entry 內出現過
    const ledger = getAccountLedger({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      accountCode: "1141",
      asOfDate: "2026-12-31",
    });

    expect(ledger.accountCode).toBe("1141");
    expect(ledger.rows).toEqual([]);
    expect(ledger.closingBalance).toBe(0);
  });

  it("two lines in the same entry hitting the same account get distinct lineIds and sort by line_number", () => {
    const demo = freshDemo();
    // entry1 (posted) 既有 6112 debit 3000;再塞一筆 6112 debit 500(line_number=99)
    // 以及 6112 credit 200(line_number=2)模擬同一傳票內 split 多 lines
    const extraLow = {
      id: "00000000-0000-4000-8000-cccccccccc11",
      journal_entry_id: demo.entries[0].id,
      line_number: 2,
      account_code: "6112",
      debit: 0,
      credit: 200,
      description: "split-credit",
    };
    const extraHigh = {
      id: "00000000-0000-4000-8000-cccccccccc12",
      journal_entry_id: demo.entries[0].id,
      line_number: 99,
      account_code: "6112",
      debit: 500,
      credit: 0,
      description: "split-debit",
    };
    const ledger = getAccountLedger({
      entries: demo.entries,
      lines: [...demo.lines, extraHigh, extraLow], // 故意打亂順序
      clientId: CLIENT_ID,
      accountCode: "6112",
      asOfDate: "2026-01-31",
    });

    // 同一個 voucher_no (20260115-00001) 內,line_number 升冪排序
    const entry1Rows = ledger.rows.filter(
      (r) => r.voucherNo === "20260115-00001",
    );
    expect(entry1Rows).toHaveLength(3);
    expect(entry1Rows.every((r) => r.entryId === demo.entries[0].id)).toBe(
      true,
    );
    // lineId 不重複(React key 唯一性)
    const lineIds = entry1Rows.map((r) => r.lineId);
    expect(new Set(lineIds).size).toBe(3);
    // line_number 升冪
    expect(entry1Rows.map((r) => r.debit > 0 || r.credit > 0)).toEqual([
      true,
      true,
      true,
    ]);
    // 第一筆是原始 line_number=1 (debit 3000),接著 line_number=2 (credit 200),
    // 最後 line_number=99 (debit 500)
    expect(entry1Rows[0].debit).toBe(3000);
    expect(entry1Rows[1].credit).toBe(200);
    expect(entry1Rows[2].debit).toBe(500);
  });

  it("closing balance per account matches corresponding BS row", () => {
    const demo = freshDemo();
    const bs = computeBalanceSheet({
      entries: demo.entries,
      lines: demo.lines,
      clientId: CLIENT_ID,
      asOfDate: "2026-12-31",
    });

    for (const row of [
      ...bs.assets.rows,
      ...bs.liabilities.rows,
      // 不含 equity 因為合成 3440 不對應任何實際 lines
    ]) {
      const ledger = getAccountLedger({
        entries: demo.entries,
        lines: demo.lines,
        clientId: CLIENT_ID,
        accountCode: row.accountCode,
        asOfDate: "2026-12-31",
      });
      expect(ledger.closingBalance).toBe(row.amount);
    }
  });
});
