import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CtaLink } from "@/components/cta-link";
import { PricingSection } from "@/components/pricing-comparison-table";

export const metadata: Metadata = {
  title: "服務價格｜SnapBooks.ai 速博 - 記帳報稅 NT$1,200/月起",
  description:
    "SnapBooks.ai 記帳報稅每月 NT$1,200 起，設立登記 NT$6,000 起。透明定價，無隱藏費用。專為年營業額 3,000 萬以下中小企業設計。",
  alternates: {
    canonical: "https://snapbooks.ai/pricing",
  },
  openGraph: {
    title: "服務價格｜SnapBooks.ai 速博 - 記帳報稅 NT$1,200/月起",
    description:
      "SnapBooks.ai 記帳報稅每月 NT$1,200 起，設立登記 NT$6,000 起。透明定價，無隱藏費用。",
    url: "https://snapbooks.ai/pricing",
    siteName: "SnapBooks.ai",
    type: "website",
  },
};

export default function PricingPage() {
  const earlyAdopterFormUrl = process.env.NEXT_PUBLIC_EARLY_ADOPTER_FORM_URL;
  const ctaHref = earlyAdopterFormUrl ?? "#signup-unavailable";

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="bg-gradient-to-br from-emerald-50/60 via-slate-50 to-sky-50/40 pt-20 pb-12 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
            服務價格
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            因為 AI 大幅提升了內部效率，我們得以將省下的成本回饋給您。
            <br className="hidden md:block" />
            透明定價，無隱藏費用。
          </p>
        </div>
      </section>

      {/* Toggle + Cards + Comparison table */}
      <PricingSection />

      {/* Notes */}
      <section className="mx-auto w-full max-w-3xl px-5 py-8">
        <div className="space-y-3 rounded-2xl bg-slate-50 p-6 text-sm leading-relaxed text-slate-500 md:p-8">
          <p>※ 年繳方案 NT$1,200/月，一年收取 13 個月費用（第 13 個月為年度營所稅結算申報費用）；月繳方案 NT$1,400/月。</p>
          <p>※ 本方案專為「年營業額 3,000 萬以下」之中小企業/一人公司設計。</p>
          <p>※ 紙本發票若超過 50 張，每 50 張額外酌收 NT$400 處理費。</p>
          <p>※ 不含勞健保投保、公司法 22-1 申報。</p>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24 pt-8 md:pb-36 md:pt-12">
        <div className="text-center">
          <Button
            asChild
            size="lg"
            className="group rounded-full bg-emerald-600 text-white hover:bg-emerald-500 border-0 h-16 px-10 text-xl font-bold shadow-xl shadow-emerald-600/20 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-600/30 hover:-translate-y-0.5"
          >
            <CtaLink href={ctaHref} location="pricing_cta">
              預約免費諮詢
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </CtaLink>
          </Button>
        </div>
      </section>
    </main>
  );
}
