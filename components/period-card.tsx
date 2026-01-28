"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, Unlock } from "lucide-react";
import { RocPeriod } from "@/lib/domain/roc-period";
import Link from "next/link";
import { type TaxFilingPeriod } from "@/lib/domain/models";

interface PeriodCardProps {
  period: TaxFilingPeriod;
  firmId: string;
  clientId: string;
}

export function PeriodCard({ period, firmId, clientId }: PeriodCardProps) {
  const rocPeriod = RocPeriod.fromYYYMM(period.year_month);

  // These should ideally come from the DB/Period entity
  // For now we rely on what's passed in the TaxFilingPeriod type
  // If the backend isn't populating them yet, they will be 0.
  const sales = 0; // Placeholder until integrated with real data
  const tax = 0; // Placeholder until integrated with real data
  const count = 0; // Placeholder until integrated with real data

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">
          {rocPeriod.format()}
        </CardTitle>
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
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 my-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">銷售額</p>
            <p className="text-xl font-bold font-mono">
              ${sales.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">稅額</p>
            <p className="text-xl font-bold font-mono">
              ${tax.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">{count} 張發票</p>
          <Button asChild size="sm" variant="ghost" className="gap-2">
            <Link
              href={`/firm/${firmId}/client/${clientId}/period/${period.year_month}`}
            >
              管理發票 <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
