"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { RocPeriod } from "@/lib/domain/roc-period";
import Link from "next/link";
import { type TaxFilingPeriod, type TaxFilingSummary } from "@/lib/domain/models";
import { cn, formatDateZhTW, formatNTD } from "@/lib/utils";
import { PeriodStatusBadge } from "@/components/period-status-badge";

interface PeriodCardProps {
  period: TaxFilingPeriod;
  firmId: string;
  clientId: string;
  managePath?: string;
  variant?: "default" | "primary";
  actionLabel?: string;
}

const SUMMARY_FIELDS: ReadonlyArray<{ label: string; key: keyof TaxFilingSummary }> = [
  { label: "總銷售額", key: "total_sales" },
  { label: "總進項", key: "total_purchases" },
  { label: "應繳稅額", key: "tax_payable" },
  { label: "留抵稅額", key: "credit_carryover" },
];

function FilingSummaryGrid({
  summary,
  variant,
}: {
  summary: TaxFilingSummary;
  variant: "default" | "primary";
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-3 my-4",
        variant === "primary" && "md:my-6 md:gap-y-4",
      )}
    >
      {SUMMARY_FIELDS.map(({ label, key }) => (
        <div key={key}>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              "text-base font-semibold font-mono text-slate-900",
              variant === "primary" && "md:text-lg",
            )}
          >
            {formatNTD(summary[key])}
          </p>
        </div>
      ))}
    </div>
  );
}

export function PeriodCard({
  period,
  firmId,
  clientId,
  managePath,
  variant = "default",
  actionLabel = "管理發票",
}: PeriodCardProps) {
  const rocPeriod = RocPeriod.fromYYYMM(period.year_month);
  const filedSummary =
    period.status === "filed" ? period.filing.summary : undefined;
  const readyAtLabel =
    period.status === "open" && period.client_ready_at
      ? formatDateZhTW(new Date(period.client_ready_at))
      : null;

  return (
    <Card
      className={cn(
        "overflow-hidden border-slate-200/80 bg-white shadow-sm shadow-slate-200/60 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/70",
        variant === "primary" &&
          "border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50/70 shadow-md shadow-emerald-100/60 md:shadow-lg",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-slate-100/80 pb-4">
        <CardTitle
          className={cn(
            "text-lg font-semibold text-slate-900",
            variant === "primary" && "text-xl md:text-2xl",
          )}
        >
          {rocPeriod.format()}
        </CardTitle>
        <div className="flex items-center gap-2">
          <PeriodStatusBadge period={period} />
        </div>
      </CardHeader>
      <CardContent>
        {readyAtLabel ? (
          <p className="mt-4 text-sm text-amber-700">
            客戶於 {readyAtLabel} 已通知，可開始審核。
          </p>
        ) : null}
        {filedSummary ? (
          <FilingSummaryGrid summary={filedSummary} variant={variant} />
        ) : null}

        <div className="mt-4 flex items-center justify-end">
          <Button
            asChild
            size={variant === "primary" ? "default" : "sm"}
            variant={variant === "primary" ? "default" : "outline"}
            className={cn(
              "gap-2 rounded-full",
              variant === "primary"
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-500"
                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800",
            )}
          >
            <Link
              href={
                managePath ??
                `/firm/${firmId}/client/${clientId}/period/${period.year_month}`
              }
            >
              {actionLabel} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
