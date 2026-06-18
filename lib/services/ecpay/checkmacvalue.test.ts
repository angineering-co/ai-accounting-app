import { describe, it, expect } from "vitest";
import {
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  type EcpayCredentials,
} from "./checkmacvalue";

// 官方測試向量來源：~/.claude/skills/ecpay/test-vectors/（checkmacvalue.json +
// url-encode-comparison.json）。內嵌於此檔以保 CI 自足，不依賴 skill 安裝。
// 僅涵蓋 AIO 金流用的 SHA256；MD5（物流 / B2C 發票）與 ECTicket 公式不在 v1 範圍。
const TEST_CREDENTIALS: EcpayCredentials = {
  hashKey: "pwFHCqoQZGmho4w6",
  hashIV: "EkRm7iFT261dpevs",
};

const SHA256_VECTORS: ReadonlyArray<{
  name: string;
  params: Record<string, string>;
  expected: string;
}> = [
  {
    name: "AIO 金流基線",
    params: {
      MerchantID: "3002607",
      MerchantTradeNo: "Test1234567890",
      MerchantTradeDate: "2025/01/01 12:00:00",
      PaymentType: "aio",
      TotalAmount: "100",
      TradeDesc: "測試",
      ItemName: "測試商品",
      ReturnURL: "https://example.com/notify",
      ChoosePayment: "ALL",
      EncryptType: "1",
    },
    expected:
      "291CBA324D31FB5A4BBBFDF2CFE5D32598524753AFD4959C3BF590C5B2F57FB2",
  },
  {
    name: "特殊字元 '（Tom's Shop，' → %27）",
    params: { MerchantID: "3002607", ItemName: "Tom's Shop", TotalAmount: "100" },
    expected:
      "CF0A3D4901D99459D8641516EC57210700E8A5C9AB26B1D021301E9CB93EF78D",
  },
  {
    name: "特殊字元 ~（~ → %7e）",
    params: {
      MerchantID: "3002607",
      ItemName: "Test~Product",
      TotalAmount: "200",
    },
    expected:
      "CEEAE01D2F9A8E74D4AC0DCE7735B046D73F35A5EC99558A31A2EE03159DA1C9",
  },
  {
    name: "空格 → +（非 %20）",
    params: {
      MerchantID: "3002607",
      ItemName: "My Test Product",
      TotalAmount: "300",
    },
    expected:
      "7712A5E6EDC3B57086063C88568084C66CE882A21D40E74DE5ACA3B478C6F316",
  },
  {
    name: "callback 付款通知驗證",
    params: {
      MerchantID: "3002607",
      MerchantTradeNo: "Test1234567890",
      RtnCode: "1",
      RtnMsg: "Succeeded",
      TradeNo: "2301011234567890",
      TradeAmt: "100",
      PaymentDate: "2025/01/01 12:05:00",
      PaymentType: "Credit_CreditCard",
      TradeDate: "2025/01/01 12:00:00",
      SimulatePaid: "0",
    },
    expected:
      "2AB536D86AFF8E1086744D59175040A32538C96B1C28C4135B551BD728E913B8",
  },
];

// url-encode-comparison.json 的 ecpayUrlEncode 欄位。
const URL_ENCODE_CASES: ReadonlyArray<[string, string]> = [
  ["Items (Special)~Test", "items+(special)%7etest"],
  ["Tom's Shop!", "tom%27s+shop!"],
  ["price=100&item=test*2", "price%3d100%26item%3dtest*2"],
  ["file_name-v2.0", "file_name-v2.0"],
];

describe("ecpayUrlEncode", () => {
  it.each(URL_ENCODE_CASES)("官方比對表：%s", (input, expected) => {
    expect(ecpayUrlEncode(input)).toBe(expected);
  });

  it("整串轉小寫", () => {
    expect(ecpayUrlEncode("ABC")).toBe("abc");
  });

  it("分隔字元維持編碼形式（= → %3d、& → %26）", () => {
    expect(ecpayUrlEncode("a=b&c")).toBe("a%3db%26c");
  });
});

describe("generateCheckMacValue", () => {
  it.each(SHA256_VECTORS)("官方向量：$name", ({ params, expected }) => {
    expect(generateCheckMacValue(params, TEST_CREDENTIALS)).toBe(expected);
  });

  it("與輸入鍵的順序無關（排序後結果相同）", () => {
    const base = SHA256_VECTORS[0];
    const shuffled = Object.fromEntries(
      Object.entries(base.params).reverse(),
    );
    expect(generateCheckMacValue(shuffled, TEST_CREDENTIALS)).toBe(
      base.expected,
    );
  });

  it("忽略既有的 CheckMacValue 欄位", () => {
    const base = SHA256_VECTORS[0];
    const withMac = { ...base.params, CheckMacValue: "SHOULD_BE_IGNORED" };
    expect(generateCheckMacValue(withMac, TEST_CREDENTIALS)).toBe(base.expected);
  });

  it("數字型別參數與字串等價", () => {
    const numeric = {
      MerchantID: "3002607",
      ItemName: "Test~Product",
      TotalAmount: 200,
    };
    expect(generateCheckMacValue(numeric, TEST_CREDENTIALS)).toBe(
      SHA256_VECTORS[2].expected,
    );
  });
});

describe("verifyCheckMacValue", () => {
  const callback = SHA256_VECTORS[4];

  it("正確的 CheckMacValue 回 true", () => {
    const params = { ...callback.params, CheckMacValue: callback.expected };
    expect(verifyCheckMacValue(params, TEST_CREDENTIALS)).toBe(true);
  });

  it("綠界回傳小寫亦可驗證（不分大小寫）", () => {
    const params = {
      ...callback.params,
      CheckMacValue: callback.expected.toLowerCase(),
    };
    expect(verifyCheckMacValue(params, TEST_CREDENTIALS)).toBe(true);
  });

  it("被竄改的參數回 false", () => {
    const params = {
      ...callback.params,
      TradeAmt: "1",
      CheckMacValue: callback.expected,
    };
    expect(verifyCheckMacValue(params, TEST_CREDENTIALS)).toBe(false);
  });

  it("缺少 CheckMacValue 回 false", () => {
    expect(verifyCheckMacValue(callback.params, TEST_CREDENTIALS)).toBe(false);
  });

  it("長度不符回 false", () => {
    const params = { ...callback.params, CheckMacValue: "ABCD" };
    expect(verifyCheckMacValue(params, TEST_CREDENTIALS)).toBe(false);
  });
});
