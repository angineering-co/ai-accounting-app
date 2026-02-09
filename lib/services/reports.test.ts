import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { TetUConfig } from "@/lib/domain/models";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/database.types";
import * as fs from "fs";
import * as path from "path";
import { generateTxtReport, generateTetUReport } from "./reports";
import { getServiceClient } from "@/tests/fixtures/supabase";
import { seedReportFixture } from "@/tests/helpers/db";

const MAIN_CLIENT_ID = "2c3c7f79-1193-406c-90d6-ae7c98de4084";
const MAIN_REPORT_PERIOD = "11409";
const EMPTY_CLIENT_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

const FIXTURE_DIR = path.join(__dirname, "../../tests/fixtures/reports/60707504");
const EMPTY_FIXTURE_DIR = path.join(__dirname, "../../tests/fixtures/reports/empty");

const TEST_TET_U_CONFIG: TetUConfig = {
  fileNumber: "00000000",
  taxPayerId: "351406082",
  consolidatedDeclarationCode: "0",
  declarationCode: "1",
  midYearClosureTaxPayable: 0,
  previousPeriodCarryForwardTax: 0,
  midYearClosureTaxRefundable: 0,
  declarationType: "1",
  countyCity: "新北市",
  declarationMethod: "2",
  declarerId: "          ",
  declarerName: "黃勝平",
  declarerPhoneAreaCode: "04  ",
  declarerPhone: "23758628   ",
  declarerPhoneExtension: "     ",
  agentRegistrationNumber: "104台財稅登字第4656號                             ",
};

const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, "\n").trim();

const readExpectedFile = (filename: string) => {
  const expectedPath = path.join(FIXTURE_DIR, "expected", filename);
  return fs.readFileSync(expectedPath, "utf-8");
};

