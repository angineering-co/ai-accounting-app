"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import useSWR from "swr";

import { AmountCell } from "@/components/amount-cell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportPeriodSelector } from "@/components/report-period-selector";
import { RecordStateCard } from "@/components/record-state-card";
import { ReportSectionCard } from "@/components/report-section-card";
import { SYNTHETIC_NET_INCOME_CODE } from "@/lib/services/financial-statements";
import { getBalanceSheet } from "@/lib/services/voucher";
import { formatDateToISO, formatNTD } from "@/lib/utils";

export default function BalanceSheetPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = use(params);
  const router = useRouter();

  const [asOfDate, setAsOfDate] = useState<string>(() =>
    formatDateToISO(new Date()),
  );

  const { data: bs, isLoading, error } = useSWR(
    ["balance-sheet", clientId, asOfDate],
    () => getBalanceSheet(clientId, asOfDate),
    { keepPreviousData: true },
  );

  if (error) {
    return (
      <RecordStateCard
        title="資產負債表"
        message="載入資產負債表時發生錯誤，請稍後再試。"
        tone="error"
      />
    );
  }

  if (isLoading || !bs) {
    return <RecordStateCard title="資產負債表" message="載入中…" />;
  }

  const hasAnyRow =
    bs.assets.rows.length > 0 ||
    bs.liabilities.rows.length > 0 ||
    bs.equity.rows.length > 0;

  const accountHref = (code: string) =>
    code === SYNTHETIC_NET_INCOME_CODE
      ? null
      : `/firm/${firmId}/client/${clientId}/reports/account/${code}?asOf=${asOfDate}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">資產負債表</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">截止日</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportPeriodSelector
            mode="asOf"
            asOfDate={asOfDate}
            onChange={({ asOfDate: d }) => setAsOfDate(d)}
          />
          <div className="mt-3 text-sm text-muted-foreground">
            截止:{asOfDate}
          </div>
        </CardContent>
      </Card>

      {!hasAnyRow && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-base text-muted-foreground">
            截止日前無已過帳分錄。可調整截止日查看其他區間。
          </CardContent>
        </Card>
      )}

      {!bs.isBalanced && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="size-5 text-destructive" />
            <div className="text-base">
              <span className="font-medium text-destructive">
                資產 ≠ 負債 + 權益
              </span>
              <span className="ml-2 text-muted-foreground">
                差額:
                <span className="font-mono ml-1">
                  {formatNTD(bs.imbalance)}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
        <ReportSectionCard
          title="資產"
          section={bs.assets}
          linkBuilder={accountHref}
          subtotalSuffix="合計"
        />
        <div className="flex flex-col gap-4">
          <ReportSectionCard
            title="負債"
            section={bs.liabilities}
            linkBuilder={accountHref}
            subtotalSuffix="合計"
          />
          <ReportSectionCard
            title="權益"
            section={bs.equity}
            highlightSyntheticRow
            linkBuilder={accountHref}
            subtotalSuffix="合計"
          />
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 py-6">
          <div className="flex items-center justify-between">
            <span className="text-base font-medium">資產合計</span>
            <AmountCell amount={bs.totalAssets} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-base font-medium">負債 + 權益合計</span>
            <AmountCell amount={bs.totalLiabilitiesAndEquity} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
