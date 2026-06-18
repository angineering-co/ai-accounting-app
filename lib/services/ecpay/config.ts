import type { EcpayCredentials } from "./checkmacvalue";

export type EcpayEnv = "stage" | "production";

export const ECPAY_AIO_ENDPOINTS: Record<EcpayEnv, string> = {
  stage: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
  production: "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5",
};

// 信用卡請款/退款/取消（DoAction）。
// ⚠️ DoAction 僅正式環境可實際執行：綠界測試環境無法做真實授權，故 stage 沒有可用的
// 退款 API。stage 仍指向 stage domain 以維持對稱，但於 stage 呼叫退款會收到失敗回應，
// 屬預期行為（退款須於正式環境驗證）。來源：綠界 2885（信用卡請退款功能）。
export const ECPAY_DOACTION_ENDPOINTS: Record<EcpayEnv, string> = {
  stage: "https://payment-stage.ecpay.com.tw/CreditDetail/DoAction",
  production: "https://payment.ecpay.com.tw/CreditDetail/DoAction",
};

export interface EcpayConfig {
  merchantId: string;
  credentials: EcpayCredentials;
  env: EcpayEnv;
  aioCheckoutUrl: string;
  doActionUrl: string;
}

/** 讀 ECPay 環境變數。缺漏即丟錯（部署設定問題，不該無聲失敗）。 */
export function getEcpayConfig(): EcpayConfig {
  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIV = process.env.ECPAY_HASH_IV;
  if (!merchantId || !hashKey || !hashIV) {
    throw new Error(
      "Missing ECPay env (ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV)",
    );
  }
  const env: EcpayEnv =
    process.env.ECPAY_ENV === "production" ? "production" : "stage";
  return {
    merchantId,
    credentials: { hashKey, hashIV },
    env,
    aioCheckoutUrl: ECPAY_AIO_ENDPOINTS[env],
    doActionUrl: ECPAY_DOACTION_ENDPOINTS[env],
  };
}

/** 站台對外絕對網址（給綠界 server-to-server 回呼用）。 */
export function getSiteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL ??
    "http://127.0.0.1:3000";
  return raw.startsWith("http") ? raw : `https://${raw}`;
}
