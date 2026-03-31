import type { Metadata } from "next";
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
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-slate-50 to-emerald-50 pt-20 pb-12 md:pt-28 md:pb-16">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
        <div className="relative mx-auto max-w-5xl px-5">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
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
      </section>
    </main>
  );
}
