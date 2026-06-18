import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { ecpay_payments } from "@/lib/db/schema";
import {
  buildAioCreditForm,
  formatMerchantTradeDate,
} from "@/lib/services/ecpay/aio";
import { getEcpayConfig, getSiteBaseUrl } from "@/lib/services/ecpay/config";
import { generateMerchantTradeNo } from "@/lib/services/ecpay/merchant-trade-no";
import { PayShell } from "../pay-shell";
import { AutoSubmitForm } from "./auto-submit-form";

type Props = { params: Promise<{ token: string }> };

export default function PayPage({ params }: Props) {
  // 動態內容（讀 row、產生當下 MerchantTradeDate 與 CheckMacValue）放進 Suspense，
  // 讓 cacheComponents 能先靜態輸出外殼，未快取資料在邊界內串流。
  return (
    <Suspense fallback={<PayShell title="載入中…" tone="pending" />}>
      <PayContent params={params} />
    </Suspense>
  );
}

async function PayContent({ params }: Props) {
  await connection();
  const { token } = await params;

  // 公開路由、無登入 session：以 checkout_token 直接查（Drizzle 走直連、繞過 RLS）。
  const [payment] = await db
    .select()
    .from(ecpay_payments)
    .where(eq(ecpay_payments.checkout_token, token))
    .limit(1);

  if (!payment) notFound();

  // 狀態閘門：付款後此連結即失效，不再產生付款表單（避免重複付款的「先付再重開」路徑）。
  // 重開時導去結果頁，讓已付款者看到「付款成功」確認，而非含糊的失效訊息。
  if (payment.status !== "pending") {
    redirect(`/pay/${encodeURIComponent(token)}/result`);
  }

  if (payment.expires_at && new Date(payment.expires_at) < new Date()) {
    return (
      <PayShell
        tone="error"
        title="付款連結已過期"
        detail="這條收款連結已超過有效期限，請向我們索取新的連結。"
      />
    );
  }

  let form;
  try {
    const config = getEcpayConfig();
    const baseUrl = getSiteBaseUrl();
    // 每次開啟都產生全新的 MerchantTradeNo：綠界視 MTN 為永久唯一，重送同一個會被擋
    // （10200047），故無法重用。對帳改以 CustomField1=checkout_token（綠界原樣回傳），
    // 真正成交的 MTN 由 ReturnURL 回寫。
    form = buildAioCreditForm(
      {
        merchantId: config.merchantId,
        merchantTradeNo: generateMerchantTradeNo(),
        merchantTradeDate: formatMerchantTradeDate(new Date()),
        totalAmount: payment.amount,
        tradeDesc: payment.description,
        itemName: payment.description,
        returnUrl: `${baseUrl}/api/webhooks/ecpay/return`,
        // checkout_token 帶在 query，讓前景回呼免反查 DB 即可確定要導去哪筆的結果頁。
        orderResultUrl: `${baseUrl}/pay/result?token=${encodeURIComponent(token)}`,
        // 對帳鍵：綠界 callback 會原樣帶回，ReturnURL 以此對應到這筆收款。
        customField1: token,
      },
      config.credentials,
      config.env,
    );
  } catch {
    return (
      <PayShell
        tone="error"
        title="付款暫時無法使用"
        detail="付款服務尚未設定完成，請稍後再試。"
      />
    );
  }

  return (
    <PayShell
      tone="pending"
      title="正在前往綠界付款頁…"
      detail="若未自動跳轉，請點下方按鈕繼續。"
    >
      <AutoSubmitForm actionUrl={form.actionUrl} params={form.params} />
    </PayShell>
  );
}
