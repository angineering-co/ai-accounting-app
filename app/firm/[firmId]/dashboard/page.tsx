import Link from "next/link";
import { AlertTriangle, BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPeriodsReadyForReview } from "@/lib/services/tax-period";
import {
  getCurrentPeriodUploadCounts,
  listStuckOrFailedExtractions,
} from "@/lib/services/firm-dashboard";
import { RocPeriod } from "@/lib/domain/roc-period";
import { cn, formatDateToYYYYMMDD, formatDateZhTW } from "@/lib/utils";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = await params;
  const currentPeriod = RocPeriod.getCurrentUnclosedPeriod();
  const cutoff = currentPeriod.cutoffDate;
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const daysRemaining = Math.ceil(
    (cutoff.getTime() - todayMidnight.getTime()) / 86400000,
  );
  const countdownClass = cn(
    "text-base",
    daysRemaining <= 2
      ? "text-destructive font-medium"
      : daysRemaining <= 7
        ? "text-amber-700"
        : "text-muted-foreground",
  );

  const [readyForReview, stuckOrFailed, uploadCounts] = await Promise.all([
    listPeriodsReadyForReview(firmId),
    listStuckOrFailedExtractions(firmId),
    getCurrentPeriodUploadCounts(firmId, currentPeriod.toString()),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">記帳事務所首頁</h1>
        <p className={countdownClass}>
          本期：{currentPeriod.format()} · 截止日 {formatDateToYYYYMMDD(cutoff)} · 距今 {daysRemaining} 天
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-600" />
            待審核期別
          </CardTitle>
        </CardHeader>
        <CardContent>
          {readyForReview.length === 0 ? (
            <p className="text-base text-muted-foreground">目前沒有待審核的申報期。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {readyForReview.map((item) => {
                const roc = RocPeriod.fromYYYMM(item.year_month);
                const readyDate = formatDateZhTW(item.client_ready_at);
                return (
                  <li key={item.period_id} className="py-3">
                    <Link
                      href={`/firm/${firmId}/client/${item.client_id}/period/${item.year_month}`}
                      className="flex flex-col gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                        <span className="text-base font-medium text-slate-900">
                          {item.client_name}
                        </span>
                        <span className="text-sm text-slate-600">
                          {roc.format()}
                        </span>
                      </div>
                      <span className="text-sm text-amber-700">
                        客戶於 {readyDate} 通知
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            AI 處理失敗 / 卡住
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stuckOrFailed.length === 0 ? (
            <p className="text-base text-muted-foreground">
              目前沒有處理失敗或卡住的項目。
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stuckOrFailed.map((item) => {
                const roc = RocPeriod.fromYYYMM(item.year_month);
                const isFailed = item.status === "failed";
                return (
                  <li key={`${item.kind}-${item.id}`} className="py-3">
                    <Link
                      href={`/firm/${firmId}/client/${item.client_id}/period/${item.year_month}`}
                      className="flex flex-col gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                        <span className="text-base font-medium text-slate-900">
                          {item.client_name}
                        </span>
                        <span className="text-sm text-slate-600">
                          {roc.format()} · {item.kind === "invoice" ? "發票" : "折讓"}
                        </span>
                        <span className="max-w-xs truncate text-sm text-slate-500">
                          {item.filename}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isFailed ? "text-destructive" : "text-amber-700",
                        )}
                      >
                        {isFailed ? "失敗" : "處理中"} · {formatDateZhTW(item.created_at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>本期客戶上傳數量</CardTitle>
        </CardHeader>
        <CardContent>
          {uploadCounts.length === 0 ? (
            <p className="text-base text-muted-foreground">尚無客戶。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客戶</TableHead>
                  <TableHead className="text-right">發票</TableHead>
                  <TableHead className="text-right">折讓</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploadCounts.map((row) => {
                  const isEmpty =
                    row.invoice_count === 0 && row.allowance_count === 0;
                  return (
                    <TableRow
                      key={row.client_id}
                      className={cn(isEmpty && "text-muted-foreground")}
                    >
                      <TableCell>
                        <Link
                          href={`/firm/${firmId}/client/${row.client_id}/period/${currentPeriod.toString()}`}
                        >
                          {row.client_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.invoice_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.allowance_count}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
