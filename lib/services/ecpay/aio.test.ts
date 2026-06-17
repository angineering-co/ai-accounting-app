import { describe, it, expect } from "vitest";
import { verifyCheckMacValue, type EcpayCredentials } from "./checkmacvalue";
import {
  buildAioCreditForm,
  formatMerchantTradeDate,
  sanitizeItemText,
  type AioCreditOrder,
} from "./aio";

const CREDS: EcpayCredentials = {
  hashKey: "pwFHCqoQZGmho4w6",
  hashIV: "EkRm7iFT261dpevs",
};

const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]");

describe("sanitizeItemText", () => {
  it("移除綠界 WAF 關鍵字（curl / wget）", () => {
    const out = sanitizeItemText("curl 測試商品 wget", 200);
    expect(out.toLowerCase()).not.toContain("curl");
    expect(out.toLowerCase()).not.toContain("wget");
    expect(out).toContain("測試商品");
  });

  it("移除控制字元與換行", () => {
    const input = `商${String.fromCharCode(0)}品\n名稱`;
    const out = sanitizeItemText(input, 200);
    expect(out).not.toMatch(CONTROL_CHARS);
    expect(out).toContain("商品");
  });

  it("移除 HTML 角括號", () => {
    expect(sanitizeItemText("<b>商品</b>", 200)).toBe("b商品/b");
  });

  it("截斷至上限長度", () => {
    expect(sanitizeItemText("阿".repeat(300), 200)).toHaveLength(200);
  });
});

describe("formatMerchantTradeDate", () => {
  it("以台灣時間（UTC+8）格式化", () => {
    // 2026-03-05T04:00:00Z → 台北 12:00:00
    expect(formatMerchantTradeDate(new Date("2026-03-05T04:00:00Z"))).toBe(
      "2026/03/05 12:00:00",
    );
  });

  it("跨日換算（UTC 晚間 → 台北隔日）", () => {
    // 2026-03-05T20:30:45Z → 台北 2026/03/06 04:30:45
    expect(formatMerchantTradeDate(new Date("2026-03-05T20:30:45Z"))).toBe(
      "2026/03/06 04:30:45",
    );
  });
});

describe("buildAioCreditForm", () => {
  const order: AioCreditOrder = {
    merchantId: "3002607",
    merchantTradeNo: "Test1234567890",
    merchantTradeDate: "2025/01/01 12:00:00",
    totalAmount: 16380,
    tradeDesc: "年度訂閱",
    itemName: "2026 年度訂閱",
    returnUrl: "https://example.com/api/webhooks/ecpay/return",
    orderResultUrl: "https://example.com/api/webhooks/ecpay/result",
  };

  it("帶入信用卡一次付清的固定參數（不含 Period*）", () => {
    const { actionUrl, params } = buildAioCreditForm(order, CREDS, "stage");
    expect(actionUrl).toBe(
      "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
    );
    expect(params.ChoosePayment).toBe("Credit");
    expect(params.PaymentType).toBe("aio");
    expect(params.EncryptType).toBe("1");
    expect(params.TotalAmount).toBe("16380");
    expect(params.MerchantID).toBe("3002607");
    expect(params.OrderResultURL).toBe(
      "https://example.com/api/webhooks/ecpay/result",
    );
    expect(params).not.toHaveProperty("PeriodAmount");
  });

  it("CheckMacValue 可被自身驗證（round-trip）", () => {
    const { params } = buildAioCreditForm(order, CREDS, "stage");
    expect(verifyCheckMacValue(params, CREDS)).toBe(true);
  });

  it("env=production 指向正式端點", () => {
    const { actionUrl } = buildAioCreditForm(order, CREDS, "production");
    expect(actionUrl).toBe(
      "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5",
    );
  });

  it("未提供 orderResultUrl 時不帶 OrderResultURL", () => {
    const { params } = buildAioCreditForm(
      { ...order, orderResultUrl: undefined },
      CREDS,
      "stage",
    );
    expect(params).not.toHaveProperty("OrderResultURL");
  });
});
