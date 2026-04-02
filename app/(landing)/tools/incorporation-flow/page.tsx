import type { Metadata } from "next";
import { heroTitle } from "@/lib/styles/tools";
import { IncorporationFlowClient } from "@/components/incorporation-flow-client";

export const metadata: Metadata = {
  title: "開公司流程圖 - 公司與行號設立步驟全攻略｜速博 SnapBooks.ai",
  description:
    "互動式公司設立流程圖，完整呈現公司與行號的設立步驟、所需時間與常見問題。從名稱預查到稅籍登記，一步步帶你了解開公司的完整流程。",
  keywords: [
    "開公司流程",
    "公司設立",
    "行號設立",
    "公司登記",
    "設立流程圖",
    "名稱預查",
    "資本額驗資",
    "統一編號",
    "稅籍登記",
    "創業",
  ],
  alternates: {
    canonical: "https://snapbooks.ai/tools/incorporation-flow",
  },
};

export default function IncorporationFlowPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-slate-50 to-emerald-50 pt-14 pb-8 md:pt-20 md:pb-10">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
        <div className="relative mx-auto max-w-5xl px-5">
          <h1 className={heroTitle}>
            開公司流程圖
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            互動式流程圖，帶你一步步了解公司與行號的設立步驟、所需時間與注意事項。
          </p>
        </div>
      </section>

      {/* Tool */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:py-14">
        <IncorporationFlowClient />
      </section>
    </main>
  );
}
