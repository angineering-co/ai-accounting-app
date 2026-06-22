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

// Action 代碼（C=請款/關帳, R=退款, E=取消關帳, N=放棄授權）。
// 本系統用 R 退已關帳訂單；要關帳（尚未關帳）訂單整筆退款改走 E→N（見下方 isUncapturedFullRefundError）。
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

/** 退款失敗訊息是否為「帳戶餘額不足」（已關帳訂單退刷才會遇到，E→N 幫不上）。 */
function isBalanceShortfall(result: DoActionResult): boolean {
  return /餘額|balance/i.test(result.rtnMsg);
}

/**
 * 判斷退款（Action=R）失敗是否因「訂單尚未關帳（要關帳）」，亦即是否該改走 取消關帳(E)→放棄授權(N)。
 *
 * 要關帳狀態下，綠界只允許「部分退款」（退款金額 < 原金額）用 Action=R；整筆退款（=原金額）
 * 會被拒。本帳戶為每日自動關帳，付款當日（20:15–20:30 關帳前）退款必落在此情境。
 * 來源：綠界 2883（信用卡請款與退款狀態機）、2885（信用卡請退款功能）。
 *
 * 實測正式環境此回拒的 RtnMsg 為 `更新失敗.(error_amount_R)`（RtnCode 10000002），但 error token
 * `error_amount_R` 綠界文件未明列、也不在 ecpay skill 內，不宜當作唯一硬比對鍵。故放寬為：
 * 命中 token，或 RtnCode 10000002（更新失敗）且非餘額不足。誤判也安全——E（取消關帳）僅在
 * 要關帳狀態有效，套錯狀態會直接失敗並回報友善訊息，不會誤動金流（最壞＝與未 fallback 同樣回報失敗）。
 */
export function isUncapturedFullRefundError(result: DoActionResult): boolean {
  if (/error_amount_R/i.test(result.rtnMsg)) return true;
  if (result.rtnCode !== 10000002) return false;
  return !isBalanceShortfall(result);
}

/**
 * 把綠界退款失敗回應轉成操作者看得懂的訊息。RtnMsg 為綠界原始字串（含 `error_amount_R`
 * 之類的 error token），不適合直接呈現；原始 rtnCode / rtnMsg 由 caller 記入 server log 供查修。
 */
export function describeDoActionFailure(result: DoActionResult): string {
  if (isBalanceShortfall(result)) {
    return "綠界帳戶餘額不足，無法完成退款，請確認綠界帳戶餘額後再試。";
  }
  // 要關帳訂單整筆退款正常情況已由 E→N fallback 處理；落到這裡代表 fallback 也失敗或狀態異常。
  if (isUncapturedFullRefundError(result)) {
    return "這筆訂單目前的狀態無法退款，請至綠界廠商後台確認交易狀態後再試。";
  }
  return `退款未成功，請稍後再試，或至綠界廠商後台確認交易狀態（綠界回應碼 ${result.rtnCode}）。`;
}
