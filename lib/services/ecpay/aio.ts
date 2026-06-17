import { generateCheckMacValue, type EcpayCredentials } from "./checkmacvalue";
import { ECPAY_AIO_ENDPOINTS, type EcpayEnv } from "./config";

// 官方上限：ItemName 400 / TradeDesc 200。ItemName 建議 ≤200 以避免多位元組字元
// 被截斷導致 CheckMacValue 不符（掉單）。
const ITEM_NAME_MAX_LENGTH = 200;
const TRADE_DESC_MAX_LENGTH = 200;

// 綠界 WAF 會攔截含系統指令關鍵字的 ItemName / TradeDesc（錯誤碼 10400011）。
// 關鍵字清單來源：ECPay 2858（AIO 介接注意事項）/ skill guides/00。
const WAF_KEYWORDS =
  /\b(echo|cmd|python|perl|ping|ftp|telnet|nmap|nc|chmod|kill|rm|ls|gcc|passwd|uname|finger|mail|xterm|traceroute|tracert|tftp|wget|curl|bash|cmd\.exe|net\.exe|nmap\.exe|nc\.exe|ftp\.exe|wsh\.exe|tclsh)\b/gi;

// 控制字元（0x00–0x1F 與 DEL 0x7F）。用 RegExp 字串建構、雙反斜線跳脱，
// 避免把不可見位元組寫進原始碼。
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

/**
 * ItemName / TradeDesc 消毒：移除控制字元、HTML 角括號、綠界 WAF 關鍵字並截斷。
 * 消毒後的值同時用於 CheckMacValue 計算與表單欄位，兩者必須一致才不會掉單。
 */
export function sanitizeItemText(input: string, maxLength: number): string {
  let value = input
    .replace(/[\r\n\t]+/g, " ") // 換行 / tab → 空格
    .replace(CONTROL_CHARS, "") // 其他控制字元
    .replace(/[<>]/g, "") // HTML 角括號
    .replace(WAF_KEYWORDS, "") // WAF 關鍵字
    .replace(/\s+/g, " ") // 收斂連續空白
    .trim();
  if (value.length > maxLength) value = value.slice(0, maxLength).trim();
  return value;
}

/** 台灣時間（UTC+8）的 `yyyy/MM/dd HH:mm:ss`。Vercel 預設 UTC，必須明確轉時區。 */
export function formatMerchantTradeDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export interface AioCreditOrder {
  merchantId: string;
  merchantTradeNo: string;
  merchantTradeDate: string; // yyyy/MM/dd HH:mm:ss（UTC+8）
  totalAmount: number;
  tradeDesc: string;
  itemName: string;
  returnUrl: string; // server-to-server，付款結果權威來源
  orderResultUrl?: string; // 付款完導回前景顯示用（選填）
}

export interface EcpayCheckoutForm {
  actionUrl: string;
  // 原始值（未 url-encode）；瀏覽器送出 form 時會自帶 application/x-www-form-urlencoded
  // 編碼，綠界解碼後重算 CheckMacValue。故此處放原始值，CheckMacValue 也以原始值計算。
  params: Record<string, string>;
}

/** 組「信用卡一次付清」AIO 自動送出表單參數（不帶 Period*）。 */
export function buildAioCreditForm(
  order: AioCreditOrder,
  credentials: EcpayCredentials,
  env: EcpayEnv,
): EcpayCheckoutForm {
  const params: Record<string, string> = {
    MerchantID: order.merchantId,
    MerchantTradeNo: order.merchantTradeNo,
    MerchantTradeDate: order.merchantTradeDate,
    PaymentType: "aio",
    TotalAmount: String(order.totalAmount),
    TradeDesc: sanitizeItemText(order.tradeDesc, TRADE_DESC_MAX_LENGTH),
    ItemName: sanitizeItemText(order.itemName, ITEM_NAME_MAX_LENGTH),
    ReturnURL: order.returnUrl,
    ChoosePayment: "Credit",
    EncryptType: "1",
  };
  if (order.orderResultUrl) {
    params.OrderResultURL = order.orderResultUrl;
  }
  params.CheckMacValue = generateCheckMacValue(params, credentials);
  return { actionUrl: ECPAY_AIO_ENDPOINTS[env], params };
}
