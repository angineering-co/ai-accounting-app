import type { Metadata } from "next";
import { TaxCalculatorClient } from "@/components/tax-calculator-client";

export const metadata: Metadata = {
  title: "創業節稅試算｜速博 SnapBooks.ai 小工具",
  description:
    "免費線上行號與公司稅負比較計算機，輸入營業額與淨利率，即時試算兩種組織型態的綜合所得稅與營所稅差異。",
  alternates: { canonical: "https://snapbooks.ai/tools/tax-calculator" },
};

export default function TaxCalculatorPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sky-50 via-slate-50 to-emerald-50 pt-20 pb-12 md:pt-28 md:pb-16">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
        <div className="relative mx-auto max-w-5xl px-5">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            創業節稅試算
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            準備創業但還不確定要設行號還是開公司？輸入預估營業額，立即看兩種組織型態的稅金差多少。
          </p>
        </div>
      </section>

      {/* Tool */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:py-14">
        <TaxCalculatorClient />
        <p className="mt-6 text-center text-sm text-slate-500">
          (免責聲明)本計算表僅供參考，實際情況可能依照股利分配政策、撫養親屬狀況等有所不同
        </p>
      </section>
    </main>
  );
}
