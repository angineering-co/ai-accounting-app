"use client";

import { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  calculateRent,
  fmtCurrency as fmt,
  fmtPercent as pct,
  type LandlordType,
  type RentResult,
} from "@/lib/domain/withholding-tax";
import { cn } from "@/lib/utils";
import {
  formCard,
  formStack,
  fieldGroup,
  labelText,
  body,
  conclusionBox,
  salaryInput,
  currencyPrefix,
} from "@/lib/styles/tools";
import { TaxResultRow as Row } from "./tax-result-row";

export function WithholdingTaxCalculatorRent() {
  const [landlordType, setLandlordType] = useState<LandlordType>("individual");
  const [amountStr, setAmountStr] = useState("");
  const [isTaxInclusive, setIsTaxInclusive] = useState(true);

  const amount = Number(amountStr) || 0;

  const result: RentResult = useMemo(
    () => calculateRent({ landlordType, amount, isTaxInclusive }),
    [landlordType, amount, isTaxInclusive],
  );

  const isCompany = landlordType === "company";

  return (
    <div className="flex flex-col gap-6">
      {/* Form */}
      <div className={formCard}>
        <div className={formStack}>
          {/* Landlord type */}
          <div className={fieldGroup}>
            <Label className={labelText}>
              出租人身份
            </Label>
            <RadioGroup
              value={landlordType}
              onValueChange={(v) => setLandlordType(v as LandlordType)}
              className="flex flex-wrap gap-5"
            >
              {(
                [
                  ["individual", "個人"],
                  ["company", "公司行號"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <RadioGroupItem value={value} />
                  <span className="text-base">{label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Amount */}
          <div className={fieldGroup}>
            <Label className={labelText}>
              金額
            </Label>
            <div className="relative">
              <span className={currencyPrefix}>
                NT$
              </span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0"
                className={salaryInput}
              />
            </div>
            {!isCompany && (
              <label className="flex items-center gap-2.5 cursor-pointer mt-1">
                <Checkbox
                  checked={isTaxInclusive}
                  onCheckedChange={(checked) => setIsTaxInclusive(checked === true)}
                />
                <span className="text-base text-slate-600">含稅</span>
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {amount > 0 && (
        <div className={cn(formCard, "animate-fade-up")}>
          <h3 className={cn(labelText, "mb-5")}>
            計算結果
          </h3>

          {isCompany ? (
            <div className="flex flex-col gap-4">
              <Row label="每期租金" value={fmt(result.grossRent)} />
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-4">
                <p className="text-base text-amber-800">
                  應向公司索取租金發票，金額 NT${fmt(result.grossRent)}(含稅)
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Row label="每期租金" value={fmt(result.grossRent)} />
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

              {(result.withholdingTax > 0 || result.healthInsurance > 0) && (
                <div className={cn(conclusionBox, "mt-2")}>
                  <p className="text-base font-medium text-slate-700 mb-2">繳款書列印</p>
                  <ul className={cn(body, "flex flex-col gap-1.5")}>
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
      )}
    </div>
  );
}
