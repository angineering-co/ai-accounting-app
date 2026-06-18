import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck } from "lucide-react";

/**
 * 公開收款頁（checkout / 結果頁）共用的品牌外殼。無登入、是客戶對 SnapBooks 的
 * 第一印象，故套用與行銷站一致的視覺語言（emerald 主色漸層、grain 質感、blob 裝飾、
 * Noto Serif TC 標題、脈動徽章），讓收款頁也帶有品牌溫度而非單純放一顆 logo。
 */
export type PayTone = "default" | "pending" | "success" | "error";

const TONE_HALO: Record<PayTone, string> = {
  default: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  pending: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  success: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  error: "bg-amber-50 text-amber-600 ring-amber-100",
};

function ToneIcon({ tone }: { tone: PayTone }) {
  if (tone === "default") return null;
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "error"
        ? AlertCircle
        : Loader2;
  return (
    <div
      className={`flex size-20 items-center justify-center rounded-3xl ring-8 ${TONE_HALO[tone]}`}
    >
      <Icon className={`size-10 ${tone === "pending" ? "animate-spin" : ""}`} />
    </div>
  );
}

export function PayShell({
  title,
  detail,
  tone = "default",
  children,
}: {
  title: string;
  detail?: string;
  tone?: PayTone;
  children?: React.ReactNode;
}) {
  return (
    <div className="grain relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-emerald-50 via-slate-50 to-sky-50">
      {/* 裝飾性暈染光暈，與行銷站 hero 一致 */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-[460px] w-[460px] rounded-full bg-emerald-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-40 h-[420px] w-[420px] rounded-full bg-sky-200/25 blur-3xl" />

      <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
        {/* ECPay 商店招牌 banner：與綠界結帳頁出現的招牌一致，建立跨頁信任感 */}
        <Link
          href="/"
          aria-label="SnapBooks.ai 速博 速博智慧有限公司"
          className="animate-fade-up w-full overflow-hidden rounded-2xl border border-white/60 shadow-lg shadow-emerald-900/5"
        >
          <Image
            src="/snapbooks-ecpay-banner.png"
            alt="SnapBooks.ai 速博智慧有限公司｜記帳事務所　拍照上傳憑證，專業會計師把關"
            width={1000}
            height={200}
            className="h-auto w-full"
            priority
            unoptimized
          />
        </Link>

        <div className="animate-fade-up delay-100 flex w-full flex-col items-center gap-5 rounded-3xl border border-white/60 bg-white/80 p-10 text-center shadow-xl shadow-emerald-900/5 backdrop-blur-sm md:p-12">
          <ToneIcon tone={tone} />

          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          {detail ? (
            <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
              {detail}
            </p>
          ) : null}
          {children ? <div className="w-full pt-2">{children}</div> : null}
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <p className="inline-flex items-center gap-1.5 text-base font-medium text-slate-600">
            <ShieldCheck className="size-4 text-emerald-600" />
            綠界金流．全程加密交易
          </p>
          <p className="text-sm text-slate-400">
            <Link href="/terms" className="hover:text-emerald-600 transition-colors">
              服務條款
            </Link>
            <span className="px-1.5">·</span>
            <Link href="/privacy" className="hover:text-emerald-600 transition-colors">
              隱私權政策
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
