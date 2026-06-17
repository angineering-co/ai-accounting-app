import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

/**
 * 公開收款頁（checkout / 結果頁）共用的品牌外殼。無登入、是客戶對 SnapBooks 的
 * 第一印象，故套用與行銷站一致的標誌與色系（emerald 主色、Noto Serif TC 標題）。
 */
export type PayTone = "default" | "pending" | "success" | "error";

function ToneIcon({ tone }: { tone: PayTone }) {
  if (tone === "success") {
    return <CheckCircle2 className="size-12 text-emerald-600" />;
  }
  if (tone === "error") {
    return <AlertCircle className="size-12 text-amber-600" />;
  }
  if (tone === "pending") {
    return <Loader2 className="size-12 animate-spin text-emerald-600" />;
  }
  return null;
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
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-md items-center px-5">
          <Link href="/" aria-label="SnapBooks.ai 速博">
            <Image
              src="/snapbooks.svg"
              alt="SnapBooks.ai 速博"
              width={165}
              height={48}
              className="h-10 w-auto"
              priority
              unoptimized
            />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 py-12">
        <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
          <ToneIcon tone={tone} />
          <h1 className="font-display text-2xl font-semibold text-slate-900">
            {title}
          </h1>
          {detail ? (
            <p className="text-base text-muted-foreground">{detail}</p>
          ) : null}
          {children ? <div className="w-full pt-2">{children}</div> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          SnapBooks.ai 速博 · 安全收款
        </p>
      </main>
    </div>
  );
}
