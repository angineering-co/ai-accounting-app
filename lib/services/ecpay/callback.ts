import { verifyCheckMacValue, type EcpayCredentials } from "./checkmacvalue";

/**
 * 綠界 AIO ReturnURL（信用卡一次付清）回呼解析。純函式、不碰 DB 或環境變數，
 * 方便單測。回呼為 server-to-server Form POST、以 CheckMacValue 驗證，是付款結果
 * 的**權威來源**（前景 OrderResultURL 僅供顯示）。
 *
 * 注意：AIO 的 `RtnCode` 是**字串** `'1'` 代表成功（非整數 1，與 ECPG/AES 服務不同）。
 * 來源：skill guides/01-payment-aio §步驟 3、guides/19 wire-format。
 */

export interface AioReturnResult {
  /** CheckMacValue 驗證是否通過。false 代表偽造或我方實作有誤，不可採信其餘欄位。 */
  valid: boolean;
  /** 對帳鍵：建單時放進 CustomField1 的 checkout_token，綠界原樣回傳。 */
  checkoutToken: string;
  /** 實際成交的綠界特店交易編號（每次開啟 checkout 都不同，成交後才回寫到列）。 */
  merchantTradeNo: string;
  /** RtnCode === '1' 才算付款成功。 */
  success: boolean;
  rtnCode: string;
  rtnMsg: string;
  /** 綠界交易號（請款／退款時使用，存進 raw_payload 即可）。 */
  tradeNo: string;
  /** 授權單號。可達 10 位數，超出 int4，故 DB 欄位為 bigint。 */
  gwsr: number | null;
  /** 卡號末 4 碼。 */
  card4no: string | null;
  /** 付款時間，轉成 ISO8601（PaymentDate 為台灣時間 UTC+8）。 */
  paidAt: string | null;
  /** 綠界模擬付款（SimulatePaid=1）；正式環境不應出現。 */
  simulatePaid: boolean;
}

/** 綠界 `yyyy/MM/dd HH:mm:ss`（台灣時間）→ ISO8601 帶 +08:00 偏移。格式不符回 null。 */
export function ecpayPaymentDateToISO(
  paymentDate: string | undefined | null,
): string | null {
  if (!paymentDate) return null;
  const m = paymentDate
    .trim()
    .match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+08:00`;
}

/** 解析 ReturnURL Form POST 參數，先驗 CheckMacValue 再正規化各欄位。 */
export function parseAioReturn(
  params: Record<string, string>,
  credentials: EcpayCredentials,
): AioReturnResult {
  const valid = verifyCheckMacValue(params, credentials);
  const get = (key: string) =>
    typeof params[key] === "string" ? params[key] : "";
  const rtnCode = get("RtnCode");
  // 注意：綠界「額外回傳的參數」用**小寫**鍵名（gwsr / card4no），與一般欄位
  // （MerchantTradeNo 等）的大駝峰不同。讀錯大小寫會永遠取到空字串、欄位掉空。
  // 來源：ECPay 5675（額外回傳的參數）、skill guides/01 §額外回傳參數。
  const gwsrRaw = get("gwsr");
  // GWSR 最長 10 位，遠小於 Number.MAX_SAFE_INTEGER（~9×10^15），用 Number 安全；
  // 與 DB 欄位 bigint({ mode: "number" }) 一致，勿改成 BigInt 以免型別不符。
  const gwsr = /^\d+$/.test(gwsrRaw) ? Number(gwsrRaw) : null;
  const card4no = get("card4no") || null;
  return {
    valid,
    checkoutToken: get("CustomField1"),
    merchantTradeNo: get("MerchantTradeNo"),
    success: rtnCode === "1",
    rtnCode,
    rtnMsg: get("RtnMsg"),
    tradeNo: get("TradeNo"),
    gwsr,
    card4no,
    paidAt: ecpayPaymentDateToISO(get("PaymentDate")),
    simulatePaid: get("SimulatePaid") === "1",
  };
}
