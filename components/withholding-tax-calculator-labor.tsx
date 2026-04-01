"use client";

import { useState, useMemo, useCallback } from "react";
import { Download, CircleHelp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calculateLabor,
  getProfessions,
  getNationalityLabel,
  fmtCurrency as fmt,
  fmtPercent as pct,
  type Nationality,
  type IncomeCategory,
  type LaborResult,
} from "@/lib/domain/withholding-tax";
import { TaxResultRow as Row } from "./tax-result-row";

export function WithholdingTaxCalculatorLabor() {
  const [nationality, setNationality] = useState<Nationality>("domestic");
  const [healthExempt, setHealthExempt] = useState(false);
  const [incomeCategory, setIncomeCategory] = useState<IncomeCategory>("9A");
  const [professionCode, setProfessionCode] = useState("92");
  const [amountStr, setAmountStr] = useState("");
  const [isNetAmount, setIsNetAmount] = useState(false);
  const [generating, setGenerating] = useState(false);

  const amount = Number(amountStr) || 0;

  const professions = useMemo(
    () => getProfessions(incomeCategory),
    [incomeCategory],
  );

  const handleCategoryChange = useCallback((cat: IncomeCategory) => {
    setIncomeCategory(cat);
    const profs = getProfessions(cat);
    setProfessionCode(profs[0].code);
  }, []);

  const result: LaborResult = useMemo(
    () =>
      calculateLabor({
        nationality,
        healthInsuranceExempt: healthExempt,
        incomeCategory,
        professionCode,
        amount,
        isNetAmount,
      }),
    [nationality, healthExempt, incomeCategory, professionCode, amount, isNetAmount],
  );

  const showHealthExempt = nationality !== "foreign_non_resident";
  const showProfession = incomeCategory === "9A";

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const { generateLaborReportPdf } = await import(
        "@/lib/domain/labor-report-pdf"
      );
      await generateLaborReportPdf({ nationality, ...result });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-6">
          {/* Nationality */}
          <div className="flex flex-col gap-2.5">
            <Label className="text-lg font-semibold text-slate-700">
              國籍
            </Label>
            <RadioGroup
              value={nationality}
              onValueChange={(v) => setNationality(v as Nationality)}
              className="flex flex-wrap gap-5"
            >
              {(["domestic", "foreign_resident", "foreign_non_resident"] as const).map(
                (value) => (
                  <label
                    key={value}
                    className="flex items-center gap-2.5 cursor-pointer"
                  >
                    <RadioGroupItem value={value} />
                    <span className="text-base">{getNationalityLabel(value)}</span>
                  </label>
                ),
              )}
            </RadioGroup>
          </div>

          {/* Health insurance exemption */}
          {showHealthExempt && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Label className="text-lg font-semibold text-slate-700">
                  二代健保是否免扣
                </Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelp className="h-5 w-5 text-slate-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-sm leading-relaxed">
                      <p className="font-semibold mb-1">符合免扣條件：</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        <li>給付金額未達基本工資</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <RadioGroup
                value={healthExempt ? "yes" : "no"}
                onValueChange={(v) => setHealthExempt(v === "yes")}
                className="flex flex-wrap gap-5"
              >
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <RadioGroupItem value="no" />
                  <span className="text-base">否</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <RadioGroupItem value="yes" />
                  <span className="text-base">是(符合免扣條件)</span>
                </label>
              </RadioGroup>
            </div>
          )}

          {/* Income category */}
          <div className="flex flex-col gap-2.5">
            <Label className="text-lg font-semibold text-slate-700">
              所得類別
            </Label>
            <Select
              value={incomeCategory}
              onValueChange={(v) => handleCategoryChange(v as IncomeCategory)}
            >
              <SelectTrigger className="h-12 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="9A">9A 執行業務所得</SelectItem>
                <SelectItem value="9B">9B 稿費</SelectItem>
                <SelectItem value="92">92 其他所得</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Profession (9A only) */}
          {showProfession && (
            <div className="flex flex-col gap-2.5">
              <Label className="text-lg font-semibold text-slate-700">
                執行業務類別
              </Label>
              <Select
                value={professionCode}
                onValueChange={setProfessionCode}
              >
                <SelectTrigger className="h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {professions.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.code}.{p.label} - 費用率:{pct(p.expenseRate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Amount */}
          <div className="flex flex-col gap-2.5">
            <Label className="text-lg font-semibold text-slate-700">
              金額
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">
                NT$
              </span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0"
                className="h-14 pl-14 text-right text-xl font-mono"
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer mt-1">
              <Checkbox
                checked={isNetAmount}
                onCheckedChange={(checked) => setIsNetAmount(checked === true)}
              />
              <span className="text-base text-slate-600">實領金額(税後反算應付金額)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Results */}
      {amount > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm animate-fade-up">
          <h3 className="text-lg font-semibold text-slate-700 mb-5">
            計算結果
          </h3>
          <div className="flex flex-col gap-4">
            <Row label="應付金額" value={fmt(result.grossAmount)} />
            <Row
              label="代扣稅額"
              value={`-${fmt(result.withholdingTax)}`}
              sub={result.withholdingRate > 0 ? pct(result.withholdingRate) : undefined}
              muted={result.withholdingTax === 0}
            />
            <Row
              label="健保補充保費"
              value={`-${fmt(result.healthInsurance)}`}
              sub={result.healthInsuranceRate > 0 ? pct(result.healthInsuranceRate) : undefined}
              muted={result.healthInsurance === 0}
            />
            <div className="border-t border-slate-100 pt-4">
              <Row label="實付金額" value={fmt(result.netAmount)} bold />
            </div>
            {result.expenseRate > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <Row
                  label="費用率"
                  value={pct(result.expenseRate)}
                />
                <Row
                  label="所得淨額"
                  value={fmt(
                    Math.round(result.grossAmount * (1 - result.expenseRate)),
                  )}
                  tooltip="國稅局依照所得類別給予不同程度之減免費用，因此所得淨額是所得人實際要報稅的金額"
                />
              </div>
            )}
          </div>

          {/* Download PDF button */}
          <div className="mt-6">
            <Button
              variant="outline"
              className="w-full h-12 text-base"
              onClick={handleDownload}
              disabled={generating}
            >
              <Download className="mr-2 h-5 w-5" />
              {generating ? "產生中..." : "下載勞務報酬單"}
            </Button>
          </div>

          {/* Payment slip reminders */}
          {(result.withholdingTax > 0 || result.healthInsurance > 0) && (
            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 px-5 py-4">
              <p className="text-sm font-medium text-slate-700 mb-2">繳款書列印</p>
              <ul className="flex flex-col gap-1.5 text-sm text-slate-600">
                {result.withholdingTax > 0 && (
                  <li>
                    <a
                      href="https://www.etax.nat.gov.tw/etwmain/etw144w/152"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 underline underline-offset-2 hover:text-emerald-700"
                    >
                      所得扣繳稅額繳款書
                    </a>
                  </li>
                )}
                {result.healthInsurance > 0 && (
                  <li>
                    <a
                      href="https://eservice.nhi.gov.tw/2nd/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 underline underline-offset-2 hover:text-emerald-700"
                    >
                      二代健保繳款書
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
