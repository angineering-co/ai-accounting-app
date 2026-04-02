import type { Metadata } from "next";
import { heroTitle } from "@/lib/styles/tools";
import { InsuranceCalculatorClient } from "@/components/insurance-calculator-client";

export const metadata: Metadata = {
  title: "勞健保計算機 - 勞保、健保、勞退雇主負擔試算｜速博 SnapBooks.ai",
  description:
    "免費線上勞健保計算機，輸入員工薪資即時試算勞保、健保、勞退及職災保險的個人與雇主負擔金額，支援 114/115 年度級距。",
  keywords: [
    "勞健保計算機",
    "勞保",
    "健保",
    "勞退",
    "勞工保險",
    "全民健保",
    "勞工退休金",
    "雇主負擔",
    "投保級距",
    "職災保險",
  ],
  alternates: { canonical: "https://snapbooks.ai/tools/insurance-calculator" },
};

export default function InsuranceCalculatorPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-slate-50 to-emerald-50 pt-14 pb-8 md:pt-20 md:pb-10">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
        <div className="relative mx-auto max-w-5xl px-5">
          <h1 className={heroTitle}>
            勞健保計算機
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            輸入員工薪資，即時試算勞保、健保、勞退及職災保險的個人與雇主每月負擔金額。
          </p>
        </div>
      </section>

      {/* Tool */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:py-14">
        <InsuranceCalculatorClient />
      </section>
    </main>
  );
}
