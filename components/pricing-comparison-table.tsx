"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Ban, CircleHelp } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PRICES, REGISTRATION_PRICING_NOTE, type BillingCycle } from "@/lib/pricing";

type FeatureValue = true | false | string | { optional: true; price: string };

interface FeatureRow {
  label: string;
  tooltip?: string;
  pure: FeatureValue;
  bundle: FeatureValue;
}

interface FeatureCategory {
  category: string;
  rows: FeatureRow[];
}

const featureCategories: FeatureCategory[] = [
  {
    category: "記帳服務",
    rows: [
      { label: "電子發票/雲端載具自動下載申報", pure: true, bundle: true },
      { label: "每月 50 張紙本憑證拍照上傳", pure: true, bundle: true },
      { label: "營業稅每期申報", pure: true, bundle: true },
      { label: "年度營利事業所得稅結算申報", pure: true, bundle: true },
      { label: "各類所得扣繳申報", pure: true, bundle: true },
    ],
  },
  {
    category: "客戶服務",
    rows: [
      { label: "Line & Email 專屬數位客服", pure: true, bundle: true },
      { label: "自動繳稅提醒功能", pure: true, bundle: true },
    ],
  },
  {
    category: "設立登記",
    rows: [
      {
        label: "公司/商行設立登記",
        tooltip: `費用依公司型態而定：${REGISTRATION_PRICING_NOTE}`,
        pure: false,
        bundle: "NT$6,000 起",
      },
      { label: "英文名稱登記", pure: false, bundle: "免費" },
      {
        label: "商工憑證申請",
        tooltip: "強烈建議，可以查詢所得資料不怕漏報，也能完成線上加退保。",
        pure: false,
        bundle: { optional: true, price: "NT$500" },
      },
      {
        label: "成立投保單位",
        tooltip: "若日後需要投保勞健保，需要成立投保單位。",
        pure: false,
        bundle: { optional: true, price: "NT$1,000" },
      },
      {
        label: "代刻印章",
        tooltip:
          "若選擇自行準備，須郵寄或快遞印章給本公司使用；若選擇代刻印章，將由本公司設立登記完成後，連同核准公文寄回。",
        pure: false,
        bundle: { optional: true, price: "NT$300" },
      },
    ],
  },
];

function CellValue({ value }: { value: FeatureValue }) {
  if (value === true) {
    return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  }
  if (value === false) {
    return <Ban className="h-5 w-5 text-slate-300" />;
  }
  if (typeof value === "object" && value.optional) {
    return (
      <span className="flex flex-col items-center gap-0.5">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
          選購
        </span>
        <span className="text-sm font-medium text-slate-500 sm:text-base">
          +{value.price}
        </span>
      </span>
    );
  }
  return (
    <span className="text-center text-sm font-medium text-slate-700 sm:text-base">
      {value as string}
    </span>
  );
}

function BillingToggle({
  value,
  onChange,
}: {
  value: BillingCycle;
  onChange: (v: BillingCycle) => void;
}) {
  return (
    <div className="flex items-center justify-center">
      <div className="inline-flex rounded-full bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => onChange("annual")}
          className={`rounded-full px-6 py-2.5 text-base font-semibold transition-all ${
            value === "annual"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          年繳
        </button>
        <button
          type="button"
          onClick={() => onChange("monthly")}
          className={`rounded-full px-6 py-2.5 text-base font-semibold transition-all ${
            value === "monthly"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          月繳
        </button>
      </div>
    </div>
  );
}

export function PricingSection() {
  const [billing, setBilling] = useState<BillingCycle>("annual");
  const price = useMemo(() => PRICES[billing].toLocaleString("zh-TW"), [billing]);

  return (
    <TooltipProvider delayDuration={120}>
      {/* Billing toggle */}
      <section className="mx-auto w-full max-w-4xl px-5 pt-8 pb-6">
        <BillingToggle value={billing} onChange={setBilling} />
      </section>

      {/* Pricing cards */}
      <section className="mx-auto w-full max-w-4xl px-5 pb-8">
        <div className="grid gap-6 md:grid-cols-2">
          {/* 純記帳 */}
          <div className="rounded-3xl bg-white p-8 ring-1 ring-slate-200 shadow-lg md:p-10">
            <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-slate-500">
              純記帳
            </p>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-display text-4xl font-extrabold tracking-tight text-slate-900">
                NT$ {price}
              </span>
              <span className="text-base font-medium text-slate-500">/ 月</span>
            </div>
            <p className="text-base leading-relaxed text-slate-500">
              已有公司，只需要記帳報稅服務
            </p>
          </div>

          {/* 記帳+設立 */}
          <div className="rounded-3xl bg-white p-8 ring-1 ring-slate-200 shadow-lg md:p-10">
            <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-slate-500">
              記帳+設立
            </p>
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-4xl font-extrabold tracking-tight text-slate-900">
                NT$ {price}
              </span>
              <span className="inline-flex items-center gap-1 text-base font-medium text-slate-500">
                / 月 + 設立 NT$6,000 起
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="設立登記費用說明"
                      className="text-slate-400 transition-colors hover:text-slate-600"
                    >
                      <CircleHelp className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    {REGISTRATION_PRICING_NOTE}
                  </TooltipContent>
                </Tooltip>
              </span>
            </div>
            <p className="text-base leading-relaxed text-slate-500">
              新創業，需要設立公司加記帳一次搞定
            </p>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="mx-auto w-full max-w-4xl px-5 py-8 md:py-12">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {/* Table header */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr] sm:grid-cols-[1.6fr_1fr_1fr]">
            <div className="p-4 sm:p-5">
              <span className="text-sm font-bold text-slate-500 sm:text-base">
                服務項目
              </span>
            </div>
            <div className="flex items-center justify-center border-l border-slate-100 bg-slate-50 p-4 sm:p-5">
              <span className="text-center text-sm font-bold text-slate-700 sm:text-base">
                純記帳
              </span>
            </div>
            <div className="flex items-center justify-center border-l border-slate-100 bg-slate-50 p-4 sm:p-5">
              <span className="text-center text-sm font-bold text-slate-700 sm:text-base">
                記帳+設立
              </span>
            </div>
          </div>

          {/* Feature rows */}
          {featureCategories.map((cat) => (
            <div key={cat.category}>
              {/* Category header */}
              <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:px-5">
                <span className="text-sm font-bold uppercase tracking-wider text-slate-500">
                  {cat.category}
                </span>
              </div>

              {cat.rows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[1.4fr_1fr_1fr] sm:grid-cols-[1.6fr_1fr_1fr] border-t border-slate-100"
                >
                  <div className="flex items-center gap-1.5 p-4 sm:p-5">
                    <span className="text-sm font-medium text-slate-700 sm:text-base">
                      {row.label}
                    </span>
                    {row.tooltip && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${row.label} 說明`}
                            className="shrink-0 text-slate-400 transition-colors hover:text-slate-600"
                          >
                            <CircleHelp className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs leading-relaxed">
                          {row.tooltip}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="flex items-center justify-center border-l border-slate-100 bg-slate-50/30 p-4 sm:p-5">
                    <CellValue value={row.pure} />
                  </div>
                  <div className="flex items-center justify-center border-l border-slate-100 bg-slate-50/30 p-4 sm:p-5">
                    <CellValue value={row.bundle} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </TooltipProvider>
  );
}
