"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  formCard,
  conclusionBox,
  formStack,
  fieldGroup,
  labelText,
  body,
  secondary,
  secondaryRelaxed,
  selectTriggerSize,
  salaryInput,
  currencyPrefix,
} from "@/lib/styles/tools";
import {
  calculate,
  getConclusion,
  fmt,
  type YearKey,
  type EmpCount,
  type EmployeeStatus,
} from "@/lib/domain/insurance-calculator";
import { TaxResultRow as Row } from "./tax-result-row";

const YEAR_OPTIONS: { value: YearKey; label: string }[] = [
  { value: "114", label: "114 年 (2025)" },
  { value: "115", label: "115 年 (2026)" },
];

const EMP_COUNT_OPTIONS: { value: EmpCount; label: string }[] = [
  { value: "zero", label: "0 人" },
  { value: "under5", label: "未滿 5 人" },
  { value: "over5", label: "5 人以上" },
];

const STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: "employee", label: "一般員工 (本國籍)" },
  { value: "employer", label: "雇主" },
  { value: "foreign", label: "外國員工 (無永久居留/配偶)" },
  { value: "retired", label: "已請領退休金之員工" },
];

export function InsuranceCalculatorClient() {
  const [year, setYear] = useState<YearKey>("114");
  const [empCount, setEmpCount] = useState<EmpCount>("under5");
  const [status, setStatus] = useState<EmployeeStatus>("employee");
  const [salaryStr, setSalaryStr] = useState("");
  const [laborOn, setLaborOn] = useState(true);

  const salary = Number(salaryStr) || 0;

  const handleEmpCountChange = (val: EmpCount) => {
    setEmpCount(val);
    if (val === "zero") {
      setStatus("employer");
      setLaborOn(false);
    } else if (val === "over5") {
      setLaborOn(true);
    }
  };

  const isStatusDisabled = empCount === "zero";
  const isLaborLocked = empCount === "zero" || empCount === "over5";

  const result = useMemo(
    () => calculate({ year, salary, status, empCount, laborOn }),
    [year, salary, status, empCount, laborOn],
  );

  const conclusion = getConclusion(empCount, result.healthLevel, year);

  return (
    <div className="flex flex-col gap-6">
      {/* Form */}
      <div className={formCard}>
        <div className={formStack}>
          {/* Year */}
          <div className={fieldGroup}>
            <Label className={labelText}>年度</Label>
            <RadioGroup
              value={year}
              onValueChange={(v) => setYear(v as YearKey)}
              className="flex flex-wrap gap-5"
            >
              {YEAR_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <RadioGroupItem value={opt.value} />
                  <span className="text-base">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Employee count */}
          <div className={fieldGroup}>
            <Label className={labelText}>
              員工人數 (不含雇主自己)
            </Label>
            <RadioGroup
              value={empCount}
              onValueChange={(v) => handleEmpCountChange(v as EmpCount)}
              className="flex flex-wrap gap-5"
            >
              {EMP_COUNT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <RadioGroupItem value={opt.value} />
                  <span className="text-base">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Salary */}
          <div className={fieldGroup}>
            <Label className={labelText}>薪資</Label>
            <div className="relative">
              <span className={currencyPrefix}>
                NT$
              </span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={salaryStr}
                onChange={(e) => setSalaryStr(e.target.value)}
                placeholder="例如: 35000"
                className={salaryInput}
              />
            </div>
          </div>

          {/* Status */}
          <div className={fieldGroup}>
            <Label className={labelText}>
              計算身分
            </Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as EmployeeStatus)}
              disabled={isStatusDisabled}
            >
              <SelectTrigger className={selectTriggerSize}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Insurance toggles */}
          <div className={fieldGroup}>
            <Label className={labelText}>
              投保選項
            </Label>
            <p className={secondary}>強制項目系統會自動鎖定</p>
            <div className="flex flex-col gap-3 mt-1">
              <label className="flex items-center gap-2.5 cursor-not-allowed opacity-70">
                <Checkbox checked disabled />
                <span className="text-base text-slate-600">健保 (Health)</span>
              </label>
              <label
                className={`flex items-center gap-2.5 ${isLaborLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
              >
                <Checkbox
                  checked={laborOn}
                  onCheckedChange={(checked) => setLaborOn(checked === true)}
                  disabled={isLaborLocked}
                />
                <span className="text-base text-slate-600">
                  勞工保險 (Labor)
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {salary > 0 && (
        <div className={cn(formCard, "animate-fade-up")}>
          <h3 className={cn(labelText, "mb-5")}>
            計算結果 ({YEAR_OPTIONS.find((o) => o.value === year)?.label})
          </h3>

          <div className="flex flex-wrap gap-3 mb-5">
            {(
              [
                {
                  label: "健保級距",
                  value: result.healthLevel,
                  bg: "bg-emerald-50",
                  text: "text-emerald-700",
                },
                {
                  label: "勞保級距",
                  value: result.laborLevel,
                  bg: "bg-blue-50",
                  text: "text-blue-700",
                },
                {
                  label: "勞退級距",
                  value: result.pensionLevel,
                  bg: "bg-amber-50",
                  text: "text-amber-700",
                },
              ] as const
            ).map((tag) => (
              <span
                key={tag.label}
                className={`inline-flex items-center gap-1.5 rounded-full ${tag.bg} px-3 py-1.5 text-base font-medium ${tag.text}`}
              >
                {tag.label}: {tag.value}
              </span>
            ))}
          </div>

          {/* Header */}
          <div className="grid grid-cols-3 gap-2 mb-3 text-base font-medium text-slate-500">
            <span>項目</span>
            <span className="text-right">個人負擔</span>
            <span className="text-right">雇主負擔</span>
          </div>

          <div className="flex flex-col gap-3">
            <InsuranceRow
              label="全民健康保險"
              empValue={result.healthEmployee}
              comValue={result.healthCompany}
            />
            <InsuranceRow
              label="勞工保險 (普通事故)"
              empValue={result.laborEmployee}
              comValue={result.laborCompany}
            />
            <InsuranceRow
              label="勞工退休金 (6%)"
              empValue={0}
              comValue={result.pensionCompany}
            />
            <InsuranceRow
              label="職業災害保險 (100% 雇主)"
              empValue={0}
              comValue={result.occupationalCompany}
            />
          </div>

          {/* Grand total */}
          <div className="border-t border-slate-100 pt-4 mt-4">
            <p className={cn(secondary, "mb-2")}>(薪資+保費+勞退+職災)</p>
            <Row label="每月公司總支出" value={fmt(result.grandTotal)} bold />
          </div>

          {/* Take home */}
          <div className="border-t border-slate-100 pt-4 mt-4">
            <p className={cn(secondary, "mb-2")}>
              薪資 - (個人健保 + 個人勞保) = 實領薪資
            </p>
            <Row label="個人實領" value={fmt(result.takeHome)} bold />
          </div>

          {/* Conclusion */}
          <div className={cn(conclusionBox, "mt-5")}>
            <p className="text-base font-medium text-slate-700 mb-1">專家總結</p>
            <p className="text-base text-slate-600 leading-relaxed">
              {conclusion}
            </p>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className={secondaryRelaxed}>
        <p>註1：以上計算適用於一般正職員工，部分工時人員不適用；勞健保計算結果僅供參考，實際繳納仍依勞健保局結果為準</p>
        <p>註2：職業災害保險為依照一般行業0.11%計算，不同行業可能有不同費率</p>
      </div>
    </div>
  );
}

function InsuranceRow({
  label,
  empValue,
  comValue,
}: {
  label: string;
  empValue: number;
  comValue: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 items-baseline">
      <span className={body}>{label}</span>
      <span className="text-right text-lg font-mono text-slate-700">
        {fmt(empValue)}
      </span>
      <span className="text-right text-lg font-mono text-slate-700">
        {fmt(comValue)}
      </span>
    </div>
  );
}
