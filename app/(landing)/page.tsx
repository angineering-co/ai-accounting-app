import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CtaLink } from "@/components/cta-link";
import { LandingPricingSection } from "@/components/landing-pricing-section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  Smartphone,
  ShieldCheck,
  ArrowRight,
  FileText,
  ClipboardCheck,
  PenLine,
  Camera,
  Eye,
  Calculator,
  GitBranch,
} from "lucide-react";

export const metadata: Metadata = {
  title: "AI 記帳事務所推薦｜速博 SnapBooks - 每月$1,200，專業會計師把關",
  description:
    "速博 SnapBooks.ai — 專業會計師全程把關的記帳事務所，每月 NT$1,200 起。拍照上傳憑證就好，記帳報稅全程搞定。適合年營業額 3,000 萬以下中小企業。",
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
      "速博 SnapBooks.ai — 專業會計師全程把關的記帳事務所，每月 NT$1,200 起。拍照上傳憑證就好，記帳報稅全程搞定。適合年營業額 3,000 萬以下中小企業。",
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
      "速博 SnapBooks.ai — 專業會計師全程把關的記帳事務所，每月 NT$1,200 起。拍照上傳憑證就好，記帳報稅全程搞定。適合年營業額 3,000 萬以下中小企業。",
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

const comparisonRows = [
  {
    label: "月費",
    traditional: "NT$2,000 - 3,000+",
    snapbooks: "NT$1,200",
  },
  {
    label: "憑證處理",
    traditional: "每月整理紙本寄送",
    snapbooks: "拍照上傳/自動匯入",
  },
  {
    label: "進度查詢",
    traditional: "打電話問",
    snapbooks: "隨時線上查看",
  },
  {
    label: "溝通方式",
    traditional: "上班時間電話",
    snapbooks: "Line/Email 即時回覆",
  },
  {
    label: "報稅把關",
    traditional: "人工處理",
    snapbooks: "AI+會計師覆核",
  },
  {
    label: "發票存取",
    traditional: "向事務所索取",
    snapbooks: "雲端隨時調閱",
  },
];

const featureTourRows = [
  {
    icon: Smartphone,
    badge: "簡單交付",
    title: "憑證交付超簡單",
    description:
      "紙本發票隨手拍照上傳，電子發票自動匯入。你負責拍，我們負責帳務+報稅。",
    image: "/client-invoice-upload.webp",
    imageWidth: 260,
    imageHeight: 541,
    mobile: true,
  },
  {
    icon: ShieldCheck,
    badge: "專業把關",
    title: "專業會計師覆核把關",
    description:
      "每一筆帳務都由十年經驗的專業團隊逐筆覆核，確保合規。",
    image: "/staff-invoice-review.webp",
    imageWidth: 634,
    imageHeight: 568,
    mobile: false,
  },
  {
    icon: Eye,
    badge: "即時透明",
    title: "隨時掌握帳務狀態",
    description:
      "線上即時查看記帳與申報進度，不用打電話追問，帳務狀態一目了然。",
    image: "/client-realtime-dashboard.webp",
    imageWidth: 260,
    imageHeight: 530,
    mobile: true,
  },
];

const faqItems = [
  {
    value: "security",
    question: "我的資料安全嗎？",
    answer:
      "資料採用企業級加密儲存，僅授權的專業團隊可存取。我們重視您的隱私，絕不將資料分享給第三方。",
  },
  {
    value: "switching",
    question: "從現有事務所轉過來麻煩嗎？",
    answer:
      "一點都不麻煩。只需提供公司基本資料，我們會協助您完成所有交接流程，無縫銜接。",
  },
  {
    value: "included",
    question: "每月 $1,200 包含哪些服務？",
    answer:
      "包含電子發票無限量自動匯入、每月最多 50 張紙本發票拍照上傳、營業稅申報、年度營所稅申報、各類所得扣繳申報，以及 Line / Email 即時客服。",
  },
  {
    value: "cancel",
    question: "不滿意可以隨時取消嗎？",
    answer: "可以。我們不綁長約，合約詳情請參閱服務條款。",
  },
];

const startupGuideSteps = [
  { step: "1", label: "設立健檢", icon: ClipboardCheck },
  { step: "2", label: "稅負試算", icon: Calculator },
  { step: "3", label: "流程總覽", icon: GitBranch },
];

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
              記帳報稅，
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                交給我們就好
              </span>
            </h1>

            <p className="animate-fade-up delay-200 mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-600 md:text-xl">
              專業會計師全程把關，你只要拍照上傳憑證，
              <br className="hidden md:block" />
              其餘交給我們。
            </p>

            <div className="animate-fade-up delay-300 mt-12 flex flex-col items-center justify-center gap-5">
              <Button
                asChild
                size="lg"
                className="group rounded-full bg-emerald-600 text-white hover:bg-emerald-500 border-0 h-14 px-8 text-lg font-semibold shadow-lg shadow-emerald-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5"
              >
                <CtaLink href={ctaHref} location="hero">
                  預約免費諮詢
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </CtaLink>
              </Button>
              {!hasFormUrl && (
                <p
                  id="signup-unavailable"
                  className="text-xs text-slate-500"
                >
                  諮詢表單即將開放，敬請期待。
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Why SnapBooks ── */}
        <section id="features" className="py-24 md:py-36">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mb-20 text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                為什麼選擇 SnapBooks
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
                記帳事務所的服務品質，加上科技的便利
              </p>
            </div>

            <div className="space-y-24 md:space-y-32">
              {featureTourRows.map((row, i) => {
                const reversed = i % 2 !== 0;
                const Icon = row.icon;
                return (
                  <div key={row.title} className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
                    <div className={reversed ? "order-1 md:order-2" : undefined}>
                      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200/60 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700">
                        <Icon className="h-4 w-4" />
                        {row.badge}
                      </div>
                      <h3 className="font-display text-2xl font-bold text-slate-900 md:text-3xl">
                        {row.title}
                      </h3>
                      <p className="mt-4 text-lg leading-relaxed text-slate-600">
                        {row.description}
                      </p>
                    </div>
                    <div className={reversed ? "order-2 md:order-1" : undefined}>
                      {row.mobile ? (
                        <div className="flex justify-center">
                          <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-900 p-1.5 shadow-xl max-w-[220px] md:max-w-[260px]">
                            <Image
                              src={row.image}
                              alt={row.title}
                              width={row.imageWidth}
                              height={row.imageHeight}
                              className="rounded-[1.25rem]"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-lg">
                          <Image
                            src={row.image}
                            alt={row.title}
                            width={row.imageWidth}
                            height={row.imageHeight}
                            className="w-full"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Startup Guide Banner ── */}
        <section className="bg-gradient-to-br from-emerald-50/50 via-white to-sky-50/50 py-16 md:py-24">
          <div className="mx-auto max-w-4xl px-5">
            <div className="overflow-hidden rounded-3xl border border-emerald-200/50 bg-white/80 p-8 shadow-sm backdrop-blur-sm md:p-12">
              <div className="text-center">
                <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-600">
                  創業必看
                </p>
                <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                  準備開公司？三步搞懂創業大小事
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-base text-slate-600 md:text-lg">
                  免費互動工具，從設立評估到流程總覽一次到位
                </p>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-4 md:gap-6">
                {startupGuideSteps.map(({ step, label, icon: Icon }) => (
                  <div key={step} className="flex flex-col items-center gap-2 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 md:h-12 md:w-12">
                      <Icon className="h-5 w-5 md:h-6 md:w-6" />
                    </div>
                    <span className="text-xs font-medium text-slate-700 md:text-sm">
                      Step {step}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 md:text-base">
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 text-center">
                <Button
                  asChild
                  size="lg"
                  className="group rounded-full bg-emerald-600 text-white hover:bg-emerald-500 border-0 h-12 px-8 text-base font-semibold shadow-lg shadow-emerald-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5"
                >
                  <Link href="/startup-guide">
                    開始創業攻略
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Comparison ── */}
        <section className="bg-gradient-to-br from-emerald-50/50 via-white to-sky-50/50 py-24 md:py-36">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mb-16 text-center">
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-600">
                比較看看
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                SnapBooks 速博 vs 傳統記帳事務所
              </h2>
            </div>

            <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              {/* Table header */}
              <div className="grid grid-cols-[1.2fr_1fr_1fr] sm:grid-cols-[1.5fr_1fr_1fr]">
                <div className="p-4 sm:p-5" />
                <div className="flex items-center justify-center border-l border-slate-100 bg-slate-50 p-4 sm:p-5">
                  <span className="text-center text-sm sm:text-base font-semibold text-slate-500">
                    傳統事務所
                  </span>
                </div>
                <div className="flex items-center justify-center border-l border-emerald-100 bg-emerald-50 p-4 sm:p-5 border-t-2 border-t-emerald-500">
                  <span className="text-center text-sm sm:text-base font-bold text-emerald-700">
                    SnapBooks.ai
                  </span>
                </div>
              </div>

              {/* Table rows */}
              {comparisonRows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[1.2fr_1fr_1fr] sm:grid-cols-[1.5fr_1fr_1fr] border-t border-slate-100"
                >
                  <div className="flex items-center p-4 sm:p-5">
                    <span className="text-sm sm:text-base font-medium text-slate-700">
                      {row.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-center border-l border-slate-100 bg-slate-50/50 p-4 sm:p-5">
                    <span className="text-center text-sm sm:text-base text-slate-500">
                      {row.traditional}
                    </span>
                  </div>
                  <div className="flex items-center justify-center border-l border-emerald-100 bg-emerald-50/30 p-4 sm:p-5">
                    <span className="text-center text-sm sm:text-base font-medium text-slate-900">
                      {row.snapbooks}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <LandingPricingSection />

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
              <span className="font-bold text-slate-900 not-italic">更嚴謹的把關，更省心的流程，更合理的價格。</span>
            </blockquote>
            <p className="mt-6 text-center text-lg leading-relaxed text-slate-600 md:text-xl md:leading-relaxed">
              專為台灣中小企業打造的新型態記帳事務所。
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
                  <p className="mt-1 text-base font-semibold text-emerald-600">
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
                  <p className="mt-1 text-base font-semibold text-emerald-600">
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

        {/* ── FAQ ── */}
        <section className="bg-slate-50 py-24 md:py-36">
          <div className="mx-auto max-w-3xl px-5">
            <div className="mb-16 text-center">
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-600">
                常見問題
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                你可能想問的問題
              </h2>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              {faqItems.map(({ value, question, answer }) => (
                <AccordionItem
                  key={value}
                  value={value}
                  className="rounded-2xl border border-slate-200 bg-white px-6 shadow-sm"
                >
                  <AccordionTrigger className="text-base md:text-lg font-semibold text-slate-900 hover:no-underline">
                    {question}
                  </AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-slate-600">
                    {answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <p className="mt-10 text-center text-sm text-slate-500">
              還有其他問題？查看<a href="/faq#snapbooks-service" className="font-medium text-emerald-600 hover:text-emerald-500 transition-colors">完整常見問題</a>
            </p>
          </div>
        </section>

        {/* ── How to start & CTA ── */}
        <section className="grain relative overflow-hidden bg-white py-24 md:py-36">
          <div className="absolute top-0 right-0 h-[300px] w-[300px] rounded-full bg-emerald-100/40 blur-3xl" />
          <div className="relative mx-auto max-w-5xl px-5">
            <div className="mb-20 text-center">
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-600">
                開始使用
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
                    <p className="text-sm sm:text-base leading-relaxed text-slate-600">
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
                  預約免費諮詢
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
