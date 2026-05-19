"use client";

import { use, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

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
import { accountLabel } from "@/lib/data/accounts";
import {
  seedVoucherDemoFor,
  useVoucherDemoStore,
} from "@/lib/dev/use-voucher-demo-store";
import { getAccountLedger } from "@/lib/services/financial-statements";
import { cn, formatDateToISO, formatNTD } from "@/lib/utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function AccountLedgerPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string; accountCode: string }>;
}) {
  const { firmId, clientId, accountCode } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useVoucherDemoStore();

  useEffect(() => {
    seedVoucherDemoFor(firmId, clientId);
  }, [firmId, clientId]);

  const asOfDate = useMemo(() => {
    const raw = searchParams.get("asOf");
    return raw && ISO_DATE.test(raw) ? raw : formatDateToISO(new Date());
  }, [searchParams]);

  const ledger = useMemo(
    () =>
      getAccountLedger({
        entries: store.entries,
        lines: store.lines,
        clientId,
        accountCode,
        asOfDate,
      }),
    [store.entries, store.lines, clientId, accountCode, asOfDate],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight font-mono">
          {accountCode}
        </h1>
        <h2 className="text-2xl font-semibold tracking-tight text-muted-foreground">
          {accountLabel(accountCode).replace(`${accountCode} `, "")}
        </h2>
        <Badge variant="outline" className="text-sm">
          示範資料(Phase 3)
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">期末餘額</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="text-base text-muted-foreground">
            截止:{asOfDate}
          </div>
          <AmountCell
            amount={ledger.closingBalance}
            className="text-2xl"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">分錄明細</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">日期</TableHead>
                <TableHead className="w-40">傳票號碼</TableHead>
                <TableHead>摘要</TableHead>
                <TableHead className="text-right w-32">借方</TableHead>
                <TableHead className="text-right w-32">貸方</TableHead>
                <TableHead className="text-right w-36">餘額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    截止日前此科目尚無分錄
                  </TableCell>
                </TableRow>
              ) : (
                ledger.rows.map((row) => {
                  const reversed = row.status === "reversed";
                  const strike = reversed
                    ? "line-through text-muted-foreground"
                    : undefined;
                  return (
                    <TableRow
                      key={row.entryId}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50",
                        reversed && "opacity-60",
                      )}
                      onClick={() =>
                        router.push(
                          `/firm/${firmId}/client/${clientId}/voucher/${row.entryId}`,
                        )
                      }
                    >
                      <TableCell className={cn("text-base", strike)}>
                        {row.entryDate}
                      </TableCell>
                      <TableCell
                        className={cn("font-mono text-base", strike)}
                      >
                        {row.voucherNo}
                      </TableCell>
                      <TableCell className={cn("text-base", strike)}>
                        {row.description ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.debit > 0 ? (
                          <span className="font-mono text-base">
                            {formatNTD(row.debit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.credit > 0 ? (
                          <span className="font-mono text-base">
                            {formatNTD(row.credit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <AmountCell amount={row.runningBalance} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
