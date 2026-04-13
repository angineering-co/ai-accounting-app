"use client";

import { use, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Camera, Info, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { clientSchema } from "@/lib/domain/models";
import { RocPeriod } from "@/lib/domain/roc-period";
import {
  createTaxPeriod,
  getTaxPeriodByYYYMM,
  getTaxPeriods,
} from "@/lib/services/tax-period";
import { PeriodCard } from "@/components/period-card";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TaxCalendarReminder } from "@/components/tax-calendar-reminder";

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
    <div className="space-y-8 p-6">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-emerald-50/70 p-6 shadow-sm shadow-slate-200/70 md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_36%)]" />
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="rounded-full bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-600">
              更輕鬆報稅
            </Badge>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/80 px-3 py-1 text-base font-medium text-emerald-800 shadow-sm shadow-emerald-100/70">
              <ShieldCheck className="h-4 w-4" />
              專業團隊覆核
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              憑證上傳中心
            </h1>
            <p className="max-w-2xl text-base leading-6 text-slate-600">
              {client.name}（統編: {client.tax_id}）
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-base">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-slate-600 shadow-sm">
              <Camera className="h-4 w-4 text-emerald-600" />
              拍照上傳、輕鬆補件
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-slate-600 shadow-sm">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              AI 辨識、會計師把關
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-start gap-2.5 rounded-xl border border-sky-200/80 bg-sky-50/60 px-4 py-3 text-base text-sky-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
        <p>電子發票不需上傳圖檔，SnapBooks 會自動從電子發票平台下載。</p>
      </div>

      {periods.length === 0 ? (
        <Card className="h-40 animate-pulse border-slate-200 bg-slate-100/70" />
      ) : (
        <div className="space-y-8">
          {primaryPeriod ? (
            <section className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-900">
                    本期優先處理
                  </h2>
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="查看申報截止說明"
                          className="inline-flex items-center rounded-sm text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          每期於次一單月
                          15日（含）前截止，週六、週日順延至次一工作日
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-base text-slate-600">
                  建議先完成本期憑證上傳，避免接近截止日期。
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
              <TaxCalendarReminder />
            </section>
          ) : null}

          {secondaryPeriods.length > 0 ? (
            <section className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">
                  其他期別
                </h2>
                <p className="text-base text-slate-600">
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
