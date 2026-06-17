import { createHash, timingSafeEqual } from "crypto";

/**
 * 綠界 ECPay AIO 檢查碼（CheckMacValue）核心模組。純函式、不碰 I/O 或環境變數。
 *
 * 演算法（來源：綠界「檢查碼機制」2902）：
 *   1. 取所有參數（排除 CheckMacValue 本身），參數名稱不分大小寫 A→Z 排序。
 *   2. 最前面加 HashKey、最後面加 HashIV，整串以 & 串接。
 *   3. 整串做 .NET 風格 URL encode → 轉小寫 → 還原 .NET 不編碼的字元（見下）。
 *   4. SHA256，輸出大寫 16 進位。
 *
 * 注意：此處的 ecpayUrlEncode 與 AES 服務的 aesUrlEncode 不同，不可混用。
 */

// encodeURIComponent 轉小寫後，把 .NET HttpUtility.UrlEncode 視為「安全、不編碼」
// 的字元還原成字面值，使我方輸出與綠界伺服器端逐字一致。
const ECPAY_ENCODE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/%20/g, "+"],
  [/%2d/g, "-"],
  [/%5f/g, "_"],
  [/%2e/g, "."],
  [/%21/g, "!"],
  [/%2a/g, "*"],
  [/%28/g, "("],
  [/%29/g, ")"],
];

/** 綠界版 URL encode：encodeURIComponent → 轉小寫 → 還原 .NET 不編碼字元。 */
export function ecpayUrlEncode(input: string): string {
  let encoded = encodeURIComponent(input).toLowerCase();
  for (const [pattern, replacement] of ECPAY_ENCODE_REPLACEMENTS) {
    encoded = encoded.replace(pattern, replacement);
  }
  return encoded;
}

export interface EcpayCredentials {
  hashKey: string;
  hashIV: string;
}

/** 依參數產生 CheckMacValue（大寫 16 進位 SHA256）。 */
export function generateCheckMacValue(
  params: Record<string, string | number>,
  { hashKey, hashIV }: EcpayCredentials,
): string {
  const sortedKeys = Object.keys(params)
    .filter((key) => key !== "CheckMacValue")
    .sort((a, b) => {
      const x = a.toLowerCase();
      const y = b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });

  const raw =
    `HashKey=${hashKey}` +
    sortedKeys.map((key) => `&${key}=${params[key]}`).join("") +
    `&HashIV=${hashIV}`;

  return createHash("sha256")
    .update(ecpayUrlEncode(raw), "utf8")
    .digest("hex")
    .toUpperCase();
}

/**
 * 驗證 callback 帶回的 CheckMacValue。timing-safe 比較，禁用 == / ===。
 * 回傳值缺漏、長度不符、或不一致一律回 false。
 */
export function verifyCheckMacValue(
  params: Record<string, string | number>,
  credentials: EcpayCredentials,
): boolean {
  const received = params.CheckMacValue;
  if (typeof received !== "string" || received.length === 0) return false;

  const expected = generateCheckMacValue(params, credentials);
  const receivedBuf = Buffer.from(received.toUpperCase(), "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (receivedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(receivedBuf, expectedBuf);
}
