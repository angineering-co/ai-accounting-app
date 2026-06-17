import { describe, it, expect } from "vitest";
import {
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  type EcpayCredentials,
} from "./checkmacvalue";

// 綠界公開測試帳號（「檢查碼機制」官方範例所用）。
const TEST_CREDENTIALS: EcpayCredentials = {
  hashKey: "pwFHCqoQZGmho4w6",
  hashIV: "EkRm7iFT261dpevs",
};

// 綠界官方工作範例：以下參數應產生固定的 CheckMacValue。
// 此 golden vector 已用「綠界文件值」與「獨立 Node crypto 計算」雙重交叉驗證。
const OFFICIAL_EXAMPLE_PARAMS = {
  ChoosePayment: "ALL",
  EncryptType: "1",
  ItemName: "Apple iphone 15",
  MerchantID: "3002607",
  MerchantTradeDate: "2023/03/12 15:30:23",
  MerchantTradeNo: "ecpay20230312153023",
  PaymentType: "aio",
  ReturnURL: "https://www.ecpay.com.tw/receive.php",
  TotalAmount: "30000",
  TradeDesc: "促銷方案",
} as const;

const OFFICIAL_EXAMPLE_MAC =
  "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840";

describe("ecpayUrlEncode", () => {
  it("空白編碼為 +", () => {
    expect(ecpayUrlEncode("a b")).toBe("a+b");
  });

  it("還原 .NET 不編碼的安全字元（-_.!*()）", () => {
    expect(ecpayUrlEncode("-_.!*()")).toBe("-_.!*()");
  });

  it("整串轉小寫（含英文字母）", () => {
    expect(ecpayUrlEncode("ABC")).toBe("abc");
  });

  it("中文以小寫 UTF-8 百分比編碼", () => {
    // 「促」UTF-8 = E4 BF 83
    expect(ecpayUrlEncode("促")).toBe("%e4%bf%83");
  });

  it("分隔字元維持編碼形式（= → %3d、& → %26）", () => {
    expect(ecpayUrlEncode("a=b&c")).toBe("a%3db%26c");
  });
});

describe("generateCheckMacValue", () => {
  it("符合綠界官方工作範例（golden vector）", () => {
    expect(
      generateCheckMacValue(OFFICIAL_EXAMPLE_PARAMS, TEST_CREDENTIALS),
    ).toBe(OFFICIAL_EXAMPLE_MAC);
  });

  it("與輸入鍵的順序無關（排序後結果相同）", () => {
    const shuffled = {
      TradeDesc: "促銷方案",
      MerchantID: "3002607",
      ChoosePayment: "ALL",
      TotalAmount: "30000",
      ReturnURL: "https://www.ecpay.com.tw/receive.php",
      EncryptType: "1",
      ItemName: "Apple iphone 15",
      PaymentType: "aio",
      MerchantTradeNo: "ecpay20230312153023",
      MerchantTradeDate: "2023/03/12 15:30:23",
    };
    expect(generateCheckMacValue(shuffled, TEST_CREDENTIALS)).toBe(
      OFFICIAL_EXAMPLE_MAC,
    );
  });

  it("忽略既有的 CheckMacValue 欄位", () => {
    const withMac = {
      ...OFFICIAL_EXAMPLE_PARAMS,
      CheckMacValue: "SHOULD_BE_IGNORED",
    };
    expect(generateCheckMacValue(withMac, TEST_CREDENTIALS)).toBe(
      OFFICIAL_EXAMPLE_MAC,
    );
  });

  it("數字型別參數與字串等價", () => {
    const numeric = { ...OFFICIAL_EXAMPLE_PARAMS, TotalAmount: 30000 };
    expect(generateCheckMacValue(numeric, TEST_CREDENTIALS)).toBe(
      OFFICIAL_EXAMPLE_MAC,
    );
  });
});

describe("verifyCheckMacValue", () => {
  it("正確的 CheckMacValue 回 true", () => {
    const params = {
      ...OFFICIAL_EXAMPLE_PARAMS,
      CheckMacValue: OFFICIAL_EXAMPLE_MAC,
    };
    expect(verifyCheckMacValue(params, TEST_CREDENTIALS)).toBe(true);
  });

  it("綠界回傳小寫亦可驗證（不分大小寫）", () => {
    const params = {
      ...OFFICIAL_EXAMPLE_PARAMS,
      CheckMacValue: OFFICIAL_EXAMPLE_MAC.toLowerCase(),
    };
    expect(verifyCheckMacValue(params, TEST_CREDENTIALS)).toBe(true);
  });

  it("被竄改的參數回 false", () => {
    const params = {
      ...OFFICIAL_EXAMPLE_PARAMS,
      TotalAmount: "1",
      CheckMacValue: OFFICIAL_EXAMPLE_MAC,
    };
    expect(verifyCheckMacValue(params, TEST_CREDENTIALS)).toBe(false);
  });

  it("缺少 CheckMacValue 回 false", () => {
    expect(verifyCheckMacValue(OFFICIAL_EXAMPLE_PARAMS, TEST_CREDENTIALS)).toBe(
      false,
    );
  });

  it("長度不符回 false", () => {
    const params = { ...OFFICIAL_EXAMPLE_PARAMS, CheckMacValue: "ABCD" };
    expect(verifyCheckMacValue(params, TEST_CREDENTIALS)).toBe(false);
  });
});
