import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { ecpay_payments } from "@/lib/db/schema";
import { ResultAutoRefresh } from "./result-auto-refresh";

type Props = { params: Promise<{ token: string }> };

function Shell({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      {detail ? (
        <p className="text-sm text-muted-foreground">{detail}</p>
      ) : null}
      {children}
    </main>
  );
}

export default function ResultPage({ params }: Props) {
  return (
    <Suspense fallback={<Shell title="載入中…" />}>
      <ResultContent params={params} />
    </Suspense>
  );
}

function formatAmount(amount: number): string {
  return `NT$${amount.toLocaleString("en-US")}`;
}

async function ResultContent({ params }: Props) {
  await connection();
  const { token } = await params;

  // 顯示用：以 checkout_token 直接查（公開、無 session，Drizzle 直連繞過 RLS）。
  // 付款狀態以 ReturnURL 寫入的 status 為準，此頁不寫入。
  const [payment] = await db
    .select()
    .from(ecpay_payments)
    .where(eq(ecpay_payments.checkout_token, token))
    .limit(1);

  if (!payment) notFound();

  if (payment.status === "paid") {
    return (
      <Shell
        title="付款成功"
        detail={`${payment.description}　${formatAmount(payment.amount)} 已完成付款，感謝您！`}
      />
    );
  }

  if (payment.status === "failed") {
    return (
      <Shell
        title="付款未完成"
        detail="這筆付款未成功完成。若您的帳戶已遭扣款，請與我們聯繫；或重新嘗試付款。"
      />
    );
  }

  if (payment.status === "expired") {
    return (
      <Shell
        title="付款連結已過期"
        detail="這條收款連結已超過有效期限，請向我們索取新的連結。"
      />
    );
  }

  // pending：ReturnURL 可能尚未送達，短暫輪詢等待確認。
  return (
    <Shell
      title="付款確認中…"
      detail="正在向綠界確認付款結果，請稍候，本頁會自動更新。"
    >
      <ResultAutoRefresh token={token} />
    </Shell>
  );
}
