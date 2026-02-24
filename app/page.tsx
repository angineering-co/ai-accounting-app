import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function Home() {
  const earlyAdopterFormUrl = process.env.NEXT_PUBLIC_EARLY_ADOPTER_FORM_URL;
  const hasFormUrl = Boolean(earlyAdopterFormUrl);

  const ctaHref = hasFormUrl ? earlyAdopterFormUrl : "#signup-unavailable";

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50/70 via-background to-emerald-50/40">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-5 py-10 md:py-16">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="SnapBooks.ai">
            <Image
              src="/snapbooks-wordmark.svg"
              alt="SnapBooks.ai"
              width={800}
              height={180}
              className="h-12 w-auto md:h-16"
            />
          </Link>
          <Button asChild size="sm">
            <a href={ctaHref} target="_blank" rel="noreferrer">
              立即加入早期試用
            </a>
          </Button>
        </header>

        <section className="space-y-6 rounded-2xl border border-sky-100/80 bg-white/85 p-6 shadow-sm backdrop-blur md:p-8">
          <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700">
            給一人公司與小型創業團隊
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            拍照上傳發票與收據，我們的 AI 會更快幫你完成記帳與報稅
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            SnapBooks.ai 是一家 AI 記帳事務所！
            <br />
            你專注在產品和成長，帳務與報稅就交給我們。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <a href={ctaHref} target="_blank" rel="noreferrer">
                立即加入早期試用
              </a>
            </Button>
            <p className="text-sm text-muted-foreground">
              填寫 Google 表單，我們會主動聯繫你
            </p>
          </div>
          {!hasFormUrl ? (
            <p
              id="signup-unavailable"
              className="rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
            >
              尚未設定 `NEXT_PUBLIC_EARLY_ADOPTER_FORM_URL`，請先補上 Google
              Form 連結。
            </p>
          ) : null}
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-semibold tracking-tight">
            每到報稅期就被流程綁住
          </h2>
          <p className="text-sm text-muted-foreground">
            SnapBooks.ai
            正在和早期用戶一起解決這些痛點。你的回饋會直接影響我們產品優先順序！
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 rounded-xl border p-5">
              <h3 className="font-medium text-sky-900">
                紙本收據保存不易
              </h3>
              <p className="text-sm leading-6">
                單據分散在包包、抽屜、信封，報稅前才一次整理，耗時又容易不見。
              </p>
            </div>
            <div className="space-y-2 rounded-xl border p-5">
              <h3 className="font-medium text-indigo-900">
                寄送與交接流程太線下化
              </h3>
              <p className="text-sm leading-6">
                到了申報月份，還要整理實體單據、寄送給事務所、等待確認與補件。
              </p>
            </div>
            <div className="space-y-2 rounded-xl border p-5">
              <h3 className="font-medium text-emerald-900">
                人在外地時成本更高
              </h3>
              <p className="text-sm leading-6">
                Digital Nomad 或常出差時，紙本流程幾乎無法順暢進行，時間被拖住。
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            加入 SnapBooks.ai 早期試用
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            只要填一份 Google
            表單，我們會安排後續聯繫，優先邀請符合情境的團隊加入。
          </p>
          <div className="mt-6">
            <Button asChild size="lg">
              <a href={ctaHref} target="_blank" rel="noreferrer">
                立即填寫早期試用表單
              </a>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
