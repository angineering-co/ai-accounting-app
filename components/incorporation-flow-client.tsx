"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Check,
  Clock,
  ChevronRight,
  Building2,
  Store,
} from "lucide-react";

interface QA {
  q: string;
  a: string;
}

interface Step {
  id: string;
  label: string;
  duration: string;
  description: string;
  qa: QA[];
}

const companySteps: Step[] = [
  {
    id: "c1",
    label: "名稱審查",
    duration: "2 工作日",
    description: "向經濟部申請公司名稱預查，確認名稱不與他人重複。",
    qa: [
      {
        q: "公司名字可以跟別人重複嗎？",
        a: "不可以，在同一個區域不能有相同名稱。建議準備 3 至 5 個名字依序排列，以免第一順位被駁回時還有備案。",
      },
      {
        q: "預查核准後有時效性嗎？",
        a: "有的，名稱預查核准後有效期為 6 個月，超過期限未完成設立登記就需要重新申請。",
      },
    ],
  },
  {
    id: "c2",
    label: "銀行開設籌備戶",
    duration: "1 工作日",
    description: "持名稱預查核准函至銀行開設公司籌備帳戶。",
    qa: [
      {
        q: "什麼是「公司籌備戶」？",
        a: "因為公司還沒拿到統編，不能開正式帳戶。籌備戶的用途是存放資本額，供會計師驗資使用。",
      },
    ],
  },
  {
    id: "c3",
    label: "存入資本額",
    duration: "1 工作日",
    description: "將資本額存入籌備戶，列印存摺封面及內頁影本。",
    qa: [
      {
        q: "錢要存進去多久？",
        a: "大約 1 至 3 天。存入後列印存摺影本交給會計師驗證即可。",
      },
    ],
  },
  {
    id: "c4",
    label: "準備文件與簽證",
    duration: "1-2 工作日",
    description: "委託會計師出具資本額查核報告，準備設立登記所需文件。",
    qa: [
      {
        q: "要準備哪些文件？",
        a: "包含會計師資本額查核報告、公司章程、房屋使用同意書、租約影本、董事及股東身分證影本等。",
      },
    ],
  },
  {
    id: "c5",
    label: "取得統一編號",
    duration: "3-5 工作日",
    description: "將文件送交主管機關審查，核准後取得公司設立登記核准函。",
    qa: [
      {
        q: "去哪裡拿這張公文？",
        a: "向各地市政府商業處（或經濟發展局）送件。核准函右上角的 8 位數字就是統一編號。",
      },
    ],
  },
  {
    id: "c6",
    label: "取得稅籍與發票",
    duration: "3-5 工作日",
    description: "持設立核准函向國稅局辦理稅籍登記，申請統一發票。",
    qa: [
      {
        q: "為何還要辦稅籍？",
        a: "統編是公司的「身分證」，稅籍則是開立發票與報稅用的登記。兩者缺一不可，需向國稅局另外辦理。",
      },
    ],
  },
  {
    id: "c7",
    label: "銀行轉為正式戶",
    duration: "1 工作日",
    description: "持設立核准函與稅籍證明，將籌備帳戶轉為正式公司帳戶。",
    qa: [
      {
        q: "轉正式戶要帶什麼？",
        a: "帶設立核准函、稅籍核准證明、公司大小章與負責人身分證到銀行辦理即可。",
      },
    ],
  },
  {
    id: "c8",
    label: "其他後續事項",
    duration: "視需求而定",
    description: "完成勞健保單位成立、刻發票章、申請進出口卡等後續作業。",
    qa: [
      {
        q: "還有什麼需要辦理的？",
        a: "常見的後續事項包含：刻發票章、勞健保投保單位成立、申請進出口登記（如有外貿需求）等。",
      },
    ],
  },
];

const firmSteps: Step[] = [
  {
    id: "f1",
    label: "名稱審查",
    duration: "1-2 工作日",
    description: "向各縣市政府申請行號名稱預查。",
    qa: [
      {
        q: "行號名字可以跟別人重複嗎？",
        a: "不行，在「同一個縣市」不能有相同名稱。不過不同縣市之間是可以的。",
      },
    ],
  },
  {
    id: "f2",
    label: "準備文件與地址",
    duration: "1 工作日",
    description: "準備設立登記文件，確認營業地址。",
    qa: [
      {
        q: "行號要驗資嗎？",
        a: "資本額 25 萬以下不需要驗資證明。這也是行號相比公司最方便的地方之一。",
      },
      {
        q: "需要什麼文件？",
        a: "包含商業登記申請書、負責人身分證影本、房屋使用同意書或租約、行號印鑑等。",
      },
    ],
  },
  {
    id: "f3",
    label: "取得統一編號",
    duration: "1-2 工作日",
    description: "完成設立登記後取得商業抄本，上面即有統一編號。",
    qa: [
      {
        q: "行號的統編是什麼？",
        a: "設立登記完成後會取得商業抄本，抄本上面就會有統一編號，和公司一樣是 8 位數字。",
      },
    ],
  },
  {
    id: "f4",
    label: "取得稅籍與發票",
    duration: "3-5 工作日",
    description: "向國稅局辦理稅籍登記，視營業規模決定是否使用統一發票。",
    qa: [
      {
        q: "行號可以免用發票嗎？",
        a: "若每月營收低於 20 萬，可以向國稅局申請免用統一發票，改按季繳納營業稅。但最終是否核准，由國稅局核定。",
      },
    ],
  },
  {
    id: "f5",
    label: "其他後續事項",
    duration: "視需求而定",
    description: "完成勞健保投保單位成立、公會加入、刻製發票章等後續作業。",
    qa: [
      {
        q: "還有什麼需要辦理的？",
        a: "包含勞健保投保單位成立、加入相關公會（部分行業強制）、刻製發票章等。",
      },
      {
        q: "行號也要刻印章嗎？",
        a: "是的，同樣需要準備行號的大章與負責人的小章，用於簽約與報稅。",
      },
    ],
  },
];

