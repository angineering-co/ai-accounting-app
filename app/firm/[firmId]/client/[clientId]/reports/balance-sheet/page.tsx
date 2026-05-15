"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import { AmountCell } from "@/components/amount-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportPeriodSelector } from "@/components/report-period-selector";
import {
  computeBalanceSheet,
  SYNTHETIC_NET_INCOME_CODE,
  type ReportSection,
} from "@/lib/services/financial-statements";
import {
  seedVoucherDemoFor,
  useVoucherDemoStore,
} from "@/lib/dev/use-voucher-demo-store";
import { formatDateToISO, formatNTD } from "@/lib/utils";

function SectionCard({
  title,
  section,
  highlightSyntheticRow,
}: {
  title: string;
  section: ReportSection;
  highlightSyntheticRow?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{title}</span>
          <AmountCell amount={section.subtotal} />
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">科目代碼</TableHead>
              <TableHead>科目名稱</TableHead>
              <TableHead className="text-right">金額</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {section.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center py-6 text-sm text-muted-foreground"
                >
                  尚無資料
                </TableCell>
              </TableRow>
            ) : (
              section.rows.map((row) => {
                const synthetic =
                  highlightSyntheticRow &&
                  row.accountCode === SYNTHETIC_NET_INCOME_CODE;
                return (
                  <TableRow
                    key={row.accountCode}
                    className={synthetic ? "bg-muted/30" : undefined}
                  >
                    <TableCell className="font-mono text-base">
                      {row.accountCode}
                    </TableCell>
                    <TableCell className="text-base">
                      {row.accountName}
                      {synthetic && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          (合成,即時計算)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <AmountCell amount={row.amount} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
            {section.rows.length > 0 && (
              <TableRow className="bg-muted/40">
                <TableCell colSpan={2} className="font-medium text-base">
                  {title}合計
                </TableCell>
                <TableCell className="text-right">
                  <AmountCell amount={section.subtotal} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function BalanceSheetPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = use(params);
  const router = useRouter();
  const store = useVoucherDemoStore();

  useEffect(() => {
    seedVoucherDemoFor(firmId, clientId);
  }, [firmId, clientId]);

  const [asOfDate, setAsOfDate] = useState<string>(() =>
    formatDateToISO(new Date()),
  );

  const bs = useMemo(
    () =>
      computeBalanceSheet({
        entries: store.entries,
        lines: store.lines,
        clientId,
        asOfDate,
      }),
    [store.entries, store.lines, clientId, asOfDate],
  );

  const hasAnyRow =
    bs.assets.rows.length > 0 ||
    bs.liabilities.rows.length > 0 ||
    bs.equity.rows.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">資產負債表</h1>
        <Badge variant="outline" className="text-sm">
          示範資料(Phase 3)
        </Badge>
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
            截止日前無已過帳分錄。可調整截止日或點上方「套用示範資料截止日」查看示範數字。
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="資產" section={bs.assets} />
        <SectionCard title="負債" section={bs.liabilities} />
        <SectionCard
          title="權益"
          section={bs.equity}
          highlightSyntheticRow
        />
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
