import { randomBytes } from "crypto";

/**
 * 產生綠界 MerchantTradeNo：≤20 字、僅英數、永久唯一（非時間窗口內唯一）。
 * 規則：`SB` 前綴 + 9 bytes 轉 18 位 hex = 20 字。唯一性最終由 DB 的 UNIQUE 約束
 * 保證，碰撞（機率極低）時由呼叫端重試。
 */
export function generateMerchantTradeNo(): string {
  return `SB${randomBytes(9).toString("hex")}`;
}
