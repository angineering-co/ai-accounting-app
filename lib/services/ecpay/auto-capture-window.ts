/**
 * 綠界每日自動關帳時段（台灣時間 20:15–20:30）。
 *
 * 「若『每日自動關帳』開啟時，每天 20:15 ~ 20:30 請勿執行此API。」（來源：綠界 2885）
 * 此時段綠界進行批次關帳並依關帳金額向銀行請/退款，故請款（C）與退款（R）DoAction 都不可呼叫。
 * 本系統收款帳戶為每日自動關帳，於此時段一律暫停退款。
 *
 * 純函式、無 node 相依（可同時用於 server action 與 client 元件，不會把 crypto 帶進前端 bundle）。
 */

export const AUTO_CAPTURE_BLACKOUT_LABEL = "20:15–20:30";

/** 給定時間是否落在台灣時間 20:15–20:30（含邊界）的自動關帳時段。預設取現在時間。 */
export function isAutoCaptureBlackout(date: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const minutes = get("hour") * 60 + get("minute");
  // [20:15, 20:30] 全段封鎖（含邊界，保守避開批次關帳窗口）。
  return minutes >= 20 * 60 + 15 && minutes <= 20 * 60 + 30;
}
