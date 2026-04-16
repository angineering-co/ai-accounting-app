import type { Metadata } from "next";
import { ApplyFormClient } from "@/components/apply-form-client";

export const metadata: Metadata = {
  title: "線上申請｜公司設立與記帳服務 - 速博 SnapBooks.ai",
  description:
    "線上申請公司設立登記或委託記帳報稅服務。填寫簡單表單，加入 LINE 好友即刻開始。商行 NT$6,500 起、記帳 NT$1,260/月起。",
  alternates: {
    canonical: "https://snapbooks.ai/apply",
  },
  openGraph: {
    title: "線上申請｜公司設立與記帳服務 - 速博 SnapBooks.ai",
    description:
      "線上申請公司設立登記或委託記帳報稅服務。填寫簡單表單，加入 LINE 好友即刻開始。",
    url: "https://snapbooks.ai/apply",
    siteName: "SnapBooks.ai",
    type: "website",
  },
};

export default function ApplyPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="bg-gradient-to-br from-emerald-50/60 via-slate-50 to-sky-50/40 pt-16 pb-10 md:pt-20 md:pb-12">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl lg:text-5xl">
            合作申請
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
            填寫以下表單，我們會透過 LINE 與您聯繫，提供最適合的服務方案。
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="mx-auto max-w-2xl px-5 py-10 md:py-14">
        <ApplyFormClient />
      </section>
    </main>
  );
}
