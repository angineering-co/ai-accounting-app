"use client";

import { useMemo, useState } from "react";
import { Ban, CheckCircle2, CircleHelp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type CompanyType = "limited" | "corporation" | "soleProprietorship";

const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  limited: "有限公司",
  corporation: "股份有限公司",
  soleProprietorship: "商行",
};

const COMPANY_TYPE_PRICES: Record<CompanyType, number> = {
  limited: 8000,
  corporation: 9000,
  soleProprietorship: 6000,
};

const formatCurrency = (amount: number) =>
  `NT$ ${new Intl.NumberFormat("zh-TW").format(amount)}`;

function YesNoOption({
  title,
  tooltip,
  value,
  onValueChange,
}: {
  title: string;
  tooltip?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${title} 說明`}
                className="text-slate-400 transition-colors hover:text-slate-600"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <RadioGroup
        value={value ? "yes" : "no"}
        onValueChange={(nextValue) => onValueChange(nextValue === "yes")}
        className="grid grid-cols-2 gap-2"
      >
        <Label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
          <RadioGroupItem value="yes" />
          Yes
        </Label>
        <Label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
          <RadioGroupItem value="no" />
          No
        </Label>
      </RadioGroup>
    </div>
  );
}

export function LandingPricingSection() {
  const [isAddonOpen, setIsAddonOpen] = useState(false);
  const [companyType, setCompanyType] = useState<CompanyType>("limited");
  const [withEnglishName, setWithEnglishName] = useState(false);
  const [withBusinessCertificate, setWithBusinessCertificate] = useState(false);
  const [withInsuranceUnit, setWithInsuranceUnit] = useState(false);
  const [withSeal, setWithSeal] = useState(false);

  const addonTotal = useMemo(() => {
    return (
      COMPANY_TYPE_PRICES[companyType] +
      (withBusinessCertificate ? 500 : 0) +
      (withInsuranceUnit ? 1000 : 0) +
      (withSeal ? 300 : 0)
    );
  }, [companyType, withBusinessCertificate, withInsuranceUnit, withSeal]);

  const breakdown = useMemo(() => {
    return [
      {
        title: `設立登記（${COMPANY_TYPE_LABELS[companyType]}）`,
        amount: COMPANY_TYPE_PRICES[companyType],
      },
      {
        title: `英文名稱（${withEnglishName ? "Yes" : "No"}）`,
        amount: 0,
      },
      {
        title: `商工憑證（${withBusinessCertificate ? "Yes" : "No"}）`,
        amount: withBusinessCertificate ? 500 : 0,
      },
      {
        title: `成立投保單位（${withInsuranceUnit ? "Yes" : "No"}）`,
        amount: withInsuranceUnit ? 1000 : 0,
      },
      {
        title: `代刻印章（${withSeal ? "Yes" : "No"}）`,
        amount: withSeal ? 300 : 0,
      },
    ];
  }, [
    companyType,
    withEnglishName,
    withBusinessCertificate,
    withInsuranceUnit,
    withSeal,
  ]);

  return (
    <TooltipProvider delayDuration={120}>
      <section id="pricing" className="mx-auto max-w-5xl px-5 py-24 md:py-32">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-6 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            顛覆業界的透明定價
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            因為 AI 大幅提升了內部效率，我們得以將省下的成本回饋給您。
          </p>
        </div>

        <div className="mx-auto flex max-w-md flex-col gap-6">
          <div className="overflow-hidden rounded-[2.5rem] bg-white ring-1 ring-slate-200 shadow-2xl shadow-slate-200/50 transition-all hover:-translate-y-1 hover:shadow-emerald-100">
            <div className="p-10 md:p-12">
              <div className="mb-4 flex items-baseline gap-2">
                <span className="text-5xl font-extrabold tracking-tight text-slate-900">
                  NT$ 1,200
                </span>
                <span className="text-lg font-medium text-slate-500">/ 月（起）</span>
              </div>

              {isAddonOpen ? (
                <>
                  <p className="mb-4 text-sm font-medium leading-relaxed text-slate-500">
                    主方案已收合，正在查看加購服務內容。
                  </p>
                  <Button
                    variant="outline"
                    className="w-full rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    onClick={() => setIsAddonOpen(false)}
                  >
                    返回主方案內容
                  </Button>
                </>
              ) : (
                <>
                  <p className="mb-10 text-sm font-medium leading-relaxed text-slate-500">
                    收費方式：一年收取 13 個月費用
                    <br />
                    （第 13 個月為年度營所稅結算申報費用）
                  </p>

                  <ul className="mb-10 space-y-5">
                    <li className="flex gap-3 text-slate-700">
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                      <span className="font-medium">
                        無限量 電子發票/雲端載具自動下載申報
                      </span>
                    </li>
                    <li className="flex gap-3 text-slate-700">
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                      <span className="font-medium">
                        每月 50 張以內紙本憑證（拍照上傳處理）
                      </span>
                    </li>
                    <li className="flex gap-3 text-slate-700">
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                      <span className="font-medium">營業稅每期申報</span>
                    </li>
                    <li className="flex gap-3 text-slate-700">
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                      <span className="font-medium">
                        年度營利事業所得稅結算申報
                      </span>
                    </li>
                    <li className="flex gap-3 text-slate-700">
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                      <span className="font-medium">各類所得扣繳申報</span>
                    </li>
                    <li className="flex gap-3 text-slate-700">
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                      <span className="font-medium">
                        Line & Email 專屬數位客服
                      </span>
                    </li>
                    <li className="flex gap-3 text-slate-700">
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                      <span className="font-medium">自動繳稅提醒功能</span>
                    </li>
                    <li className="flex gap-3 text-slate-700">
                      <Ban className="h-6 w-6 shrink-0 text-rose-500" />
                      <span className="font-medium">
                        不含勞健保投保、公司法22-1申報
                      </span>
                    </li>
                  </ul>

                  <div className="space-y-3 rounded-2xl bg-slate-50 p-6 text-sm leading-relaxed text-slate-500">
                    <p>
                      ※ 本方案專為「年營業額 3,000
                      萬以下」之中小企業/一人公司設計。
                    </p>
                    <p>
                      ※ 紙本發票若超過 50 張，每 50 張額外酌收 NT$ 400 處理費。
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-7 ring-1 ring-emerald-200 shadow-xl shadow-emerald-100/40 md:p-8">
            <div className="mb-6 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                  設立登記
                </h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="設立登記加購限制說明"
                      className="text-slate-400 transition-colors hover:text-slate-600"
                    >
                      <CircleHelp className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    對於尚未成立公司，且想要使用我們記帳報稅服務的客戶，我們提供「設立登記」的加購服務。
                  </TooltipContent>
                </Tooltip>
              </div>
              {!isAddonOpen && (
                <Button
                  variant="outline"
                  className="w-full rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                  onClick={() => setIsAddonOpen(true)}
                >
                  加購設立登記服務
                </Button>
              )}
            </div>

            {isAddonOpen ? (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="mb-3 text-sm font-semibold text-slate-800">
                    設立登記
                  </p>
                  <Select
                    value={companyType}
                    onValueChange={(value) =>
                      setCompanyType(value as CompanyType)
                    }
                  >
                    <SelectTrigger className="h-10 rounded-xl border-slate-200 text-sm font-medium text-slate-700">
                      <SelectValue placeholder="請選擇公司型態" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="limited">有限公司</SelectItem>
                      <SelectItem value="corporation">股份有限公司</SelectItem>
                      <SelectItem value="soleProprietorship">商行</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <YesNoOption
                  title="英文名稱"
                  value={withEnglishName}
                  onValueChange={setWithEnglishName}
                />
                <YesNoOption
                  title="商工憑證"
                  tooltip="強烈建議，可以查詢所得資料不怕漏報，也能完成線上加退保。"
                  value={withBusinessCertificate}
                  onValueChange={setWithBusinessCertificate}
                />
                <YesNoOption
                  title="成立投保單位"
                  tooltip="若日後需要投保勞健保，需要成立投保單位。"
                  value={withInsuranceUnit}
                  onValueChange={setWithInsuranceUnit}
                />
                <YesNoOption
                  title="代刻印章"
                  tooltip="若選擇自行準備，須郵寄或快遞印章給本公司使用；若選擇代刻印章，將由本公司設立登記完成後，連同核准公文寄回。"
                  value={withSeal}
                  onValueChange={setWithSeal}
                />

                <div className="space-y-4 rounded-2xl bg-slate-50 p-6">
                  <div className="flex items-end justify-between gap-4 border-b border-slate-200 pb-3">
                    <span className="text-sm font-semibold text-slate-600">
                      (一次性加購費用)
                    </span>
                    <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                      {formatCurrency(addonTotal)}
                    </span>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {breakdown.map((item) => (
                      <li
                        key={item.title}
                        className="flex items-center justify-between gap-4"
                      >
                        <span>{item.title}</span>
                        <span className="font-semibold text-slate-800">
                          {formatCurrency(item.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-slate-500">
                點擊上方按鈕即可展開設立登記加購內容，主方案會自動收合讓你快速配置項目。
              </p>
            )}
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}
