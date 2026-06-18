import { describe, it, expect } from "vitest";
import { generateMerchantTradeNo } from "./merchant-trade-no";

describe("generateMerchantTradeNo", () => {
  it("長度為 20、僅含英數、以 SB 前綴開頭", () => {
    for (let i = 0; i < 200; i++) {
      const mtn = generateMerchantTradeNo();
      expect(mtn).toHaveLength(20);
      expect(mtn.length).toBeLessThanOrEqual(20); // 綠界硬上限
      expect(mtn).toMatch(/^[A-Za-z0-9]+$/);
      expect(mtn.startsWith("SB")).toBe(true);
    }
  });

  it("大量產生不重複", () => {
    const set = new Set(
      Array.from({ length: 2000 }, () => generateMerchantTradeNo()),
    );
    expect(set.size).toBe(2000);
  });
});
