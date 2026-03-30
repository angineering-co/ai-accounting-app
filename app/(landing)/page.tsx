import type { Metadata } from "next";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { CtaLink } from "@/components/cta-link";
import { LandingPricingSection } from "@/components/landing-pricing-section";
import {
  CheckCircle2,
  Smartphone,
  ShieldCheck,
  Zap,
  ArrowRight,
  FileText,
  ClipboardCheck,
  PenLine,
  Camera,
  Quote,
} from "lucide-react";

export const metadata: Metadata = {
  title: "AI 記帳事務所推薦｜速博 SnapBooks - 每月$1,200，專業會計師把關",
  description:
    "速博 SnapBooks.ai — 拍照上傳發票，AI 自動辨識，專業會計師 100% 覆核。適合年營業額 3,000 萬以下中小企業，每月 NT$1,200 起。",
  keywords: [
    "snapbooks",
    "snapbooks.ai",
    "速博",
    "AI 記帳事務所",
    "記帳事務所推薦",
    "一人公司記帳",
    "記帳費用",
    "電商報稅",
    "台灣",
    "記帳",
    "報稅",
  ],
  alternates: {
    canonical: "https://snapbooks.ai",
  },
  openGraph: {
    title: "AI 記帳事務所推薦｜速博 SnapBooks - 每月$1,200，專業會計師把關",
    description:
      "速博 SnapBooks.ai — 拍照上傳發票，AI 自動辨識，專業會計師 100% 覆核。適合年營業額 3,000 萬以下中小企業，每月 NT$1,200 起。",
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
    title: "AI 記帳事務所推薦｜速博 SnapBooks - 每月$1,200，專業會計師把關",
    description:
      "速博 SnapBooks.ai — 拍照上傳發票，AI 自動辨識，專業會計師 100% 覆核。適合年營業額 3,000 萬以下中小企業，每月 NT$1,200 起。",
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
  const ctaHref = earlyAdopterFormUrl ?? "#signup-unavailable";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="flex flex-1 flex-col">
        {/* ── Hero ── */}
        <section className="grain relative overflow-hidden bg-gradient-to-br from-emerald-50 via-slate-50 to-sky-50 pt-28 pb-36 md:pt-44 md:pb-56">
          {/* Decorative blobs */}
          <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-emerald-200/30 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-sky-200/20 blur-3xl" />

          <div className="relative mx-auto max-w-5xl px-5 text-center">
            <div className="animate-fade-up">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200/60 bg-white/70 px-5 py-2 text-sm font-medium text-emerald-800 backdrop-blur-sm shadow-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                創業友善價 $1,200 / 月，專業會計師 100% 審核把關
              </p>
            </div>

            <h1 className="animate-fade-up delay-100 font-display mx-auto max-w-4xl text-4xl font-black tracking-tight text-slate-900 sm:text-5xl md:text-6xl/[1.15]">
              拍照上傳發票與收據，
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                報稅就是那麼簡單
              </span>
            </h1>

            <p className="animate-fade-up delay-200 mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-600 md:text-xl">
              SnapBooks.ai (速博) 是 智慧記帳事務所
              <br className="hidden md:block" />
              由專業會計師把關，你專注在產品和成長，帳務與報稅就交給我們。
            </p>

            <div className="animate-fade-up delay-300 mt-12 flex flex-col items-center justify-center gap-5">
              <Button
                asChild
                size="lg"
                className="group rounded-full bg-emerald-600 text-white hover:bg-emerald-500 border-0 h-14 px-8 text-lg font-semibold shadow-lg shadow-emerald-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5"
              >
                <CtaLink href={ctaHref} location="hero">
                  免費評估適用方案
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </CtaLink>
              </Button>
              {!hasFormUrl && (
                <p
                  id="signup-unavailable"
                  className="text-xs text-slate-500"
                >
                  請設定 `NEXT_PUBLIC_EARLY_ADOPTER_FORM_URL` 環境變數。
                </p>
              )}
            </div>

            <div className="animate-fade-up delay-400 mt-16">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-slate-200/80 bg-white/60 px-5 py-2.5 text-sm font-medium text-slate-600 backdrop-blur-md shadow-sm">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <span>適用年營業額 3,000 萬以下之中小企業</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Founders & Vision ── */}
        <section className="mx-auto max-w-5xl px-5 py-24 md:py-36">
          <div className="mx-auto mb-24 max-w-3xl">
            <div className="mb-8 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-300">
                <svg
                  className="h-8 w-8"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
              </div>
            </div>
            <blockquote className="text-center font-display text-xl leading-relaxed text-slate-700 italic md:text-2xl md:leading-[1.8] font-normal">
              <span className="font-bold text-slate-900 not-italic">記帳像拍照一樣簡單，報稅像事務所一樣嚴謹。</span>
            </blockquote>
            <p className="mt-6 text-center text-lg leading-relaxed text-slate-600 md:text-xl md:leading-relaxed">
              AI 自動化 + 專業稅務把關 = 專為台灣中小企業打造的新型態記帳事務所。
            </p>
          </div>

          <div className="grid gap-16 md:grid-cols-2 md:gap-12">
            {/* Joe */}
            <div className="group rounded-3xl border border-slate-100 bg-gradient-to-b from-slate-50/80 to-white p-8 transition-all duration-300 hover:border-emerald-100 hover:shadow-lg hover:shadow-emerald-50">
              <div className="flex items-center gap-5">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl shadow-md ring-4 ring-white transition-transform duration-300 group-hover:scale-105">
                  <Image
                    src="/joe.jpg"
                    alt="黃勝平 Joe"
                    width={80}
                    height={80}
                    className="h-full w-full object-cover object-top"
                  />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold text-slate-900">
                    黃勝平 Joe
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-emerald-600">
                    共同創辦人暨稅務主理人
                  </p>
                </div>
              </div>
              <ul className="mt-6 space-y-3.5 text-slate-600">
                <li className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="leading-relaxed">
                    勤信聯合會計事務所 所長 (10年+ 實務經驗)
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="leading-relaxed">
                    出身於四大會計師事務所
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="leading-relaxed">
                    台灣會計界自動化先鋒，率先導入自動化系統化管理
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="leading-relaxed">
                    客戶遍佈全台，深諳各行各業稅務痛點與節稅策略
                  </span>
                </li>
              </ul>
            </div>

            {/* Ang */}
            <div className="group rounded-3xl border border-slate-100 bg-gradient-to-b from-slate-50/80 to-white p-8 transition-all duration-300 hover:border-emerald-100 hover:shadow-lg hover:shadow-emerald-50">
              <div className="flex items-center gap-5">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl shadow-md ring-4 ring-white transition-transform duration-300 group-hover:scale-105">
                  <Image
                    src="/ang.png"
                    alt="王致昂 Ang"
                    width={80}
                    height={80}
                    className="h-full w-full object-cover object-[center_5%]"
                  />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold text-slate-900">
                    王致昂 Ang
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-emerald-600">
                    共同創辦人暨技術負責人
                  </p>
                </div>
              </div>
              <ul className="mt-6 space-y-3.5 text-slate-600">
                <li className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="leading-relaxed">
                    AI 自動化顧問、深耕事務所自動化
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="leading-relaxed">
                    Fintech 矽谷工程師 (Block, Google)
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="leading-relaxed">
                    擁有深厚的金融科技與大型系統架構經驗
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="leading-relaxed">
                    專注於將企業級的 AI 帶入中小企業日常
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── Testimonials ── */}
        <section className="bg-gradient-to-br from-emerald-50/50 via-white to-sky-50/50 py-24 md:py-36">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mb-20 text-center">
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-600">
                Testimonials
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                他們都選擇了 SnapBooks
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-600">
                從一人公司到連鎖企業，聽聽真實客戶怎麼說
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
              {[
                {
                  name: "小凱",
                  title: "自由視覺設計師",
                  quote: "一張照片，搞定我的數位遊牧生活！",
                  body: "我是自媒體經營者，常常忙著忙著就忘了時間，SnapBooks會自動提醒我報稅的時間，而且也只要上傳圖片就可以完成報稅，很適合我這種常常在外面跑來跑去的工作者。",
                },
                {
                  name: "Emma",
                  title: "程式設計師",
                  quote: "合理的價格，超值的服務",
                  body: "一人公司預算有限，再也不用為了幾張憑證付昂貴記帳費。價格直接砍半，CP 值高到讓我懷疑以前是不是多付了？",
                },
                {
                  name: "蔡桃貴",
                  title: "手作甜點工作室",
                  quote: "報稅只要 30 秒？憑證不會丟！",
                  body: "每次常常都找不到發票，怕漏掉少抵稅，後來都拍拍照好了，原始憑證在我這邊，不擔心弄丟，要跟廠商對帳也不用等事務所回復！",
                },
              ].map(({ name, title, quote, body }) => (
                <div
                  key={name}
                  className="group rounded-3xl border border-slate-100 bg-gradient-to-b from-slate-50/80 to-white p-8 transition-all duration-300 hover:border-emerald-100 hover:shadow-lg hover:shadow-emerald-50"
                >
                  <Quote className="mb-4 h-6 w-6 text-emerald-200" />
                  <p className="font-display text-xl font-bold leading-snug text-slate-900">
                    {quote}
                  </p>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">
                    {body}
                  </p>
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <p className="text-sm font-bold text-slate-900">{name}</p>
                    <p className="text-sm font-medium text-emerald-600">
                      {title}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
              {[
                {
                  name: "Mary",
                  title: "餐飲連鎖店",
                  quote: "專業數據分析，省下更多錢。",
                  body: "爬文爬了很久還是看不懂公司跟行號的差別，還好透過SnapBooks的線上試算表，讓我知道原來我適合開設行號，光是稅金一年就省了快20萬，小朋友的學費都夠付了。",
                },
                {
                  name: "Tina",
                  title: "飾品網拍賣家",
                  quote: "Line 回覆即時，問問題沒壓力",
                  body: "以前最怕打電話去事務所問問題，怕被覺得問題很蠢。SnapBooks 用 Line 溝通，隨時丟訊息就有人親切回覆，再基本的問題都會耐心解釋，真的很安心。",
                },
              ].map(({ name, title, quote, body }) => (
                <div
                  key={name}
                  className="group rounded-3xl border border-slate-100 bg-gradient-to-b from-slate-50/80 to-white p-8 transition-all duration-300 hover:border-emerald-100 hover:shadow-lg hover:shadow-emerald-50"
                >
                  <Quote className="mb-4 h-6 w-6 text-emerald-200" />
                  <p className="font-display text-xl font-bold leading-snug text-slate-900">
                    {quote}
                  </p>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">
                    {body}
                  </p>
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <p className="text-sm font-bold text-slate-900">{name}</p>
                    <p className="text-sm font-medium text-emerald-600">
                      {title}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Why Us & How it works ── */}
        <section id="features" className="grain relative bg-emerald-950 py-24 text-white md:py-36">
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-transparent" />
          <div className="relative mx-auto max-w-5xl px-5">
            <div className="mb-20 text-center">
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-400">
                Why SnapBooks
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
                科技與專業的完美結合
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-emerald-200/60">
                重新定義記帳體驗，讓你專心經營事業
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/30 hover:bg-white/[0.06]">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 transition-colors group-hover:bg-sky-500/20">
                  <Smartphone className="h-7 w-7" />
                </div>
                <h3 className="mb-3 text-lg font-bold text-white">
                  拍照就可報稅，AI 自動辨識
                </h3>
                <p className="text-sm leading-relaxed text-emerald-100/70">
                  告別月底整理紙本的惡夢。紙本發票隨手拍，雲端電子發票無限量自動匯入。
                </p>
              </div>

              <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/30 hover:bg-white/[0.06]">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 transition-colors group-hover:bg-emerald-500/20">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <h3 className="mb-3 text-lg font-bold text-white">
                  AI 輔助，專業人員覆核
                </h3>
                <p className="text-sm leading-relaxed text-emerald-100/70">
                  所有的稅務申報與最終把關，皆由擁有十年實務經驗的「事務所專業團隊」親自覆核，確保絕對合規。
                </p>
              </div>

              <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/30 hover:bg-white/[0.06]">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20 transition-colors group-hover:bg-indigo-500/20">
                  <Zap className="h-7 w-7" />
                </div>
                <h3 className="mb-3 text-lg font-bold text-white">
                  高效數位溝通，隨時掌握進度
                </h3>
                <p className="text-sm leading-relaxed text-emerald-100/70">
                  全面導入 Line 與 Email 客服，溝通精準、紀錄完整。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <LandingPricingSection />

        {/* ── How to start & CTA ── */}
        <section className="grain relative overflow-hidden bg-slate-50 py-24 md:py-36">
          <div className="absolute top-0 right-0 h-[300px] w-[300px] rounded-full bg-emerald-100/40 blur-3xl" />
          <div className="relative mx-auto max-w-5xl px-5">
            <div className="mb-20 text-center">
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-600">
                Get Started
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                報稅升級，輕鬆上手
              </h2>
            </div>

            {/* Timeline steps */}
            <div className="mx-auto mb-24 max-w-4xl">
              <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4 md:gap-6">
                {[
                  {
                    step: 1,
                    icon: FileText,
                    title: "填寫表單",
                    desc: "留下您的公司基本資料。",
                  },
                  {
                    step: 2,
                    icon: ClipboardCheck,
                    title: "專業評估",
                    desc: "我們將透過 Line/Email 確認您是否適用此優惠方案。",
                  },
                  {
                    step: 3,
                    icon: PenLine,
                    title: "線上簽約",
                    desc: "完成數位簽署與建檔。",
                  },
                  {
                    step: 4,
                    icon: Camera,
                    title: "輕鬆記帳",
                    desc: "開始享受「隨手拍、自動載」的全新報稅體驗！",
                  },
                ].map(({ step, icon: Icon, title, desc }) => (
                  <div key={step} className="relative flex flex-col items-center text-center md:items-start md:text-left">
                    {/* Connector line (hidden on last item and mobile) */}
                    {step < 4 && (
                      <div className="absolute top-6 left-[calc(50%+24px)] hidden h-px w-[calc(100%-48px)] bg-gradient-to-r from-emerald-300 to-emerald-100 md:block" />
                    )}
                    <div className="relative mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                      <Icon className="h-5 w-5" />
                      <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-emerald-700 shadow-sm ring-2 ring-emerald-100">
                        {step}
                      </span>
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-slate-900">
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-600">
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center">
              <Button
                asChild
                size="lg"
                className="group rounded-full bg-emerald-600 text-white hover:bg-emerald-500 border-0 h-16 px-10 text-xl font-bold shadow-xl shadow-emerald-600/20 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-600/30 hover:-translate-y-0.5"
              >
                <CtaLink href={ctaHref} location="footer_cta">
                  立即填表，升級報稅體驗
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </CtaLink>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
