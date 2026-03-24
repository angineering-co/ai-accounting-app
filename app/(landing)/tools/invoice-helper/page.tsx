import type { Metadata } from "next";
import { InvoiceHelperClient } from "@/components/invoice-helper-client";

export const metadata: Metadata = {
  title: "手開發票小幫手｜速博 SnapBooks.ai 小工具",
  description:
    "免費線上手開統一發票輔助工具，即時預覽發票格式，支援二聯式與三聯式統一發票。",
  alternates: { canonical: "https://snapbooks.ai/tools/invoice-helper" },
};

export default function InvoiceHelperPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sky-50 via-slate-50 to-emerald-50 pt-20 pb-12 md:pt-28 md:pb-16">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
        <div className="relative mx-auto max-w-5xl px-5">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            手開發票小幫手
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            填寫發票資訊，即時預覽手開統一發票格式，支援二聯式與三聯式。
          </p>
        </div>
      </section>

      {/* Tool */}
      <section className="mx-auto max-w-5xl px-5 py-10 md:py-14">
        <InvoiceHelperClient />
      </section>
    </main>
  );
}
