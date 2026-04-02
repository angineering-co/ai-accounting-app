import type { Metadata } from "next";
import { heroTitle } from "@/lib/styles/tools";
import { CompanySetupCheckClient } from "@/components/company-setup-check-client";

export const metadata: Metadata = {
  title: "公司設立健檢｜速博 SnapBooks.ai 小工具",
  description:
    "免費線上公司設立健檢工具，1 分鐘回答簡單問題，自動產生專屬企業設立藍圖與稅務建議。",
  alternates: { canonical: "https://snapbooks.ai/tools/company-setup-check" },
};

export default function CompanySetupCheckPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-slate-50 to-sky-50 pt-14 pb-8 md:pt-20 md:pb-10">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
        <div className="relative mx-auto max-w-5xl px-5">
          <h1 className={heroTitle}>
            公司設立健檢
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            花 1 分鐘回答幾個簡單問題，取得專屬的企業設立藍圖與稅務建議。
          </p>
        </div>
      </section>

      {/* Tool */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:py-14">
        <CompanySetupCheckClient />
      </section>
    </main>
  );
}
