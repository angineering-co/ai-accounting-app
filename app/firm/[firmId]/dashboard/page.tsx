import Link from "next/link";
import { BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listPeriodsReadyForReview } from "@/lib/services/tax-period";
import { RocPeriod } from "@/lib/domain/roc-period";
import { formatDateZhTW } from "@/lib/utils";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = await params;
  const readyForReview = await listPeriodsReadyForReview(firmId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to your accounting workspace.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium">Active Firm</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Connected</div>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              ID: {firmId}
            </p>
          </CardContent>
        </Card>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center border-t border-dashed mt-4">
            <p className="text-muted-foreground italic">Charts and analytics will appear here.</p>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center border-t border-dashed mt-4">
            <p className="text-muted-foreground italic">No recent activity found.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
