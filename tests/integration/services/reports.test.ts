import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { generateTxtReport, generateTetUReport } from "@/lib/services/reports";
import { getServiceClient } from "@/tests/utils/supabase";
import {
  getTestCases,
  loadTestCase,
  seedTestCase,
  readExpectedFile,
  normalizeLineEndings,
  type TestCase,
} from "@/tests/utils/report-fixtures";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/supabase/database.types";

// ============================================================================
// Test Case Discovery
// ============================================================================

const testCases = getTestCases();

// ============================================================================
// Data-Driven Tests
// ============================================================================

describe.each(testCases)("Report Generation: %s", (caseName) => {
  let supabase: SupabaseClient<Database>;
  let testCase: TestCase;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    supabase = getServiceClient();
    testCase = loadTestCase(caseName);
    const seeded = await seedTestCase(caseName, supabase);
    cleanup = seeded.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe("generateTxtReport", () => {
    it("should generate TXT report matching expected output", async () => {
      const result = await generateTxtReport(
        testCase.manifest.clientId,
        testCase.manifest.reportPeriod,
        { supabaseClient: supabase }
      );

      const expected = readExpectedFile(caseName, "TXT");
      const resultLines = normalizeLineEndings(result).split("\n");
      const expectedLines = normalizeLineEndings(expected).split("\n");

      expect(resultLines.length).toBe(expectedLines.length);

      const differences: string[] = [];

      const normalizeLine = (line: string) => {
        if (line.length < 18) return line;
        // Mask sequence number (indices 11-18) with placeholders for comparison
        return line.substring(0, 11) + "_______" + line.substring(18);
      };

      const expectedMap = new Map<string, number>();
      for (const line of expectedLines) {
        const key = normalizeLine(line);
        expectedMap.set(key, (expectedMap.get(key) || 0) + 1);
      }

      for (const line of resultLines) {
        const key = normalizeLine(line);
        const count = expectedMap.get(key);

        if (count && count > 0) {
          expectedMap.set(key, count - 1);
        } else {
          differences.push(
            `Unexpected line in result (or extra copy):\n` +
            `  Line: "${line}"\n` +
            `  Masked: "${key}"`
          );
        }
      }

      for (const [key, count] of expectedMap.entries()) {
        if (count > 0) {
          differences.push(
            `Missing expected line (x${count}):\n` +
            `  Masked Pattern: "${key}"`
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
    });

    it("should generate rows with correct format codes", async () => {
      const result = await generateTxtReport(
        testCase.manifest.clientId,
        testCase.manifest.reportPeriod,
        { supabaseClient: supabase }
      );
      const rows = result.split("\n");

      // Verify each row has a valid 2-digit format code
      for (const row of rows) {
        if (row.trim()) {
          const formatCode = row.substring(0, 2);
          expect(formatCode).toMatch(/^\d{2}$/);
        }
      }
    });
  });

  describe("generateTetUReport", () => {
    it("should generate TET_U report matching expected output", async () => {
      const result = await generateTetUReport(
        testCase.manifest.clientId,
        testCase.manifest.reportPeriod,
        testCase.manifest.tetUConfig,
        { supabaseClient: supabase }
      );

      const expected = readExpectedFile(caseName, "TET_U");
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
        testCase.manifest.clientId,
        testCase.manifest.reportPeriod,
        testCase.manifest.tetUConfig,
        { supabaseClient: supabase }
      );
      const fields = result.split("|");
      expect(fields.length).toBe(112);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  let supabase: SupabaseClient<Database>;

  beforeAll(() => {
    supabase = getServiceClient();
  });

  it("should throw error for non-existent client", async () => {
    await expect(
      generateTxtReport("invalid-id", "11409", {
        supabaseClient: supabase,
      })
    ).rejects.toThrow();
  });
});

// ============================================================================
// Helpers
// ============================================================================

function findFirstDifference(str1: string, str2: string): number {
  const minLen = Math.min(str1.length, str2.length);
  for (let i = 0; i < minLen; i++) {
    if (str1[i] !== str2[i]) {
      return i;
    }
  }
  return minLen;
}
