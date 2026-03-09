"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, Unlock } from "lucide-react";
import { RocPeriod } from "@/lib/domain/roc-period";
import Link from "next/link";
import { type TaxFilingPeriod } from "@/lib/domain/models";
import { cn } from "@/lib/utils";

interface PeriodCardProps {
  period: TaxFilingPeriod;
  firmId: string;
  clientId: string;
  managePath?: string;
  variant?: "default" | "primary";
  actionLabel?: string;
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

  // TODO: Implement this
  // const sales = 0; // Placeholder until integrated with real data
  // const tax = 0; // Placeholder until integrated with real data
  // const count = 0; // Placeholder until integrated with real data

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
          <Badge
            variant="outline"
            className={cn(
              "rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-700",
              period.status !== "locked" &&
                "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}
          >
            {period.status === "locked" ? (
              <span className="flex items-center gap-1">
                <Lock className="h-3 w-3" /> 已鎖定
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Unlock className="h-3 w-3" /> 進行中
              </span>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "grid grid-cols-2 gap-4 my-4",
            variant === "primary" && "md:my-6",
          )}
        >
          {/* <div>
            <p className="text-sm font-medium text-muted-foreground">銷售額</p>
            <p className={cn("text-xl font-bold font-mono", variant === "primary" && "md:text-2xl")}>
              ${sales.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">稅額</p>
            <p className={cn("text-xl font-bold font-mono", variant === "primary" && "md:text-2xl")}>
              ${tax.toLocaleString()}
            </p>
          </div> */}
        </div>

        <div className="mt-4 flex items-center justify-between">
          {/* <p className="text-xs text-muted-foreground">{count} 張發票</p> */}
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
