import type { Metadata } from "next";
import Link from "next/link";
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
  const ctaHref = "/apply";

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
        <div className="space-y-5 rounded-2xl bg-slate-50 p-6 text-sm leading-relaxed text-slate-500 md:p-8">
          <div>
            <p className="mb-2 font-medium text-slate-700">設立登記</p>
            <div className="space-y-1.5">
              <p>※ 費用（含稅）依公司型態而定：{REGISTRATION_PRICING_NOTE}</p>
              <p>※ 資本額 400 萬以內之規費皆已包含。超過 400 萬，（依法規）每 4,000 元規費 1 元需自行負擔。</p>
              <p>※ 不含勞健保加退保、公司法 22-1 申報。</p>
            </div>
          </div>
          <div>
            <p className="mb-2 font-medium text-slate-700">記帳報稅</p>
            <div className="space-y-1.5">
              <p>※ 不論年繳或月繳，皆收取 13 個月費用（第 13 個月為年度營所稅結算申報費用）。</p>
              <p>※ 紙本發票若超過 50 張，每 50 張額外酌收 NT$420 處理費。</p>
              <p>※ 本方案專為書審、所得額標準客戶設計，如年度申報時改採「核實申報」，每月月費將加收 NT$1,000。</p>
              <div>
                <p>※ 每年年度申報時，本所將主動為您比較「書審申報」與「核實申報」何者較省稅，並評估國稅局抽查的可能性。</p>
                <ul className="mt-1.5 list-disc pl-8 space-y-1">
                  <li>不會強制採用核實申報，最終由您決定。</li>
                  <li>若確認改採核實申報，將視情況補收與書審之間的<Link href="/faq#snapbooks-service" className="underline underline-offset-2 hover:text-slate-700">月費差額</Link>。</li>
                </ul>
              </div>
            </div>
          </div>
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
