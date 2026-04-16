import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { heroTitle } from "@/lib/styles/tools";
import { Button } from "@/components/ui/button";
import { CtaLink } from "@/components/cta-link";
import { StartupGuideHub } from "@/components/startup-guide-hub";

export const metadata: Metadata = {
  title: "創業必看｜開公司完整攻略 - 速博 SnapBooks.ai",
  description:
    "從公司設立健檢、行號 vs 公司稅負比較、到設立流程圖，三個免費互動工具帶你完成創業決策。",
  keywords: [
    "創業",
    "開公司",
    "行號",
    "公司設立",
    "創業攻略",
    "稅負比較",
    "設立流程",
    "台灣創業",
  ],
  alternates: {
    canonical: "https://snapbooks.ai/startup-guide",
  },
  openGraph: {
    title: "創業必看｜開公司完整攻略 - 速博 SnapBooks.ai",
    description:
      "從公司設立健檢、行號 vs 公司稅負比較、到設立流程圖，三個免費互動工具帶你完成創業決策。",
    url: "https://snapbooks.ai/startup-guide",
    siteName: "SnapBooks.ai",
    type: "website",
    images: [
      {
        url: "https://snapbooks.ai/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "創業必看｜速博 SnapBooks.ai",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "創業必看｜開公司完整攻略 - 速博 SnapBooks.ai",
    description:
      "從公司設立健檢、行號 vs 公司稅負比較、到設立流程圖，三個免費互動工具帶你完成創業決策。",
    images: ["https://snapbooks.ai/opengraph-image.png"],
  },
};

export default function StartupGuidePage() {
  const ctaHref = "/apply";

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="grain relative overflow-hidden bg-gradient-to-br from-amber-50 via-slate-50 to-emerald-50 pt-14 pb-8 md:pt-20 md:pb-10">
        <div className="absolute -top-40 -right-40 h-[400px] w-[400px] rounded-full bg-amber-200/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[300px] w-[300px] rounded-full bg-emerald-200/20 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-5">
          <h1 className={heroTitle}>
            創業必看
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-600 md:text-xl">
            準備開公司或設行號？跟著三個步驟，從健檢評估、稅負試算到流程總覽，一次搞懂創業該知道的事。
          </p>
        </div>
      </section>

      {/* Journey Steps */}
      <section className="mx-auto max-w-3xl px-5 py-12 md:py-16">
        <StartupGuideHub />
      </section>

      {/* Final CTA */}
      <section className="border-t border-slate-100 bg-gradient-to-br from-emerald-50/50 via-white to-sky-50/50 py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            需要專業協助？
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            設立公司的細節很多，讓專業會計師幫你把關，少走冤枉路。
          </p>
          <div className="mt-8">
            <Button
              asChild
              size="lg"
              className="group rounded-full bg-emerald-600 text-white hover:bg-emerald-500 border-0 h-14 px-8 text-lg font-semibold shadow-lg shadow-emerald-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5"
            >
              <CtaLink href={ctaHref} location="startup_guide_cta">
                立即申請
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </CtaLink>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
