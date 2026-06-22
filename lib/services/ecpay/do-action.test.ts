import { describe, it, expect } from "vitest";
import { generateCheckMacValue, type EcpayCredentials } from "./checkmacvalue";
import {
  buildDoActionParams,
  parseDoActionResponse,
  isUncapturedFullRefundError,
  describeDoActionFailure,
} from "./do-action";

const CREDS: EcpayCredentials = {
  hashKey: "pwFHCqoQZGmho4w6",
  hashIV: "EkRm7iFT261dpevs",
};

describe("buildDoActionParams", () => {
  it("帶齊退款必填欄位並附上可被驗證的 CheckMacValue", () => {
    const params = buildDoActionParams(
      {
        merchantId: "3002607",
        merchantTradeNo: "SB0123456789",
        tradeNo: "2401011234567890",
        action: "R",
        totalAmount: 16380,
      },
      CREDS,
    );

    expect(params.MerchantID).toBe("3002607");
    expect(params.MerchantTradeNo).toBe("SB0123456789");
    expect(params.TradeNo).toBe("2401011234567890");
    expect(params.Action).toBe("R");
    expect(params.TotalAmount).toBe("16380"); // 字串化

    // CheckMacValue 必須與用其餘欄位重算的一致（自洽，避免日後改動演算法掉單）。
    const { CheckMacValue, ...rest } = params;
    expect(CheckMacValue).toBe(generateCheckMacValue(rest, CREDS));
  });
});

describe("parseDoActionResponse", () => {
  it("RtnCode=1 視為成功（整數比較）", () => {
    const result = parseDoActionResponse(
      "MerchantID=3002607&MerchantTradeNo=SB0123456789&TradeNo=2401011234567890&RtnCode=1&RtnMsg=",
    );
    expect(result.success).toBe(true);
    expect(result.rtnCode).toBe(1);
    expect(result.merchantTradeNo).toBe("SB0123456789");
    expect(result.tradeNo).toBe("2401011234567890");
  });

  it("RtnCode 非 1 視為失敗並保留 RtnMsg", () => {
    const result = parseDoActionResponse(
      "RtnCode=10200047&RtnMsg=" + encodeURIComponent("交易不存在"),
    );
    expect(result.success).toBe(false);
    expect(result.rtnCode).toBe(10200047);
    expect(result.rtnMsg).toBe("交易不存在");
  });

  it("缺 RtnCode 時不誤判為成功", () => {
    const result = parseDoActionResponse("RtnMsg=oops");
    expect(result.success).toBe(false);
    expect(result.rtnCode).toBe(-1);
  });
});

describe("isUncapturedFullRefundError", () => {
  it("要關帳訂單整筆退款被拒（error_amount_R token）→ true", () => {
    const result = parseDoActionResponse(
      "RtnCode=10000002&RtnMsg=" +
        encodeURIComponent("更新失敗.(error_amount_R)"),
    );
    expect(isUncapturedFullRefundError(result)).toBe(true);
  });

  it("放寬比對：10000002 更新失敗（token 改字）仍視為要關帳 → true", () => {
    const result = parseDoActionResponse(
      "RtnCode=10000002&RtnMsg=" + encodeURIComponent("更新失敗.(some_other)"),
    );
    expect(isUncapturedFullRefundError(result)).toBe(true);
  });

  it("10000002 但為帳戶餘額不足（已關帳退刷情境）→ false，不誤觸 E→N", () => {
    const result = parseDoActionResponse(
      "RtnCode=10000002&RtnMsg=" +
        encodeURIComponent("帳戶餘額低於退刷金額"),
    );
    expect(isUncapturedFullRefundError(result)).toBe(false);
  });

  it("10000002 且含「餘額」但非帳戶餘額（如交易餘額不符）→ 仍視為要關帳", () => {
    const result = parseDoActionResponse(
      "RtnCode=10000002&RtnMsg=" + encodeURIComponent("交易餘額不符"),
    );
    expect(isUncapturedFullRefundError(result)).toBe(true);
  });

  it("可退刷額度不足（10100027，已關帳餘額不足）→ false，不誤觸 E→N", () => {
    const result = parseDoActionResponse(
      "RtnCode=10100027&RtnMsg=" +
        encodeURIComponent("可退刷額度不足無法退刷，請參照廠商後台退刷失敗畫面。"),
    );
    expect(isUncapturedFullRefundError(result)).toBe(false);
  });

  it("其他 RtnCode（如交易不存在）→ false", () => {
    const result = parseDoActionResponse(
      "RtnCode=10200047&RtnMsg=" + encodeURIComponent("交易不存在"),
    );
    expect(isUncapturedFullRefundError(result)).toBe(false);
  });
});

describe("describeDoActionFailure", () => {
  it("error_amount_R 不把 error token 直接吐給操作者", () => {
    const result = parseDoActionResponse(
      "RtnCode=10000002&RtnMsg=" +
        encodeURIComponent("更新失敗.(error_amount_R)"),
    );
    const msg = describeDoActionFailure(result);
    expect(msg).not.toContain("error_amount_R");
    expect(msg).toContain("綠界廠商後台");
  });

  it("帳戶餘額不足給專屬可行動訊息", () => {
    const result = parseDoActionResponse(
      "RtnCode=10000002&RtnMsg=" +
        encodeURIComponent("帳戶餘額低於退刷金額"),
    );
    const msg = describeDoActionFailure(result);
    expect(msg).toContain("餘額不足");
  });

  it("可退刷額度不足（10100027）給帳戶餘額專屬訊息，不外吐原始 RtnMsg", () => {
    const result = parseDoActionResponse(
      "RtnCode=10100027&RtnMsg=" +
        encodeURIComponent("可退刷額度不足無法退刷，請參照廠商後台退刷失敗畫面。"),
    );
    const msg = describeDoActionFailure(result);
    expect(msg).toContain("餘額不足");
    expect(msg).toContain("廠商後台");
    expect(msg).not.toContain("退刷失敗畫面");
  });

  it("其他失敗給泛用可行動訊息並附綠界回應碼", () => {
    const result = parseDoActionResponse("RtnCode=10200047&RtnMsg=oops");
    const msg = describeDoActionFailure(result);
    expect(msg).not.toContain("oops");
    expect(msg).toContain("10200047");
  });
});
