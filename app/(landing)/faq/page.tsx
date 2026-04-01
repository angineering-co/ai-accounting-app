import type { Metadata } from "next";
import Link from "next/link";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { renderLinkedTextWithBreaks } from "@/lib/render-linked-text";

import { faqCategories } from "./data";

export const metadata: Metadata = {
  title: "常見問題 FAQ | SnapBooks.ai",
  description:
    "公司設立、登記地址、銀行開戶、記帳申報、勞健保、電子發票等常見問題與專業解答。",
  alternates: { canonical: "https://snapbooks.ai/faq" },
};

export default function FaqPage() {
  return (
    <main className="flex-1 bg-slate-50 px-5 py-24 md:py-32">
      {/* Hero */}
      <div className="mx-auto max-w-4xl text-center mb-12 md:mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
          常見問題
        </h1>
        <p className="mt-4 text-lg text-slate-500">
          公司設立、記帳申報、勞健保、電子發票等常見問題一次解答
        </p>
      </div>

      {/* Category quick links */}
      <nav className="mx-auto max-w-4xl mb-10">
        <div className="flex flex-wrap justify-center gap-2">
          {faqCategories.map((cat) => (
            <a
              key={cat.id}
              href={`#${cat.id}`}
              className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
            >
              {cat.name}
            </a>
          ))}
        </div>
      </nav>

      {/* FAQ sections */}
      <div className="mx-auto max-w-4xl space-y-8">
        {faqCategories.map((category, index) => (
          <section
            key={category.id}
            id={category.id}
            className="scroll-mt-24 rounded-3xl bg-white p-8 md:p-12 shadow-sm ring-1 ring-slate-100"
          >
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                {index + 1}
              </span>
              {category.name}
            </h2>

            <Accordion type="multiple" className="w-full">
              {category.items.map((item, i) => (
                <AccordionItem
                  key={`${category.id}-${i}`}
                  value={`${category.id}-${i}`}
                  className="border-slate-100"
                >
                  <AccordionTrigger className="text-base font-medium text-slate-800 hover:no-underline hover:text-emerald-700 [&[data-state=open]]:text-emerald-700">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-slate-600">
                    {renderLinkedTextWithBreaks(item.answer)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}
      </div>

      {/* CTA */}
      <div className="mx-auto max-w-4xl mt-12 md:mt-16 text-center">
        <p className="text-slate-500">
          還有其他問題？歡迎
          <Link
            href="https://lin.ee/nPVmG3M"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-600 hover:text-emerald-700 underline underline-offset-2"
          >
            加入 LINE 好友
          </Link>
          直接詢問我們
        </p>
      </div>
    </main>
  );
}
