"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import useSWR from "swr";

import { AmountCell } from "@/components/amount-cell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportPeriodSelector } from "@/components/report-period-selector";
import { RecordStateCard } from "@/components/record-state-card";
import { ReportSectionCard } from "@/components/report-section-card";
import { getIncomeStatement } from "@/lib/services/voucher";
import { RocPeriod } from "@/lib/domain/roc-period";
import { formatDateToISO } from "@/lib/utils";

function defaultRange(): { fromDate: string; toDate: string } {
  const p = RocPeriod.getCurrentUnclosedPeriod();
  return {
    fromDate: formatDateToISO(p.startDate),
    toDate: formatDateToISO(p.endDate),
  };
}

function SubtotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <span className="text-base font-medium">{label}</span>
        <AmountCell amount={amount} />
      </CardContent>
    </Card>
  );
}

export default function IncomeStatementPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = use(params);
  const router = useRouter();

  const [{ fromDate, toDate }, setRange] = useState(defaultRange);

  const { data: is, isLoading, error } = useSWR(
    ["income-statement", clientId, fromDate, toDate],
    () => getIncomeStatement(clientId, fromDate, toDate),
    { keepPreviousData: true },
  );

  if (error) {
    return (
      <RecordStateCard
        title="損益表"
        message="載入損益表時發生錯誤，請稍後再試。"
        tone="error"
      />
    );
  }

  if (isLoading || !is) {
    return <RecordStateCard title="損益表" message="載入中…" />;
  }

  const hasAnyRow =
    is.operatingRevenue.rows.length > 0 ||
    is.cogs.rows.length > 0 ||
    is.opex.rows.length > 0 ||
    is.nonOperatingIncome.rows.length > 0 ||
    is.nonOperatingExpense.rows.length > 0 ||
    is.incomeTax.rows.length > 0;

  const accountHref = (code: string) =>
    `/firm/${firmId}/client/${clientId}/reports/account/${code}?asOf=${toDate}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">損益表</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">期間</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportPeriodSelector
            mode="range"
            fromDate={fromDate}
            toDate={toDate}
            onChange={({ fromDate: f, toDate: t }) =>
              setRange({ fromDate: f, toDate: t })
            }
          />
          <div className="mt-3 text-sm text-muted-foreground">
            區間:{fromDate} ~ {toDate}
          </div>
        </CardContent>
      </Card>

      {!hasAnyRow && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-base text-muted-foreground">
            此期間無已過帳分錄。可切換期間查看其他區間。
          </CardContent>
        </Card>
      )}

      <ReportSectionCard
        title="營業收入"
        section={is.operatingRevenue}
        linkBuilder={accountHref}
      />
      <ReportSectionCard
        title="營業成本"
        section={is.cogs}
        linkBuilder={accountHref}
      />
      <SubtotalRow label="營業毛利" amount={is.grossProfit} />
      <ReportSectionCard
        title="營業費用"
        section={is.opex}
        linkBuilder={accountHref}
      />
      <SubtotalRow label="營業淨利" amount={is.operatingIncome} />
      <ReportSectionCard
        title="業外收入"
        section={is.nonOperatingIncome}
        linkBuilder={accountHref}
      />
      <ReportSectionCard
        title="業外損失"
        section={is.nonOperatingExpense}
        linkBuilder={accountHref}
      />
      <SubtotalRow label="稅前淨利" amount={is.preTaxIncome} />
      <ReportSectionCard
        title="所得稅費用"
        section={is.incomeTax}
        linkBuilder={accountHref}
      />

      <Card className="bg-primary/5 border-primary/40">
        <CardContent className="flex items-center justify-between py-6">
          <span className="text-xl font-semibold">本期淨利</span>
          <AmountCell amount={is.netIncome} className="text-3xl font-bold" />
        </CardContent>
      </Card>
    </div>
  );
}
