import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { ecpay_payments } from "@/lib/db/schema";
import { getSiteBaseUrl } from "@/lib/services/ecpay/config";

/**
 * 綠界 OrderResultURL 前景回呼：付款完成後由**消費者瀏覽器** Form POST 過來。
 * 非權威、僅用於導頁 — 真正的付款狀態以 ReturnURL 寫入 DB 為準（見 callback.ts）。
 *
 * 頁面（RSC）只服務 GET，無法直接接 POST，故這裡接 POST、用 MerchantTradeNo 對應
 * checkout_token，再以 303 轉成 GET 導去 /pay/[token]/result 顯示結果。
 */
export async function POST(request: NextRequest) {
  const base = getSiteBaseUrl();
  let token: string | null = null;

  try {
    const form = await request.formData();
    const merchantTradeNo = String(form.get("MerchantTradeNo") ?? "");
    if (merchantTradeNo) {
      const [row] = await db
        .select({ token: ecpay_payments.checkout_token })
        .from(ecpay_payments)
        .where(eq(ecpay_payments.merchant_trade_no, merchantTradeNo))
        .limit(1);
      token = row?.token ?? null;
    }
  } catch {
    token = null;
  }

  const destination = token ? `${base}/pay/${token}/result` : `${base}/`;
  return NextResponse.redirect(destination, 303);
}
