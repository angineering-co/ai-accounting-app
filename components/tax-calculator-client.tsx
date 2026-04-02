"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formCard,
  formStack,
  fieldGroup,
  labelText,
  body,
  secondary,
  selectTriggerSize,
  inputSuffix,
  tooltipContent,
} from "@/lib/styles/tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// 113 年度 (2024) 稅率常數
const EXEMPTION_BASE = 97000;
const STANDARD_DEDUCTION_SINGLE = 131000;
const STANDARD_DEDUCTION_MARRIED = 262000;

interface TaxInputs {
  maritalStatus: "single" | "married";
  dependents: number;
  revenue: string; // formatted with commas
  profitMarginPercent: number;
}

interface IITResult {
  tax: number;
  rate: number;
  diff: number;
}

interface TaxResult {
  // inputs used (for tooltip formulas)
  revenue: number;
  marginPercent: number;
  taxpayerCount: number;
  dependents: number;
  exemption: number;
  deduction: number;
  // computed
  profit: number;
  deductionTotal: number;
  sole: {
    dividend: number;
    netIncome: number;
    iit: IITResult;
    totalTax: number;
  };
  company: {
    cit: number;
    citNote: string;
    dividend: number;
    netIncome: number;
    iit: IITResult;
    dividendCredit: number;
    iitFinal: number;
    totalTax: number;
  };
}

function parseRevenue(formatted: string): number {
  return parseInt(formatted.replace(/\D/g, ""), 10) || 0;
}

function formatRevenue(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return parseInt(digits, 10).toLocaleString("en-US");
}

function fmt(num: number): string {
  return Math.floor(Math.abs(num)).toLocaleString("zh-TW");
}

function formatMoney(num: number): string {
  const prefix = num < 0 ? "- " : "";
  return prefix + fmt(num) + " 元";
}

function calculateIIT(netIncome: number): IITResult {
  if (netIncome <= 0) return { tax: 0, rate: 0, diff: 0 };
  if (netIncome <= 590000) return { tax: netIncome * 0.05, rate: 5, diff: 0 };
  if (netIncome <= 1330000)
    return { tax: netIncome * 0.12 - 41300, rate: 12, diff: 41300 };
  if (netIncome <= 2660000)
    return { tax: netIncome * 0.2 - 147700, rate: 20, diff: 147700 };
  if (netIncome <= 4980000)
    return { tax: netIncome * 0.3 - 413700, rate: 30, diff: 413700 };
  return { tax: netIncome * 0.4 - 911700, rate: 40, diff: 911700 };
}

function calculateTaxes(inputs: TaxInputs): TaxResult {
  const revenue = parseRevenue(inputs.revenue);
  const margin = inputs.profitMarginPercent / 100;
  const taxpayerCount = inputs.maritalStatus === "married" ? 2 : 1;
  const exemption = EXEMPTION_BASE * (taxpayerCount + inputs.dependents);
  const deduction =
    inputs.maritalStatus === "married"
      ? STANDARD_DEDUCTION_MARRIED
      : STANDARD_DEDUCTION_SINGLE;
  const deductionTotal = exemption + deduction;

  const profit = revenue * margin;

  // 行號
  const soleDividend = profit;
  const soleNetIncome = Math.max(0, soleDividend - deductionTotal);
  const soleIIT = calculateIIT(soleNetIncome);
  const soleTotalTax = soleIIT.tax;

  // 公司
  let cit = 0;
  let citNote = "";
  if (profit > 120000 && profit <= 200000) {
    cit = (profit - 120000) / 2;
    citNote = "減半課徵";
  } else if (profit > 200000) {
    cit = profit * 0.2;
    citNote = "20%";
  }

  const companyDividend = Math.max(0, profit - cit);
  const companyNetIncome = Math.max(0, companyDividend - deductionTotal);
  const compIIT = calculateIIT(companyNetIncome);
  const dividendCredit = Math.min(companyDividend * 0.085, 80000);
  const iitFinal = compIIT.tax - dividendCredit;
  const companyTotalTax = cit + iitFinal;

  return {
    revenue,
    marginPercent: inputs.profitMarginPercent,
    taxpayerCount,
    dependents: inputs.dependents,
    exemption,
    deduction,
    profit,
    deductionTotal,
    sole: {
      dividend: soleDividend,
      netIncome: soleNetIncome,
      iit: soleIIT,
      totalTax: soleTotalTax,
    },
    company: {
      cit,
      citNote,
      dividend: companyDividend,
      netIncome: companyNetIncome,
      iit: compIIT,
      dividendCredit,
      iitFinal,
      totalTax: companyTotalTax,
    },
  };
}

