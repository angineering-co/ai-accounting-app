import { NextResponse, type NextRequest } from "next/server";
import { getSiteBaseUrl } from "@/lib/services/ecpay/config";

/**
 * 綠界 OrderResultURL 前景回呼：付款完成後由**消費者瀏覽器** Form POST 過來。
 * 非權威、僅用於導頁 — 真正的付款狀態以 ReturnURL 寫入 DB 為準（見 callback.ts）。
 *
 * checkout_token 在組表單時就帶在 OrderResultURL 的 `?token=` query，故這裡直接取用，
 * 不必以 MerchantTradeNo 反查 DB（也就沒有「查無對應」而落到首頁的破口）。RSC 頁面
 * 只服務 GET 接不了 POST，所以這裡接 POST 後以 303 轉成 GET 導去顯示頁。
 *
 * token 只當作我方路徑的一個 segment（encodeURIComponent 確保不溢出成多段或外部網址），
 * 顯示頁再以它查 DB；查無則 notFound，無開放轉址風險。
 */
export async function POST(request: NextRequest) {
  const base = getSiteBaseUrl();
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    // 只會在 OrderResultURL 設定有誤（我方 bug）時發生。留 log 以可觀測；導去
    // /pay/* 的品牌化 not-found（該 token 必查無），而非把客戶丟到行銷首頁。
    console.error(
      "[ecpay] OrderResultURL 缺少 token，無法導向結果頁（OrderResultURL 設定有誤？）",
    );
    return NextResponse.redirect(`${base}/pay/unavailable`, 303);
  }

  return NextResponse.redirect(
    `${base}/pay/${encodeURIComponent(token)}/result`,
    303,
  );
}
