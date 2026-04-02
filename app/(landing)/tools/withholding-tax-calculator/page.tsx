import type { Metadata } from "next";
import { heroTitle } from "@/lib/styles/tools";
import { WithholdingTaxCalculatorClient } from "@/components/withholding-tax-calculator-client";

export const metadata: Metadata = {
  title: "扣繳計算機 - 勞報單、勞務報酬、租金扣繳試算｜速博 SnapBooks.ai",
  description:
    "免費線上扣繳計算機，輸入金額即時試算代扣稅額與二代健保補充保費。支援勞務報酬、執行業務所得與租金扣繳，可下載勞報單(勞務報酬單) PDF。",
  keywords: [
    "扣繳計算機",
    "勞報單",
    "勞務報酬單",
    "勞務報酬",
    "扣繳",
    "代扣稅額",
    "二代健保",
    "健保補充保費",
    "執行業務所得",
    "租金扣繳",
    "扣繳試算",
  ],
  alternates: { canonical: "https://snapbooks.ai/tools/withholding-tax-calculator" },
};

export default function WithholdingTaxCalculatorPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-slate-50 to-emerald-50 pt-14 pb-8 md:pt-20 md:pb-10">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
        <div className="relative mx-auto max-w-5xl px-5">
          <h1 className={heroTitle}>
            扣繳計算機
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            輸入金額，即時試算勞務報酬、執行業務所得與租金的代扣稅額及二代健保補充保費，並可下載勞報單。
          </p>
        </div>
      </section>

      {/* Tool */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:py-14">
        <WithholdingTaxCalculatorClient />
        <p className="mt-6 text-center text-sm text-slate-500">
          (免責聲明)本計算表僅供參考，實際情況可能依照股利分配政策、撫養親屬狀況等有所不同
        </p>
      </section>
    </main>
  );
}
