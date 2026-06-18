import { describe, it, expect } from "vitest";
import { generateCheckMacValue, type EcpayCredentials } from "./checkmacvalue";
import { parseAioReturn, ecpayPaymentDateToISO } from "./callback";

const CREDS: EcpayCredentials = {
  hashKey: "pwFHCqoQZGmho4w6",
  hashIV: "EkRm7iFT261dpevs",
};

/** 以測試金鑰簽出一組合法 callback 參數（含正確 CheckMacValue）。 */
function signedReturn(
  fields: Record<string, string>,
): Record<string, string> {
  const params = { ...fields };
  params.CheckMacValue = generateCheckMacValue(params, CREDS);
  return params;
}

const SUCCESS_FIELDS = {
  MerchantID: "3002607",
  MerchantTradeNo: "SB0123456789",
  RtnCode: "1",
  RtnMsg: "交易成功",
  TradeNo: "2401011234567890",
  TradeAmt: "16380",
  PaymentDate: "2026/03/05 12:00:05",
  PaymentType: "Credit_CreditCard",
  Gwsr: "1234567890",
  Card4No: "2222",
  CustomField1: "27858c54-8b28-4108-bc36-e08619613146",
};

describe("ecpayPaymentDateToISO", () => {
  it("台灣時間字串轉 ISO8601 帶 +08:00", () => {
    expect(ecpayPaymentDateToISO("2026/03/05 12:00:05")).toBe(
      "2026-03-05T12:00:05+08:00",
    );
  });

  it("格式不符或空值回 null", () => {
    expect(ecpayPaymentDateToISO("")).toBeNull();
    expect(ecpayPaymentDateToISO(undefined)).toBeNull();
    expect(ecpayPaymentDateToISO("2026-03-05 12:00:05")).toBeNull();
  });
});

describe("parseAioReturn", () => {
  it("合法成功回呼：valid 與 success 皆為 true，欄位正確", () => {
    const result = parseAioReturn(signedReturn(SUCCESS_FIELDS), CREDS);
    expect(result.valid).toBe(true);
    expect(result.success).toBe(true);
    expect(result.checkoutToken).toBe("27858c54-8b28-4108-bc36-e08619613146");
    expect(result.merchantTradeNo).toBe("SB0123456789");
    expect(result.tradeNo).toBe("2401011234567890");
    expect(result.gwsr).toBe(1234567890);
    expect(result.card4no).toBe("2222");
    expect(result.paidAt).toBe("2026-03-05T12:00:05+08:00");
    expect(result.simulatePaid).toBe(false);
  });

  it("RtnCode 非 '1' → success 為 false（但 valid 仍可為 true）", () => {
    const result = parseAioReturn(
      signedReturn({ ...SUCCESS_FIELDS, RtnCode: "10100058", RtnMsg: "付款失敗" }),
      CREDS,
    );
    expect(result.valid).toBe(true);
    expect(result.success).toBe(false);
    expect(result.rtnCode).toBe("10100058");
    expect(result.rtnMsg).toBe("付款失敗");
  });

  it("CheckMacValue 遭竄改 → valid 為 false", () => {
    const params = signedReturn(SUCCESS_FIELDS);
    params.TradeAmt = "1"; // 竄改金額但不重算檢查碼
    expect(parseAioReturn(params, CREDS).valid).toBe(false);
  });

  it("缺 CheckMacValue → valid 為 false", () => {
    const result = parseAioReturn({ ...SUCCESS_FIELDS }, CREDS);
    expect(result.valid).toBe(false);
  });

  it("gwsr 可解析 10 位數（超出 int4 範圍）", () => {
    const result = parseAioReturn(
      signedReturn({ ...SUCCESS_FIELDS, Gwsr: "9999999999" }),
      CREDS,
    );
    expect(result.gwsr).toBe(9999999999);
  });

  it("Gwsr 非數字或缺漏 → null", () => {
    const result = parseAioReturn(
      signedReturn({ ...SUCCESS_FIELDS, Gwsr: "" }),
      CREDS,
    );
    expect(result.gwsr).toBeNull();
  });

  it("SimulatePaid=1 → simulatePaid 為 true", () => {
    const result = parseAioReturn(
      signedReturn({ ...SUCCESS_FIELDS, SimulatePaid: "1" }),
      CREDS,
    );
    expect(result.simulatePaid).toBe(true);
  });
});
