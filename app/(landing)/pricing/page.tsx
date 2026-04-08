import type { Metadata } from "next";
import { ArrowRight, TicketPercent } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CouponDialog } from "@/components/coupon-dialog";
import { CtaLink } from "@/components/cta-link";
import { PricingSection } from "@/components/pricing-comparison-table";
import { REGISTRATION_PRICING_NOTE } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "服務價格｜SnapBooks.ai 速博 - 記帳報稅 NT$1,260/月起",
  description:
    "SnapBooks.ai 記帳報稅每月 NT$1,260 起，設立登記 NT$6,500 起。透明定價，無隱藏費用。專為年營業額 3,000 萬以下中小企業設計。",
  alternates: {
    canonical: "https://snapbooks.ai/pricing",
  },
  openGraph: {
    title: "服務價格｜SnapBooks.ai 速博 - 記帳報稅 NT$1,260/月起",
    description:
      "SnapBooks.ai 記帳報稅每月 NT$1,260 起，設立登記 NT$6,500 起。透明定價，無隱藏費用。",
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
            顛覆業界的透明定價
          </p>
        </div>
      </section>

      {/* Toggle + Cards + Comparison table */}
      <PricingSection />

      {/* Notes */}
      <section className="mx-auto w-full max-w-3xl px-5 py-8">
        <div className="space-y-3 rounded-2xl bg-slate-50 p-6 text-sm leading-relaxed text-slate-500 md:p-8">
          <p>※ 設立：依公司型態而定：{REGISTRATION_PRICING_NOTE} </p>
          <p>※ 記帳：不論年繳或月繳，皆收取 13 個月費用（第 13 個月為年度營所稅結算申報費用）。</p>
          <p>※ 本方案專為「年營業額 3,000 萬以下」之中小企業設計。</p>
          <p>※ 紙本發票若超過 50 張，每 50 張額外酌收 NT$420 處理費。</p>
          <p>※ 不含勞健保投保、公司法 22-1 申報。</p>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24 pt-8 md:pb-36 md:pt-12">
        <div className="flex flex-col items-center gap-5 text-center">
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
          <CouponDialog
            location="pricing_cta"
            trigger={
              <button className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50/70 px-5 py-2 text-sm font-medium text-amber-800 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <TicketPercent className="h-4 w-4 text-amber-600" />
                加入 Line 好友，享設立登記 NT$1,000 折扣
              </button>
            }
          />
        </div>
      </section>
    </main>
  );
}