const VALID_TABS = new Set(["company", "firm"]);

export function IncorporationFlowClient() {
  const [tab, setTab] = useState("company");
  const [activeStep, setActiveStep] = useState<string | null>(null);

  useEffect(() => {
    const value = window.location.hash.slice(1);
    if (VALID_TABS.has(value)) {
      setTab(value);
    }
  }, []);

  const handleTabChange = (value: string) => {
    setTab(value);
    setActiveStep(null);
    window.history.replaceState(null, "", `#${value}`);
  };

  const steps = tab === "company" ? companySteps : firmSteps;

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
      <TabsList className="w-full h-12">
        <TabsTrigger value="company" className="flex-1 text-base gap-2">
          <Building2 className="h-4 w-4" />
          公司組織
        </TabsTrigger>
        <TabsTrigger value="firm" className="flex-1 text-base gap-2">
          <Store className="h-4 w-4" />
          行號組織
        </TabsTrigger>
      </TabsList>

      <div className="mt-6">
        <FlowView
          steps={steps}
          activeStep={activeStep}
          onStepClick={setActiveStep}
        />
      </div>
    </Tabs>
  );
}

function FlowView({
  steps,
  activeStep,
  onStepClick,
}: {
  steps: Step[];
  activeStep: string | null;
  onStepClick: (id: string) => void;
}) {
  const activeIndex = steps.findIndex((s) => s.id === activeStep);
  const activeStepData = activeIndex >= 0 ? steps[activeIndex] : undefined;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-0">
        <div className="relative">
          <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-slate-200" />
          {activeIndex >= 0 && (
            <div
              className="absolute left-[19px] top-6 w-0.5 bg-emerald-500 transition-all duration-500 ease-out"
              style={{
                height: `${(activeIndex / Math.max(steps.length - 1, 1)) * 100}%`,
                maxHeight: "calc(100% - 48px)",
              }}
            />
          )}

          <div className="relative space-y-1">
            {steps.map((step, index) => {
              const isActive = step.id === activeStep;
              const isFilled = activeIndex >= 0 && index <= activeIndex;

              return (
                <button
                  key={step.id}
                  onClick={() => onStepClick(step.id)}
                  className={cn(
                    "relative flex w-full items-start gap-4 rounded-xl px-3 py-3.5 text-left transition-all duration-200",
                    isActive
                      ? "bg-slate-100 ring-1 ring-slate-200"
                      : "hover:bg-slate-50"
                  )}
                >
                  <div
                    className={cn(
                      "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300",
                      isActive
                        ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200"
                        : isFilled
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-slate-300 bg-white text-slate-400"
                    )}
                  >
                    {isFilled && !isActive ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>

                  <div className="min-w-0 pt-1">
                    <div
                      className={cn(
                        "font-medium transition-colors",
                        isActive ? "text-slate-900" : "text-slate-600"
                      )}
                    >
                      {step.label}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="h-3 w-3" />
                      {step.duration}
                    </div>
                  </div>

                  {isActive && (
                    <ChevronRight className="ml-auto mt-1.5 h-5 w-5 shrink-0 text-blue-600" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="lg:col-span-3">
        {activeStepData ? (
          <StepDetail step={activeStepData} index={activeIndex} />
        ) : (
          <Card className="flex h-full min-h-[320px] items-center justify-center border-dashed">
            <CardContent className="text-center text-slate-400">
              <ChevronRight className="mx-auto mb-3 h-10 w-10" />
              <p className="text-base">點擊流程，查看詳細說明</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StepDetail({ step, index }: { step: Step; index: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-slate-50 px-6 py-5">
        <div className="flex items-center gap-3">
          <Badge
            variant="secondary"
            className="bg-blue-100 text-blue-700 hover:bg-blue-100"
          >
            步驟 {index + 1}
          </Badge>
          <Badge
            variant="outline"
            className="gap-1 border-emerald-200 text-emerald-700"
          >
            <Clock className="h-3 w-3" />
            {step.duration}
          </Badge>
        </div>
        <h2 className="mt-3 text-xl font-bold text-slate-900">{step.label}</h2>
        <p className="mt-1.5 text-sm text-slate-500">{step.description}</p>
      </div>
      <CardContent className="divide-y p-0">
        {step.qa.map((item, i) => (
          <div key={i} className="px-6 py-5">
            <p className="font-medium text-slate-800">{item.q}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {item.a}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
