import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { ecpay_payments } from "@/lib/db/schema";
import {
  buildAioCreditForm,
  formatMerchantTradeDate,
} from "@/lib/services/ecpay/aio";
import { getEcpayConfig, getSiteBaseUrl } from "@/lib/services/ecpay/config";
import { AutoSubmitForm } from "./auto-submit-form";

type Props = { params: Promise<{ token: string }> };

function Shell({ title, detail }: { title: string; detail?: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      {detail ? (
        <p className="text-sm text-muted-foreground">{detail}</p>
      ) : null}
    </main>
  );
}

export default function PayPage({ params }: Props) {
  // 動態內容（讀 row、產生當下 MerchantTradeDate 與 CheckMacValue）放進 Suspense，
  // 讓 cacheComponents 能先靜態輸出外殼，未快取資料在邊界內串流。
  return (
    <Suspense fallback={<Shell title="載入中…" />}>
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

  if (payment.status !== "pending") {
    return (
      <Shell
        title="此連結已完成或失效"
        detail="這筆款項已付款或不再有效，如有疑問請與我們聯繫。"
      />
    );
  }

  if (payment.expires_at && new Date(payment.expires_at) < new Date()) {
    return (
      <Shell
        title="付款連結已過期"
        detail="這條收款連結已超過有效期限，請向我們索取新的連結。"
      />
    );
  }

  if (!payment.merchant_trade_no) {
    return (
      <Shell
        title="付款暫時無法進行"
        detail="這筆款項的設定尚未完成，請稍後再試或與我們聯繫。"
      />
    );
  }

  let form;
  try {
    const config = getEcpayConfig();
    const baseUrl = getSiteBaseUrl();
    form = buildAioCreditForm(
      {
        merchantId: config.merchantId,
        merchantTradeNo: payment.merchant_trade_no,
        merchantTradeDate: formatMerchantTradeDate(new Date()),
        totalAmount: payment.amount,
        tradeDesc: payment.description,
        itemName: payment.description,
        returnUrl: `${baseUrl}/api/webhooks/ecpay/return`,
        // checkout_token 帶在 query，讓前景回呼免反查 DB 即可確定要導去哪筆的結果頁。
        orderResultUrl: `${baseUrl}/pay/result?token=${encodeURIComponent(token)}`,
      },
      config.credentials,
      config.env,
    );
  } catch {
    return (
      <Shell
        title="付款暫時無法使用"
        detail="付款服務尚未設定完成，請稍後再試。"
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">正在前往綠界付款頁…</h1>
      <p className="text-sm text-muted-foreground">
        若未自動跳轉，請點下方按鈕繼續。
      </p>
      <AutoSubmitForm actionUrl={form.actionUrl} params={form.params} />
    </main>
  );
}