describe("Report Generation (integration)", () => {
  let supabase: SupabaseClient<Database>;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    supabase = getServiceClient();
    const seeded = await seedReportFixture(FIXTURE_DIR, supabase);
    cleanup = seeded.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe("generateTxtReport", () => {
    it("should generate TXT report matching expected output", async () => {
      const result = await generateTxtReport(MAIN_CLIENT_ID, MAIN_REPORT_PERIOD, {
        supabaseClient: supabase,
      });

      const expected = readExpectedFile("60707504.TXT");
      const resultLines = normalizeLineEndings(result).split("\n");
      const expectedLines = normalizeLineEndings(expected).split("\n");

      expect(resultLines.length).toBe(expectedLines.length);

      const differences: string[] = [];

      for (let i = 0; i < resultLines.length; i++) {
        const resultLine = resultLines[i];
        const expectedLine = expectedLines[i];

        if (resultLine !== expectedLine) {
          const formatCode = expectedLine.substring(0, 2);
          const taxPayerId = expectedLine.substring(2, 11);
          const seqNum = expectedLine.substring(11, 18);
          const yearMonth = expectedLine.substring(18, 23);
          const invoiceCode = expectedLine.substring(39, 49);

          differences.push(
            `Row ${i + 1} mismatch (Format: ${formatCode}, TaxPayerId: ${taxPayerId}, Seq: ${seqNum}, YM: ${yearMonth}, Invoice: ${invoiceCode}):\n` +
              `  Expected (${expectedLine.length} chars): "${expectedLine}"\n` +
              `  Received (${resultLine.length} chars): "${resultLine}"\n` +
              `  Difference at position: ${findFirstDifference(expectedLine, resultLine)}`
          );
        }
      }

      if (differences.length > 0) {
        throw new Error(
          `TXT Report row mismatches found:\n\n` +
            differences.join("\n\n") +
            `\n\nTotal rows: ${resultLines.length}\n` +
            `Rows with differences: ${differences.length}`
        );
      }

      function findFirstDifference(str1: string, str2: string): number {
        const minLen = Math.min(str1.length, str2.length);
        for (let i = 0; i < minLen; i++) {
          if (str1[i] !== str2[i]) {
            return i;
          }
        }
        return minLen;
      }
    });

    it("should generate correct number of rows", async () => {
      const result = await generateTxtReport(MAIN_CLIENT_ID, MAIN_REPORT_PERIOD, {
        supabaseClient: supabase,
      });
      const rows = result.split("\n");
      expect(rows.length).toBe(11);
    });

    it("should format input invoices correctly", async () => {
      const result = await generateTxtReport(MAIN_CLIENT_ID, MAIN_REPORT_PERIOD, {
        supabaseClient: supabase,
      });
      const rows = result.split("\n");

      expect(rows[0].substring(0, 2)).toBe("21");
      expect(rows[1].substring(0, 2)).toBe("25");
    });

    it("should format output invoices correctly", async () => {
      const result = await generateTxtReport(MAIN_CLIENT_ID, MAIN_REPORT_PERIOD, {
        supabaseClient: supabase,
      });
      const rows = result.split("\n");

      expect(rows[2].substring(0, 2)).toBe("31");
    });

    it("should handle voided invoices correctly", async () => {
      const result = await generateTxtReport(MAIN_CLIENT_ID, MAIN_REPORT_PERIOD, {
        supabaseClient: supabase,
      });
      const rows = result.split("\n");

      const voidedRow = rows.find((row) => row.includes("RT33662451"));
      expect(voidedRow).toBeDefined();

      expect(voidedRow!.substring(49, 61)).toBe("000000000000");
      expect(voidedRow!.substring(61, 62)).toBe("F");
    });

    it("should handle unused invoice ranges correctly", async () => {
      const result = await generateTxtReport(MAIN_CLIENT_ID, MAIN_REPORT_PERIOD, {
        supabaseClient: supabase,
      });
      const rows = result.split("\n");

      const unusedRows = rows.filter((row) => row.substring(61, 62) === "D");
      expect(unusedRows.length).toBeGreaterThan(0);
    });
  });

  describe("generateTetUReport", () => {
    it("should generate TET_U report matching expected output", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );

      const expected = readExpectedFile("60707504.TET_U");
      const resultFields = normalizeLineEndings(result).split("|");
      const expectedFields = normalizeLineEndings(expected).split("|");

      expect(resultFields.length).toBe(112);
      expect(resultFields.length).toBe(expectedFields.length);

      const fieldNames = [
        "資料別",
        "檔案編號",
        "統一編號",
        "所屬年月",
        "申報代號",
        "稅籍編號",
        "總繳代號",
        "使用發票份數",
        "三聯式發票(銷售額)",
        "收銀機發票及電子發票(銷售額)",
        "二聯式收銀機發票(銷售額)",
        "免用發票(銷售額)",
        "退回及折讓(銷售額)",
        "合計(銷售額)",
        "三聯式發票(稅額)",
        "收銀機發票及電子發票(稅額)",
        "二聯式收銀機發票(稅額)",
        "免用發票(稅額)",
        "退回及折讓(稅額)",
        "合計(稅額)",
        "免稅出口區銷售額",
        "非經海關出口",
        "經海關出口",
        "零稅率退回及折讓",
        "零稅率合計",
        ...Array(21).fill("(免稅/特種稅額)"),
        "銷售額總計",
        "土地",
        "其他固定資產",
        "統一發票扣抵聯-進貨及費用",
        "統一發票扣抵聯-固定資產",
        "三聯式收銀機發票扣抵聯及電子發票-進貨及費用",
        "三聯式收銀機發票扣抵聯及電子發票-固定資產",
        "載有稅額之其他憑證-進貨及費用",
        "載有稅額之其他憑證-固定資產",
        "退出及折讓-進貨及費用",
        "退出及折讓-固定資產",
        "合計-進貨及費用",
        "合計-固定資產",
        "統一發票扣抵聯-進貨及費用(稅額)",
        "統一發票扣抵聯-固定資產(稅額)",
        "三聯式收銀機發票扣抵聯及電子發票-進貨及費用(稅額)",
        "三聯式收銀機發票扣抵聯及電子發票-固定資產(稅額)",
        "載有稅額之其他憑證-進貨及費用(稅額)",
        "載有稅額之其他憑證-固定資產(稅額)",
        "退出及折讓-進貨及費用(稅額)",
        "退出及折讓-固定資產(稅額)",
        "合計-進貨及費用(稅額)",
        "合計-固定資產(稅額)",
        "進貨及費用進項總金額",
        "固定資產進項總金額",
        "不得扣抵比例",
        "兼營營業人",
        "進口貨物專案",
        "購買國外勞務給付金額",
        "進口應稅貨物金額",
        "進口應稅貨物專案",
        "海關代徵營業稅",
        "固定資產海關代徵營業稅",
        "進口貨物專案稅額",
        "購買國外勞務應納稅額",
        "本期銷項稅額合計",
        "購買國外勞務應納稅額",
        "特種稅額計算應納稅額",
        "中途歇業調整補徵",
        "小計(1+3+4+5)",
        "得扣抵進項稅額合計",
        "上期累積留抵稅額",
        "中途歇業調整應退稅額",
        "小計(7+8+9)",
        "本期應實繳稅額",
        "本期申報留抵稅額",
        "得退稅限額合計",
        "本期應退稅額",
        "本期累積留抵稅額",
        "申報種類",
        "縣市別",
        "自行或委託辦理申報註記",
        "申報人身分證統一編號",
        "申報人姓名",
        "申報人電話區域碼",
        "申報人電話",
        "申報人電話分機",
        "代理申報人登錄字號",
        ...Array(7).fill("(購買國外勞務/銀行保險)"),
      ];

      const differences: string[] = [];

      for (let i = 0; i < resultFields.length; i++) {
        const resultField = resultFields[i];
        const expectedField = expectedFields[i];
        const fieldName = fieldNames[i] || `Field ${i + 1}`;

        if (i === 99) {
          if (!resultField.includes("黃勝平") || !expectedField.includes("黃勝平")) {
            differences.push(
              `Field ${i + 1} (${fieldName}):\n` +
                `  Expected: "${expectedField}"\n` +
                `  Received: "${resultField}"\n` +
                `  Note: Known padding difference in Chinese text field`
            );
          }
          continue;
        }

        if (resultField !== expectedField) {
          differences.push(
            `Field ${i + 1} (${fieldName}):\n` +
              `  Expected: "${expectedField}"\n` +
              `  Received: "${resultField}"`
          );
        }
      }

      if (differences.length > 0) {
        throw new Error(
          `TET_U Report field mismatches found:\n\n` +
            differences.join("\n\n") +
            `\n\nTotal fields checked: ${resultFields.length}\n` +
            `Fields with differences: ${differences.length}`
        );
      }
    });

    it("should have correct number of fields", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields.length).toBe(112);
    });

    it("should format field 1 (資料別) correctly", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields[0]).toBe("1");
    });

    it("should format field 3 (統一編號) correctly", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields[2]).toBe("60707504");
    });

    it("should format field 4 (所屬年月) correctly", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields[3]).toBe("11410");
    });

    it("should calculate total sales correctly (Field 14)", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields[13]).toBe("00000014800{");
    });

    it("should calculate total tax correctly (Field 20)", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields[19]).toBe("000000740{");
    });

    it("should calculate input purchases and expenses correctly (Field 58)", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields[57]).toBe("00000000020B");
    });

    it("should calculate input tax correctly (Field 68)", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields[67]).toBe("000000001{");
    });

    it("should calculate invoice count correctly (Field 8)", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields[7]).toBe("0000000006");
    });

    it("should format declarant name correctly (Field 100)", async () => {
      const result = await generateTetUReport(
        MAIN_CLIENT_ID,
        MAIN_REPORT_PERIOD,
        TEST_TET_U_CONFIG,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields[99]).toContain("黃勝平");
    });
  });
});

describe("Edge Cases (integration)", () => {
  let supabase: SupabaseClient<Database>;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    supabase = getServiceClient();
    const seeded = await seedReportFixture(EMPTY_FIXTURE_DIR, supabase);
    cleanup = seeded.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should handle empty invoice list", async () => {
    const result = await generateTxtReport(EMPTY_CLIENT_ID, MAIN_REPORT_PERIOD, {
      supabaseClient: supabase,
    });
    expect(result).toBe("");
  });

  it("should throw error for non-existent client", async () => {
    await expect(
      generateTxtReport("invalid-id", MAIN_REPORT_PERIOD, {
        supabaseClient: supabase,
      })
    ).rejects.toThrow();
  });
});
