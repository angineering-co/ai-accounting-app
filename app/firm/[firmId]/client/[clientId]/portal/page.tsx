"use client";

import { use, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { clientSchema } from "@/lib/domain/models";
import { RocPeriod } from "@/lib/domain/roc-period";
import {
  createTaxPeriod,
  getTaxPeriodByYYYMM,
  getTaxPeriods,
} from "@/lib/services/tax-period";
import { PeriodCard } from "@/components/period-card";
import { toast } from "sonner";

export default function PortalDashboardPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = use(params);
  const supabase = createSupabaseClient();
  const [isEnsuringPeriod, setIsEnsuringPeriod] = useState(false);
  const currentUnclosedPeriod = RocPeriod.getCurrentUnclosedPeriod();
  const currentUnclosedYearMonth = currentUnclosedPeriod.toString();

  const { data: client, isLoading: isClientLoading } = useSWR(
    ["portal-client", clientId],
    async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();

      if (error) throw error;
      return clientSchema.parse(data);
    },
  );

  const {
    data: periods = [],
    isLoading: isPeriodsLoading,
    mutate: mutatePeriods,
  } = useSWR(["portal-periods", clientId], () => getTaxPeriods(clientId));

  useEffect(() => {
    const ensureCurrentPeriod = async () => {
      setIsEnsuringPeriod(true);
      try {
        const existing = await getTaxPeriodByYYYMM(
          clientId,
          currentUnclosedYearMonth,
        );
        if (!existing) {
          await createTaxPeriod(clientId, currentUnclosedYearMonth);
          await mutatePeriods();
        }
      } catch (error) {
        console.error(error);
        toast.error("建立本期申報期別失敗");
      } finally {
        setIsEnsuringPeriod(false);
      }
    };

    ensureCurrentPeriod();
  }, [clientId, currentUnclosedYearMonth, mutatePeriods]);

  const rankedPeriods = useMemo(() => {
    return [...periods].sort((a, b) => {
      const aIsCurrentUnclosed = a.year_month === currentUnclosedYearMonth;
      const bIsCurrentUnclosed = b.year_month === currentUnclosedYearMonth;

      if (aIsCurrentUnclosed !== bIsCurrentUnclosed) {
        return aIsCurrentUnclosed ? -1 : 1;
      }

      return b.year_month.localeCompare(a.year_month);
    });
  }, [currentUnclosedYearMonth, periods]);

  const primaryPeriod = useMemo(() => {
    const currentUnclosed = rankedPeriods.find(
      (period) => period.year_month === currentUnclosedYearMonth,
    );

    return currentUnclosed ?? rankedPeriods[0] ?? null;
  }, [currentUnclosedYearMonth, rankedPeriods]);

  const secondaryPeriods = useMemo(() => {
    if (!primaryPeriod) {
      return [];
    }

    return rankedPeriods.filter((period) => period.id !== primaryPeriod.id);
  }, [primaryPeriod, rankedPeriods]);

  if (isClientLoading || isPeriodsLoading || isEnsuringPeriod) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!client) {
    return <div className="p-6 text-center">找不到客戶</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">客戶入口網站</h1>
        <p className="text-muted-foreground mt-1">
          {client.name}（統編: {client.tax_id}）
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          目前優先處理期別：{currentUnclosedPeriod.format()} 
          <br />（每期於次一單月 15日（含）前截止，週六、週日順延至次一工作日）
        </p>
      </div>

      {periods.length === 0 ? (
        <Card className="h-40 animate-pulse bg-muted" />
      ) : (
        <div className="space-y-8">
          {primaryPeriod ? (
            <section className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">本期優先處理</h2>
                <p className="text-sm text-muted-foreground">
                  建議先完成本期憑證上傳，避免接近截止日期時集中處理。
                </p>
              </div>
              <PeriodCard
                period={primaryPeriod}
                firmId={firmId}
                clientId={clientId}
                managePath={`/firm/${firmId}/client/${clientId}/portal/period/${primaryPeriod.year_month}`}
                variant="primary"
                actionLabel="上傳本期資料"
              />
            </section>
          ) : null}

          {secondaryPeriods.length > 0 ? (
            <section className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">其他期別</h2>
                <p className="text-sm text-muted-foreground">
                  可隨時切換查看過往或未完成期別。
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {secondaryPeriods.map((period) => (
                  <PeriodCard
                    key={period.id}
                    period={period}
                    firmId={firmId}
                    clientId={clientId}
                    managePath={`/firm/${firmId}/client/${clientId}/portal/period/${period.year_month}`}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
