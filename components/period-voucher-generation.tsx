"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  CheckCircle2,
  FileStack,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatIsoDateTimeZhTW } from "@/lib/utils";
import {
  generateDraftEntriesByPeriodAction,
  getPeriodEntryStatusAction,
  getPeriodGenerationStatusAction,
} from "@/lib/services/voucher-generation";
import type {
  GeneratePeriodResult,
  VoucherGenerationStatus,
} from "@/lib/services/journal-entry";

interface PeriodVoucherGenerationProps {
  periodId: string;
  firmId: string;
  clientId: string;
  periodYYYMM: string;
}

export function PeriodVoucherGeneration({
  periodId,
  firmId,
  clientId,
  periodYYYMM,
}: PeriodVoucherGenerationProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<GeneratePeriodResult | null>(null);

  // Heavy missing/stale/lastGenerated counts: a set-based scan over the period's
  // confirmed docs. Fetched on load and revalidated only when a run finishes —
  // never on the polling path — so it doesn't re-scan every 2s on large periods.
  const { data: status, mutate: mutateStatus } = useSWR(
    ["period-entry-status", periodId],
    () => getPeriodEntryStatusAction(periodId),
  );

  // Run-state flag only — an O(1) single-row read, polled while a run is in flight
  // (started by this client or anyone else) so the disabled state stays live
  // across reloads / tabs / staff without re-running the heavy count.
  const { data: genStatus, mutate: mutateGenStatus } = useSWR(
    ["period-generation-status", periodId],
    () => getPeriodGenerationStatusAction(periodId),
    {
      refreshInterval: (latest?: VoucherGenerationStatus) =>
        latest === "running" ? 2000 : 0,
    },
  );

  // When a run (this client's or another staff's) flips back to idle, refresh the
  // heavy counts once — off the polling path.
  const prevGenStatus = useRef<VoucherGenerationStatus | undefined>(undefined);
  useEffect(() => {
    if (prevGenStatus.current === "running" && genStatus === "idle") {
      void mutateStatus();
    }
    prevGenStatus.current = genStatus;
  }, [genStatus, mutateStatus]);

  const running = genStatus === "running" || isGenerating;
  const pending = (status?.missing ?? 0) + (status?.stale ?? 0);

  const vatCloseMessage = (result: GeneratePeriodResult): string | null => {
    switch (result.vatClose) {
      case "created":
      case "updated":
        return "已一併產生本期營業稅結算分錄。";
      case "removed":
        return "本期無應繳稅額或留抵，已移除先前的結算分錄。";
      case "skipped-posted":
        return "本期結算分錄已過帳，未變動。";
      case "skipped-no-summary":
        return "尚未產生 .TET_U 申報書，略過營業稅結算分錄。";
      default:
        return null;
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await generateDraftEntriesByPeriodAction(periodId);
      setLastResult(result);
      if (result.failures.length === 0) {
        toast.success(
          `已產生 ${result.generated} 筆、更新 ${result.regenerated} 筆草稿傳票`,
        );
      } else {
        toast.warning(
          `已完成，但有 ${result.failures.length} 筆未能產生，請見下方明細`,
        );
      }
      await Promise.all([mutateStatus(), mutateGenStatus()]);
    } catch (error) {
      toast.error(
        "草稿傳票產生失敗：" +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const buttonLabel = running
    ? "產生中…"
    : pending > 0
      ? `產生草稿傳票（${pending} 筆待更新）`
      : "重新產生草稿傳票";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>草稿傳票</CardTitle>
        <FreshnessBadge
          running={running}
          pending={pending}
          missing={status?.missing ?? 0}
          stale={status?.stale ?? 0}
          lastGenerated={status?.lastGenerated ?? null}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          依本期已確認的發票與折讓單產生草稿傳票。確認新文件或修改後，可隨時重新產生。
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleGenerate} disabled={running}>
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : pending > 0 ? (
              <FileStack className="mr-2 h-4 w-4" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {buttonLabel}
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={`/firm/${firmId}/client/${clientId}/voucher?period=${periodYYYMM}`}
            >
              查看草稿傳票
            </Link>
          </Button>
        </div>

        {lastResult && (
          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-base text-slate-900">
              已產生 {lastResult.generated} 筆，更新 {lastResult.regenerated} 筆。
              {lastResult.failures.length > 0 &&
                ` ${lastResult.failures.length} 筆未能產生：`}
            </p>
            {vatCloseMessage(lastResult) && (
              <p className="text-sm text-slate-600">{vatCloseMessage(lastResult)}</p>
            )}
            {lastResult.failures.length > 0 && (
              <ul className="space-y-1">
                {lastResult.failures.map((f) => (
                  <li
                    key={f.documentId}
                    className="flex items-start gap-2 text-sm text-amber-700"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {f.kind === "invoice" ? "發票" : "折讓單"}：{f.reason}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FreshnessBadge({
  running,
  pending,
  missing,
  stale,
  lastGenerated,
}: {
  running: boolean;
  pending: number;
  missing: number;
  stale: number;
  lastGenerated: string | null;
}) {
  if (running) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-base text-amber-700">
        <Loader2 className="h-4 w-4 animate-spin" /> 產生中…
      </span>
    );
  }
  if (pending > 0) {
    const parts = [
      missing > 0 ? `${missing} 筆未產生` : null,
      stale > 0 ? `${stale} 筆已修改` : null,
    ].filter(Boolean);
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-base text-amber-700">
        需重新產生 · {parts.join("、")}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-base text-slate-600",
      )}
    >
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      {lastGenerated ? `已是最新 · ${formatIsoDateTimeZhTW(lastGenerated)}` : "尚未產生"}
    </span>
  );
}