/** Small info-icon tooltip for row labels */
function InfoTip({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="ml-1 inline h-3.5 w-3.5 shrink-0 text-slate-400 cursor-help" />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className={tooltipContent}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function TaxCalculatorClient() {
  const [inputs, setInputs] = useState<TaxInputs>({
    maritalStatus: "single",
    dependents: 0,
    revenue: "",
    profitMarginPercent: 6,
  });
  const [result, setResult] = useState<TaxResult | null>(null);

  function handleCalculate() {
    if (parseRevenue(inputs.revenue) === 0) {
      return;
    }
    setResult(calculateTaxes(inputs));
  }

  const r = result;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Input Form */}
        <div className={cn(formCard, "lg:col-span-2")}>
          <h3 className={cn(labelText, "mb-5")}>基礎資料設定</h3>
          <div className={formStack}>
            <div className={fieldGroup}>
              <Label htmlFor="marital" className={labelText}>婚姻狀態</Label>
              <Select
                value={inputs.maritalStatus}
                onValueChange={(v) =>
                  setInputs((prev) => ({
                    ...prev,
                    maritalStatus: v as "single" | "married",
                  }))
                }
              >
                <SelectTrigger id="marital" className={selectTriggerSize}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">單身</SelectItem>
                  <SelectItem value="married">已婚</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={fieldGroup}>
              <Label htmlFor="dependents" className={labelText}>扶養人數</Label>
              <div className="relative">
                <Input
                  id="dependents"
                  type="text"
                  inputMode="numeric"
                  value={String(inputs.dependents)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setInputs((prev) => ({
                      ...prev,
                      dependents: digits === "" ? 0 : parseInt(digits, 10),
                    }));
                  }}
                />
                <span className={inputSuffix}>
                  人
                </span>
              </div>
            </div>

            <div className={fieldGroup}>
              <Label htmlFor="revenue" className={labelText}>預估年度營業額</Label>
              <div className="relative">
                <Input
                  id="revenue"
                  type="text"
                  inputMode="numeric"
                  placeholder="例: 10,000,000"
                  className="pr-8"
                  value={inputs.revenue}
                  onChange={(e) =>
                    setInputs((prev) => ({
                      ...prev,
                      revenue: formatRevenue(e.target.value),
                    }))
                  }
                />
                <span className={inputSuffix}>
                  元
                </span>
              </div>
            </div>

            <div className={fieldGroup}>
              <Label htmlFor="margin" className={cn(labelText, "inline-flex items-center")}>
                預估書審率 (淨利率)
                <InfoTip>
                  <p>
                    依國稅局擴大書審純益率標準，多數行業適用 6%。
                  </p>
                  <a
                    href="https://www.ntbna.gov.tw/singlehtml/5f5746a30ef04963823b2302b9146208?cntId=b1eb3b3cb1914390ab6a4be61cd9fc65#gsc.tab=0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-sky-300 underline"
                  >
                    查看國稅局書審純益率表
                  </a>
                </InfoTip>
              </Label>
              <div className="relative">
                <Input
                  id="margin"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={inputs.profitMarginPercent}
                  onChange={(e) =>
                    setInputs((prev) => ({
                      ...prev,
                      profitMarginPercent: Math.max(
                        1,
                        Math.min(100, parseInt(e.target.value) || 6),
                      ),
                    }))
                  }
                />
                <span className={inputSuffix}>
                  %
                </span>
              </div>
            </div>

            <Button className="w-full" size="lg" onClick={handleCalculate}>
              立即計算比較
            </Button>

            <p className={cn(secondary, "text-center inline-flex items-center justify-center w-full")}>
              以 114 年度 (2025) 稅率計算
              <InfoTip>
                <p className="font-medium mb-1">本工具使用之稅率常數:</p>
                <p>個人免稅額: 每人 97,000 元</p>
                <p>標準扣除額: 單身 131,000 / 已婚 262,000</p>
                <p className="mt-1">綜所稅率: 5% / 12% / 20% / 30% / 40% (累進)</p>
                <p>營所稅率: 20% (12~20萬減半課徵)</p>
                <p>股利可抵減: 8.5%，上限 80,000</p>
              </InfoTip>
            </p>
          </div>
        </div>

        {/* Results */}
        <div className={cn(formCard, "lg:col-span-3")}>
          <h3 className={cn(labelText, "mb-5")}>稅額試算比較表</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>稅別項目</TableHead>
                  <TableHead className="min-w-[110px] text-right">
                    行號組織
                  </TableHead>
                  <TableHead className="min-w-[110px] text-right">
                    公司組織
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 核定營利所得 */}
                <TableRow>
                  <TableCell className={body}>
                    核定營利所得
                    {r && (
                      <InfoTip>
                        營業額 {fmt(r.revenue)} x 淨利率 {r.marginPercent}% = {fmt(r.profit)}
                      </InfoTip>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r ? formatMoney(r.profit) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r ? formatMoney(r.profit) : "-"}
                  </TableCell>
                </TableRow>

                {/* 營利事業所得稅 */}
                <TableRow>
                  <TableCell className={body}>
                    營利事業所得稅
                    <InfoTip>
                      <p>行號免課營所稅，全額歸入個人所得。</p>
                      <p className="mt-1">公司: 12萬以下免稅、12~20萬減半課徵、20萬以上稅率 20%</p>
                    </InfoTip>
                  </TableCell>
                  <TableCell className={cn(secondary, "text-right")}>
                    無
                  </TableCell>
                  <TableCell className="text-right">
                    {r ? (
                      <>
                        {formatMoney(r.company.cit)}
                        {r.company.citNote && (
                          <span className="ml-1 text-sm text-slate-500">
                            ({r.company.citNote})
                          </span>
                        )}
                      </>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>

                {/* 稅後盈餘/股利分配 */}
                <TableRow>
                  <TableCell className={body}>
                    稅後盈餘/股利分配
                    {r && r.company.cit > 0 && (
                      <InfoTip>
                        公司: 營利所得 {fmt(r.profit)} - 營所稅 {fmt(r.company.cit)} = {fmt(r.company.dividend)}
                      </InfoTip>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r ? formatMoney(r.sole.dividend) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r ? formatMoney(r.company.dividend) : "-"}
                  </TableCell>
                </TableRow>

                {/* 個人免稅與扣除額 */}
                <TableRow>
                  <TableCell className={body}>
                    個人免稅與扣除額
                    {r && (
                      <InfoTip>
                        <p>免稅額: {fmt(EXEMPTION_BASE)} x {r.taxpayerCount + r.dependents} 人 = {fmt(r.exemption)}</p>
                        <p>標準扣除額: {fmt(r.deduction)}</p>
                        <p className="mt-1 font-medium">合計: {fmt(r.exemption)} + {fmt(r.deduction)} = {fmt(r.deductionTotal)}</p>
                      </InfoTip>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r ? `- ${formatMoney(r.deductionTotal)}` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r ? `- ${formatMoney(r.deductionTotal)}` : "-"}
                  </TableCell>
                </TableRow>

                {/* 適用綜所稅率 */}
                <TableRow>
                  <TableCell className={body}>
                    適用綜所稅率
                    <InfoTip>
                      <p className="mb-1">113年度綜所稅累進稅率:</p>
                      <p>0 ~ 59萬: 5%</p>
                      <p>59萬 ~ 133萬: 12%</p>
                      <p>133萬 ~ 266萬: 20%</p>
                      <p>266萬 ~ 498萬: 30%</p>
                      <p>498萬以上: 40%</p>
                    </InfoTip>
                  </TableCell>
                  <TableCell className="text-right">
                    {r ? `${r.sole.iit.rate}%` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r ? `${r.company.iit.rate}%` : "-"}
                  </TableCell>
                </TableRow>

                {/* 累進差額 */}
                <TableRow>
                  <TableCell className={body}>
                    累進差額
                    <InfoTip>
                      依所得淨額所屬級距對應之累進差額，用於簡化累進稅率計算。
                    </InfoTip>
                  </TableCell>
                  <TableCell className="text-right">
                    {r
                      ? r.sole.iit.diff > 0
                        ? `- ${formatMoney(r.sole.iit.diff)}`
                        : "0 元"
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r
                      ? r.company.iit.diff > 0
                        ? `- ${formatMoney(r.company.iit.diff)}`
                        : "0 元"
                      : "-"}
                  </TableCell>
                </TableRow>

                {/* 個人綜合所得稅 */}
                <TableRow>
                  <TableCell className={body}>
                    個人綜合所得稅
                    {r && r.sole.iit.rate > 0 && (
                      <InfoTip>
                        <p>行號: {fmt(r.sole.netIncome)} x {r.sole.iit.rate}%{r.sole.iit.diff > 0 ? ` - ${fmt(r.sole.iit.diff)}` : ""} = {fmt(r.sole.iit.tax)}</p>
                        <p>公司: {fmt(r.company.netIncome)} x {r.company.iit.rate}%{r.company.iit.diff > 0 ? ` - ${fmt(r.company.iit.diff)}` : ""} = {fmt(r.company.iit.tax)}</p>
                      </InfoTip>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r ? formatMoney(r.sole.iit.tax) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r
                      ? r.company.iitFinal < 0
                        ? `應繳: 0 元 (可退稅 ${fmt(Math.abs(r.company.iitFinal))} 元)`
                        : formatMoney(r.company.iitFinal)
                      : "-"}
                  </TableCell>
                </TableRow>

                {/* 股利可抵減稅額 */}
                <TableRow>
                  <TableCell className={secondary}>
                    (扣除股利可抵減稅額)
                    <InfoTip>
                      <p>股利 {r ? fmt(r.company.dividend) : "—"} x 8.5%{r && r.company.dividend * 0.085 > 80000 ? "，上限 80,000" : ""}</p>
                      <p className="mt-1">僅適用公司組織 (合併計稅)，可抵減綜所稅及營所稅。</p>
                    </InfoTip>
                  </TableCell>
                  <TableCell className={cn(secondary, "text-right")}>
                    不適用
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r
                      ? `- ${formatMoney(r.company.dividendCredit)}`
                      : "-"}
                  </TableCell>
                </TableRow>

                {/* 年度總稅負 */}
                <TableRow className="border-t-2">
                  <TableCell className="text-lg font-bold">
                    年度總稅負
                    {r && (
                      <InfoTip>
                        <p>行號: 綜所稅 {fmt(r.sole.iit.tax)} = {fmt(r.sole.totalTax)}</p>
                        <p>公司: 營所稅 {fmt(r.company.cit)} + 綜所稅 {fmt(r.company.iit.tax)} - 可抵減 {fmt(r.company.dividendCredit)} = {fmt(r.company.totalTax)}</p>
                      </InfoTip>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-lg font-bold text-emerald-600">
                    {r ? formatMoney(r.sole.totalTax) : "0 元"}
                  </TableCell>
                  <TableCell className="text-right text-lg font-bold text-emerald-600">
                    {r ? formatMoney(r.company.totalTax) : "0 元"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {/* Conclusion Banner */}
            {r && (
              <ConclusionBanner
                soleTax={r.sole.totalTax}
                companyTax={r.company.totalTax}
              />
            )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function ConclusionBanner({
  soleTax,
  companyTax,
}: {
  soleTax: number;
  companyTax: number;
}) {
  if (soleTax === companyTax) {
    return (
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
        <p className="font-semibold text-slate-600">
          依此規模，兩種型態總稅負相同
        </p>
      </div>
    );
  }

  const winner = soleTax < companyTax ? "行號" : "公司";
  const diff = Math.abs(soleTax - companyTax);

  return (
    <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
      <p className="font-semibold text-emerald-700">
        依此規模，選擇「{winner}」年度總稅負較低
      </p>
      <p className="mt-1 text-xl font-bold text-emerald-800">
        省下 {fmt(diff)} / 年
      </p>
    </div>
  );
}
