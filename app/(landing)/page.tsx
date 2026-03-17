import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LandingPricingSection } from "@/components/landing-pricing-section";
import { CheckCircle2, Smartphone, ShieldCheck, Zap } from "lucide-react";

import { CurrentYear } from "@/components/current-year";

export const metadata: Metadata = {
  title: "SnapBooks.ai (速博) | 台灣第一家 AI 記帳事務所",
  description:
    "SnapBooks.ai (速博智慧有限公司) 協助一人公司與小型團隊，拍照上傳單據與 AI 整理流程，更快完成記帳與報稅。",
  keywords: [
    "snapbooks",
    "snapbooks.ai",
    "速博",
    "AI 記帳事務所",
    "台灣",
    "記帳",
    "報稅",
  ],
  alternates: {
    canonical: "https://snapbooks.ai",
  },
  openGraph: {
    title: "SnapBooks.ai (速博) | 台灣第一家 AI 記帳事務所",
    description:
      "拍照上傳單據與 AI 整理流程，更快完成記帳與報稅。專為台灣企業打造！",
    url: "https://snapbooks.ai",
    siteName: "SnapBooks.ai",
    type: "website",
    images: [
      {
        url: "https://snapbooks.ai/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "SnapBooks.ai",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SnapBooks.ai (速博) | 台灣第一家 AI 記帳事務所",
    description: "拍照上傳單據與 AI 整理流程，更快完成記帳與報稅。",
    images: ["https://snapbooks.ai/twitter-image.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": ["Organization", "ProfessionalService"],
  name: "SnapBooks.ai",
  alternateName: ["速博", "速博智慧有限公司", "SnapBooks"],
  url: "https://snapbooks.ai",
  logo: "https://snapbooks.ai/snapbooks.svg",
  description:
    "SnapBooks.ai (速博) 是一家專為台灣企業打造的 AI 記帳事務所，結合自動化技術與會計師實務經驗。",
  address: {
    "@type": "PostalAddress",
    streetAddress: "五權路1-67號11樓之5",
    addressLocality: "西區",
    addressRegion: "台中市",
    addressCountry: "TW",
  },
  founder: [
    {
      "@type": "Person",
      name: "黃勝平 Joe",
    },
    {
      "@type": "Person",
      name: "王致昂 Ang",
    },
  ],
};

export default function Home() {
  const earlyAdopterFormUrl = process.env.NEXT_PUBLIC_EARLY_ADOPTER_FORM_URL;
  const hasFormUrl = Boolean(earlyAdopterFormUrl);
  const ctaHref = hasFormUrl ? earlyAdopterFormUrl : "#signup-unavailable";

  return (
    <div className="min-h-screen bg-white selection:bg-emerald-100 selection:text-emerald-900 font-sans text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Sticky Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-100/50 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <Link href="/" aria-label="SnapBooks.ai">
            <Image
              src="/snapbooks.svg"
              alt="SnapBooks.ai 速博 Logo"
              width={182}
              height={60}
              className="h-10 w-auto"
            />
          </Link>
          <div className="flex items-center gap-4 md:gap-6">
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <Link
                href="#features"
                className="hover:text-slate-900 transition-colors"
              >
                服務介紹
              </Link>
              <Link
                href="#pricing"
                className="hover:text-slate-900 transition-colors"
              >
                價格
              </Link>
              <Link
                href="/auth/login"
                className="hover:text-slate-900 transition-colors"
              >
                登入
              </Link>
            </nav>
            <Link
              href="/auth/login"
              className="md:hidden text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              登入
            </Link>
            <Button
              asChild
              size="sm"
              className="rounded-full bg-emerald-500 text-white hover:bg-slate-800 font-medium"
            >
              <a href={ctaHref} target="_blank" rel="noreferrer">
                免費評估適用方案
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-col">
        {/* Section 1: Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-sky-50 via-slate-50 to-emerald-50 pt-28 pb-32 md:pt-40 md:pb-48">
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]"></div>
          <div className="relative mx-auto max-w-5xl px-5 text-center">
            <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl/tight">
              拍照上傳發票與收據，
              <br className="hidden sm:block" />
              報稅就是那麼簡單
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-600 md:text-xl">
              SnapBooks.ai (速博) 是 AI 記帳事務所！
              <br />
              由專業會計師把關，你專注在產品和成長，帳務與報稅就交給我們。
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/60 bg-emerald-50/80 px-4 py-2 text-sm font-medium text-emerald-800 backdrop-blur-sm shadow-sm">
                💡 創業友善價 $1,200 / 月 ｜ 專業會計師 100% 審核把關
              </div>
              <Button
                asChild
                size="lg"
                className="rounded-full bg-emerald-600 text-white hover:bg-emerald-500 border-0 h-14 px-8 text-lg font-semibold shadow-lg shadow-emerald-600/20 transition-all hover:scale-105"
              >
                <a href={ctaHref} target="_blank" rel="noreferrer">
                  免費評估適用方案
                </a>
              </Button>
              {!hasFormUrl && (
                <p id="signup-unavailable" className="text-xs text-slate-500">
                  請設定 `NEXT_PUBLIC_EARLY_ADOPTER_FORM_URL` 環境變數。
                </p>
              )}
            </div>
            <div className="mt-16 flex justify-center">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-slate-200 bg-white/60 px-5 py-2.5 text-sm font-medium text-slate-700 backdrop-blur-md shadow-sm">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <span>適用年營業額 3,000 萬以下之中小企業</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Founders & Vision */}
        <section className="mx-auto max-w-5xl px-5 py-24 md:py-32">
          <div className="mx-auto mb-20 max-w-4xl text-center">
            <div className="mb-6 flex justify-center">
              <svg
                className="h-10 w-10 text-emerald-200"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
              </svg>
            </div>
            <blockquote className="text-xl leading-relaxed text-slate-700 italic md:text-2xl md:leading-loose font-medium">
              「我們深知台灣中小企業在記帳與報稅上面臨的痛點。傳統流程繁瑣，而純軟體工具又缺乏專業稅務的最終把關。
              <br />
              <br />
              SnapBooks.ai 的誕生，是因為我們相信：
              <span className="text-slate-900 not-italic font-bold">
                記帳應該像拍照一樣簡單，而報稅必須像傳統事務所一樣嚴謹。
              </span>{" "}
              我們結合了前沿的 AI 自動化技術與深厚的稅法實務經驗，打造出新型態的
              AI 記帳事務所，致力於成為企業主最可靠的後盾。」
            </blockquote>
          </div>

          <div className="grid gap-16 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-5">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full shadow-sm ring-2 ring-emerald-50">
                  <Image
                    src="/joe.jpg"
                    alt="黃勝平 Joe"
                    width={80}
                    height={80}
                    className="h-full w-full object-cover object-top scale-100"
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    黃勝平 Joe
                  </h2>
                  <p className="mt-1 font-semibold text-emerald-600">
                    共同創辦人暨稅務主理人
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-4 text-slate-600">
                <li className="flex gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                  <span className="leading-relaxed">
                    勤信聯合會計事務所 所長 (10年+ 實務經驗)
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                  <span className="leading-relaxed">
                    出身於四大會計師事務所
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                  <span className="leading-relaxed">
                    台灣會計界自動化先鋒，率先導入自動化系統化管理
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                  <span className="leading-relaxed">
                    客戶遍佈全台，深諳各行各業稅務痛點與節稅策略
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-5">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full shadow-sm ring-2 ring-emerald-50">
                  <Image
                    src="/ang.png"
                    alt="王致昂 Ang"
                    width={80}
                    height={80}
                    className="h-full w-full object-cover object-[center_5%] scale-100"
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    王致昂 Ang
                  </h2>
                  <p className="mt-1 font-semibold text-emerald-600">
                    共同創辦人暨技術負責人
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-4 text-slate-600">
                <li className="flex gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                  <span className="leading-relaxed">
                    審計雲 (AuditEasy) 創辦人
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                  <span className="leading-relaxed">
                    矽谷科技公司技術主管 (Google, Square, Carousell)
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                  <span className="leading-relaxed">
                    擁有深厚的金融科技 (FinTech) 與大型系統架構經驗
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                  <span className="leading-relaxed">
                    專注於將企業級的 AI 數據處理能力，帶入中小企業日常
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 3: Why Us & How it works */}
        <section id="features" className="bg-slate-50 py-24 md:py-32">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mb-20 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                科技與專業的完美結合，重新定義記帳體驗
              </h2>
            </div>

            <div className="grid gap-12 md:grid-cols-3 md:gap-8">
              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-sky-100 text-sky-600 shadow-sm">
                  <Smartphone className="h-10 w-10" />
                </div>
                <h3 className="mb-4 text-xl font-bold text-slate-900">
                  拍照就可報稅，AI 自動辨識
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  告別月底整理紙本的惡夢。紙本發票隨手拍，雲端電子發票無限量自動匯入。
                </p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600 shadow-sm">
                  <ShieldCheck className="h-10 w-10" />
                </div>
                <h3 className="mb-4 text-xl font-bold text-slate-900">
                  AI 輔助，專業人員覆核
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  所有的稅務申報與最終把關，皆由擁有十年實務經驗的「事務所專業團隊」親自覆核，確保絕對合規。
                </p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-100 text-indigo-600 shadow-sm">
                  <Zap className="h-10 w-10" />
                </div>
                <h3 className="mb-4 text-xl font-bold text-slate-900">
                  高效數位溝通，隨時掌握進度
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  全面導入 Line 與 Email 客服，溝通精準、紀錄完整。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Pricing */}
        <LandingPricingSection />

        {/* Section 5: How to start & CTA */}
        <section className="bg-slate-50 py-24 md:py-32">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mb-20 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                報稅升級，輕鬆上手
              </h2>
            </div>

            <div className="mx-auto mb-20 grid max-w-4xl gap-10 sm:grid-cols-2 md:grid-cols-4 md:gap-8">
              <div className="relative flex flex-col items-center text-center md:items-start md:text-left">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-600 shadow-sm">
                  1
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900">
                  填寫表單
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  留下您的公司基本資料。
                </p>
              </div>
              <div className="relative flex flex-col items-center text-center md:items-start md:text-left">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-600 shadow-sm">
                  2
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900">
                  專業評估
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  我們將透過 Line/Email 確認您是否適用此優惠方案。
                </p>
              </div>
              <div className="relative flex flex-col items-center text-center md:items-start md:text-left">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-600 shadow-sm">
                  3
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900">
                  線上簽約
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  完成數位簽署與建檔。
                </p>
              </div>
              <div className="relative flex flex-col items-center text-center md:items-start md:text-left">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-600 shadow-sm">
                  4
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-900">
                  輕鬆記帳
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  開始享受「隨手拍、自動載」的全新報稅體驗！
                </p>
              </div>
            </div>

            <div className="text-center">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-emerald-500 text-white hover:bg-emerald-400 border-0 h-16 px-10 text-xl font-bold shadow-xl shadow-emerald-500/20 transition-all hover:scale-105"
              >
                <a href={ctaHref} target="_blank" rel="noreferrer">
                  立即填表，升級報稅體驗
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12 md:py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-8 px-5 md:flex-row md:items-start md:gap-0">
          <div className="flex flex-col items-center md:items-start gap-4">
            <Image
              src="/snapbooks.svg"
              alt="SnapBooks.ai 速博 Logo"
              width={182}
              height={60}
              className="h-10 w-auto"
            />
            <div className="text-sm text-slate-500 text-center md:text-left leading-relaxed">
              <p className="font-medium text-slate-700">
                SnapBooks.ai 速博智慧有限公司｜速博智慧記帳事務所
              </p>
              <p>地址：台中市西區五權路1-67號11樓之5</p>
              <p>電子信箱：snapbooks.ai@gmail.com</p>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-end gap-6">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm font-medium text-slate-500">
              <Link
                href="/terms"
                className="hover:text-slate-900 transition-colors"
              >
                服務條款
              </Link>
              <Link
                href="/privacy"
                className="hover:text-slate-900 transition-colors"
              >
                隱私權政策
              </Link>
              <Link
                href="/company"
                className="hover:text-slate-900 transition-colors"
              >
                關於我們
              </Link>
            </div>

            <div className="text-sm text-slate-400">
              &copy; <CurrentYear /> SnapBooks.ai. 速博智慧有限公司 版權所有。
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
