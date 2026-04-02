"use client";

import { useCallback, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { secondary, bodyRelaxed } from "@/lib/styles/tools";
import {
  trackAssessmentStart,
  trackAssessmentStep,
  trackAssessmentComplete,
} from "@/lib/analytics";
import { renderLinkedText } from "@/lib/render-linked-text";
import {
  getQuestion,
  advanceStep,
  getResults,
  type ClientQuestion,
  type QuestionPayload,
  type ResultPayload,
} from "@/lib/actions/company-setup-check";

type Phase = "intro" | "questioning" | "loading" | "result";

const CTA_FORM_URL = "https://forms.gle/oBeQCq6SJxsgHJ1V6";

export function CompanySetupCheckClient() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stepHistory, setStepHistory] = useState<number[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<ClientQuestion | null>(
    null,
  );
  const [totalSteps, setTotalSteps] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [isPending, startTransition] = useTransition();

  const applyPayload = useCallback(
    (payload: QuestionPayload, nextAnswers: Record<string, string>) => {
      setCurrentQuestion(payload.question);
      setTotalSteps(payload.totalSteps);
      setSelectedOption(nextAnswers[payload.question.id] ?? null);
    },
    [],
  );

  const handleStart = useCallback(() => {
    startTransition(async () => {
      const payload = await getQuestion(0, {});
      if (!payload) return;
      setCurrentStepIndex(0);
      setStepHistory([]);
      setAnswers({});
      applyPayload(payload, {});
      setPhase("questioning");
      trackAssessmentStart();
    });
  }, [applyPayload]);

  const handleNext = useCallback(() => {
    if (!currentQuestion || !selectedOption) return;

    startTransition(async () => {
      const newAnswers = { ...answers, [currentQuestion.id]: selectedOption };
      setAnswers(newAnswers);

      const result = await advanceStep(currentStepIndex, newAnswers);

      if (result.done) {
        setPhase("loading");
        const resultPayload = await getResults(newAnswers);
        setResult(resultPayload);
        setPhase("result");
        trackAssessmentComplete();
      } else {
        setStepHistory((prev) => [...prev, currentStepIndex]);
        setCurrentStepIndex(result.nextStepIndex);
        applyPayload(result.payload, newAnswers);
        trackAssessmentStep(result.nextStepIndex + 1);
      }
    });
  }, [currentQuestion, selectedOption, answers, currentStepIndex, applyPayload]);

  const handleBack = useCallback(() => {
    if (stepHistory.length === 0) return;

    startTransition(async () => {
      const prevIdx = stepHistory[stepHistory.length - 1];
      setStepHistory((prev) => prev.slice(0, -1));

      const payload = await getQuestion(prevIdx, answers);
      if (!payload) return;
      setCurrentStepIndex(prevIdx);
      applyPayload(payload, answers);
    });
  }, [stepHistory, answers, applyPayload]);

  const handleRestart = useCallback(() => {
    setPhase("intro");
    setCurrentStepIndex(0);
    setAnswers({});
    setStepHistory([]);
    setCurrentQuestion(null);
    setSelectedOption(null);
    setResult(null);
  }, []);

  if (phase === "intro") {
    return (
      <div className="animate-fade-up mx-auto max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            找出最適合您的公司型態
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600 md:text-lg">
            花 1 分鐘回答幾個簡單問題，系統將自動為您媒合最適合的企業設立藍圖與專業建議，幫助您安心踏出創業第一步。
          </p>
          <Button
            onClick={handleStart}
            disabled={isPending}
            className="mt-8 w-full rounded-full bg-emerald-500 py-6 text-base font-semibold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-600 md:text-lg"
          >
            {isPending ? "載入中..." : "開始專屬評估"}
            {!isPending && <ArrowRight className="ml-2 h-5 w-5" />}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 shadow-sm">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
          <h2 className="mt-6 text-xl font-bold text-slate-900">
            正在生成您的專屬設立藍圖...
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            整合公司法與稅務最佳實踐中
          </p>
        </div>
      </div>
    );
  }

  if (phase === "result" && result) {
    return (
      <div className="animate-fade-up mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            您的企業設立藍圖
          </h2>
          <p className="mt-2 text-base text-slate-600">
            根據您的選擇條件，我們為您整理了以下的架構與稅務建議
          </p>

          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <p className="mb-3 text-sm font-medium uppercase tracking-wider text-slate-500">
              您的作答清單
            </p>
            <ul className="space-y-2">
              {result.summary.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 text-base last:border-0 last:pb-0"
                >
                  <span className="text-slate-600">{item.question}</span>
                  <span className="whitespace-nowrap font-medium text-emerald-600">
                    {item.answer}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {result.conclusion.length > 0 && (
          <div className="animate-fade-up rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm md:p-8">
            <h3 className="flex items-center gap-2 text-lg font-bold text-emerald-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-sm">
                &#10024;
              </span>
              您的專屬評估結論
            </h3>
            <div className="mt-4 space-y-3">
              {result.conclusion.map((text, i) => (
                <p
                  key={i}
                  className="text-base leading-relaxed text-slate-800"
                >
                  {renderLinkedText(text)}
                </p>
              ))}
            </div>
          </div>
        )}

        <Accordion type="multiple" className="space-y-4">
          {result.sections.map((section, sIdx) => (
            <AccordionItem
              key={sIdx}
              value={`section-${sIdx}`}
              className="animate-fade-up rounded-2xl border border-slate-200 bg-white shadow-sm"
              style={{ animationDelay: `${(sIdx + 1) * 100}ms` }}
            >
              <AccordionTrigger className="px-6 py-5 hover:no-underline md:px-8">
                <span className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-sm">
                    {section.emoji}
                  </span>
                  {section.title}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 md:px-8 md:pb-8">
                <div className="space-y-4">
                  {section.items.map((item, iIdx) => (
                    <div
                      key={iIdx}
                      className="rounded-xl border-l-4 border-emerald-400 bg-slate-50 p-4"
                    >
                      <p className="text-base leading-relaxed text-slate-800">
                        {renderLinkedText(item.text)}
                      </p>
                      {item.qa && (
                        <div className="mt-3 rounded-lg bg-white p-3">
                          <p className="text-sm font-semibold text-slate-600">
                            {item.qa.q}
                          </p>
                          <p className="mt-1 text-base leading-relaxed text-slate-700">
                            {renderLinkedText(item.qa.a)}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 p-8 text-center shadow-lg md:p-10">
          <h3 className="text-xl font-bold text-white md:text-2xl">
            需要進一步的專人協助嗎?
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-emerald-50/90">
            這份報告為初步評估，實際情況可能因您的詳細業務而有所不同。專業會計師團隊隨時準備為您服務。
          </p>
          <Button
            asChild
            className="mt-6 rounded-full bg-white px-8 py-6 text-base font-semibold text-emerald-700 shadow-lg hover:bg-emerald-50"
          >
            <a href={CTA_FORM_URL} target="_blank" rel="noopener noreferrer">
              預約免費諮詢
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </Button>
          <button
            onClick={handleRestart}
            className="mt-4 block w-full text-sm text-emerald-100/80 underline underline-offset-2 transition-colors hover:text-white"
          >
            <RotateCcw className="mr-1 inline h-3.5 w-3.5" />
            重新評估
          </button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const progress =
    totalSteps > 0 ? (currentStepIndex / totalSteps) * 100 : 0;

  return (
    <div className="mx-auto max-w-2xl" key={currentQuestion.id}>
      <div className="mb-6">
        <div className={cn(secondary, "mb-2 flex items-center justify-between")}>
          <span>
            第 {currentStepIndex + 1} 題，共 {totalSteps} 題
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="animate-fade-up rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
          {currentQuestion.title}
        </h2>
        {currentQuestion.subtitle && (
          <p className="mt-2 text-sm text-amber-600">
            {currentQuestion.subtitle}
          </p>
        )}

        <div className="mt-6 grid gap-3">
          {currentQuestion.options.map((opt) => (
            <button
              key={opt.value}
              disabled={opt.disabled || isPending}
              onClick={() => setSelectedOption(opt.value)}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                opt.disabled
                  ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-40"
                  : selectedOption === opt.value
                    ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                    : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30"
              }`}
            >
              <span
                className={`text-base font-medium ${
                  opt.disabled
                    ? "text-slate-400"
                    : selectedOption === opt.value
                      ? "text-emerald-700"
                      : "text-slate-700"
                }`}
              >
                {opt.label}
              </span>
              {opt.disabled && opt.disableMsg && (
                <span className="mt-1 block text-xs text-red-400">
                  ({opt.disableMsg})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={stepHistory.length === 0 || isPending}
            className="text-slate-500"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            上一題
          </Button>
          <Button
            onClick={handleNext}
            disabled={!selectedOption || isPending}
            className="rounded-full bg-emerald-500 px-6 text-white shadow-md hover:bg-emerald-600"
          >
            {isPending ? "處理中..." : "下一題"}
            {!isPending && <ArrowRight className="ml-1.5 h-4 w-4" />}
          </Button>
        </div>
      </div>

      {currentQuestion.faq.length > 0 && (
        <div className="animate-fade-up mt-6 delay-100">
          <p className={cn(secondary, "mb-3 font-medium")}>
            填寫小提示
          </p>
          <Accordion type="single" collapsible className="rounded-xl border border-slate-200 bg-white">
            {currentQuestion.faq.map((item) => (
              <AccordionItem
                key={item.q}
                value={item.q}
                className="border-b border-slate-100 px-4 last:border-0"
              >
                <AccordionTrigger className="py-3 text-left text-base font-medium text-slate-700 hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className={bodyRelaxed}>
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
    </div>
  );
}
