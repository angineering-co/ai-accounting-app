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
        "transition-shadow hover:shadow-md",
        variant === "primary" && "border-primary shadow-md md:shadow-lg",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle
          className={cn("text-lg font-medium", variant === "primary" && "text-xl md:text-2xl")}
        >
          {rocPeriod.format()}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={period.status === "locked" ? "secondary" : "default"}>
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
        <div className={cn("grid grid-cols-2 gap-4 my-4", variant === "primary" && "md:my-6")}>
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

        <div className="flex items-center justify-between mt-4">
          {/* <p className="text-xs text-muted-foreground">{count} 張發票</p> */}
          <Button
            asChild
            size={variant === "primary" ? "default" : "sm"}
            variant={variant === "primary" ? "default" : "ghost"}
            className="gap-2"
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
