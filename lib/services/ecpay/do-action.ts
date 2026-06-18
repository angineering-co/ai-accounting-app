import { generateCheckMacValue, type EcpayCredentials } from "./checkmacvalue";

/**
 * 綠界 AIO 信用卡 DoAction（請款/退款/取消/放棄）。純函式、不碰 DB / 環境變數 / I/O，
 * HTTP 呼叫留給 caller（server action）。來源：綠界 2885（信用卡請退款功能）。
 *
 * ⚠️ 僅信用卡可用 DoAction；ATM / 超商付款不支援線上退款。
 * ⚠️ 僅正式環境可實際執行（測試環境無真實授權）。
 *
 * 回應為 application/x-www-form-urlencoded 字串，RtnCode 為**整數**，1=成功。
 */

// Action 代碼（C=請款/關帳, R=退款, E=取消關帳, N=放棄授權）。本系統 v1 只用 R（退款）。
export type DoActionType = "C" | "R" | "E" | "N";

export interface DoActionInput {
  merchantId: string;
  merchantTradeNo: string;
  /** 綠界交易編號（TradeNo），非特店自編的 MerchantTradeNo。退款必填。 */
  tradeNo: string;
  action: DoActionType;
  /** R 退款金額：全額＝原訂單金額，部分退款＝欲退金額（上限為原金額）。 */
  totalAmount: number;
}

export interface DoActionResult {
  /** RtnCode === 1 才算成功。 */
  success: boolean;
  rtnCode: number;
  rtnMsg: string;
  merchantTradeNo: string;
  tradeNo: string;
}

/** 組 CreditDetail/DoAction 的 form 參數（含 CheckMacValue）。 */
export function buildDoActionParams(
  input: DoActionInput,
  credentials: EcpayCredentials,
): Record<string, string> {
  const params: Record<string, string> = {
    MerchantID: input.merchantId,
    MerchantTradeNo: input.merchantTradeNo,
    TradeNo: input.tradeNo,
    Action: input.action,
    TotalAmount: String(input.totalAmount),
  };
  params.CheckMacValue = generateCheckMacValue(params, credentials);
  return params;
}

/**
 * 解析 DoAction 回應字串（url-encoded query string）。
 * RtnCode 為整數型別（與 AIO callback 的字串 '1' 不同），以整數比較。
 */
export function parseDoActionResponse(body: string): DoActionResult {
  const p = new URLSearchParams(body);
  const rtnCodeRaw = p.get("RtnCode");
  // Number(null) === 0、Number("") === 0，會把「缺 RtnCode」誤判為非成功的 0；
  // 明確處理缺漏/空字串，回 -1 表示無效回應。
  const rtnCode =
    rtnCodeRaw === null || rtnCodeRaw.trim() === "" ? -1 : Number(rtnCodeRaw);
  return {
    success: rtnCode === 1,
    rtnCode: Number.isNaN(rtnCode) ? -1 : rtnCode,
    rtnMsg: p.get("RtnMsg") ?? "",
    merchantTradeNo: p.get("MerchantTradeNo") ?? "",
    tradeNo: p.get("TradeNo") ?? "",
  };
}
