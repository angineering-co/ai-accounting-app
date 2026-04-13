"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, RotateCcw, XCircle } from "lucide-react";
import {
  bulkEnqueueExtractionAction,
  getBulkExtractionProgress,
} from "@/lib/services/bulk-extraction";
import { toast } from "sonner";

interface BulkExtractionProgressProps {
  periodId: string;
  isLocked: boolean;
  /** Total number of invoices + allowances in the period */
  totalEntities: number;
  /** Called after bulk extraction changes entity statuses */
  onRefresh: () => void;
}

export function BulkExtractionProgress({
  periodId,
  isLocked,
  totalEntities,
  onRefresh,
}: BulkExtractionProgressProps) {
  const [isEnqueuing, setIsEnqueuing] = useState(false);
  const [isBulkActive, setIsBulkActive] = useState(false);

  // Poll progress while bulk extraction is active
  const { data: progress } = useSWR(
    isBulkActive ? ["extraction-progress", periodId] : null,
    () => getBulkExtractionProgress(periodId),
    { refreshInterval: 3000 },
  );

  // Auto-stop polling when all processing is done
  useEffect(() => {
    if (progress && isBulkActive) {
      if (progress.processing === 0) {
        // All done — stop polling, refresh parent data
        setIsBulkActive(false);
        onRefresh();
        if (progress.failed > 0) {
          toast.warning(`AI 批次處理完成，${progress.failed} 筆失敗`);
        } else {
          toast.success("AI 批次處理完成");
        }
      }
    }
  }, [progress, isBulkActive, onRefresh]);

  const handleBulkExtract = async () => {
    try {
      setIsEnqueuing(true);
      const result = await bulkEnqueueExtractionAction(periodId);

      if (result.enqueuedCount === 0) {
        toast.info("沒有需要處理的項目");
        return;
      }

      toast.info(`已排入 ${result.enqueuedCount} 筆 AI 提取任務`);
      setIsBulkActive(true);
      onRefresh();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "排入失敗";
      toast.error(msg);
    } finally {
      setIsEnqueuing(false);
    }
  };

  const handleRetryFailed = async () => {
    // Re-run bulk enqueue — only picks up 'failed' items due to idempotency
    await handleBulkExtract();
  };

  // Compute display values
  const completed = progress
    ? progress.processed + progress.confirmed
    : 0;
  const processingCount = progress?.processing ?? 0;
  const failedCount = progress?.failed ?? 0;
  const total = progress?.total ?? totalEntities;
  const doneCount = completed + failedCount;
  const progressPercent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Show retry button if there are failed items and nothing is currently processing
  const showRetryButton = !isBulkActive && failedCount > 0 && processingCount === 0;

  return (
    <div className="flex items-center gap-3">
      {/* Progress indicator while active */}
      {isBulkActive && progress && (
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-center gap-2 text-base text-muted-foreground whitespace-nowrap">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              AI 批次處理中 {doneCount}/{total}
              {failedCount > 0 && (
                <span className="text-destructive ml-1">
                  ({failedCount} 失敗)
                </span>
              )}
            </span>
          </div>
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden min-w-[100px] max-w-[200px]">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Completion summary (shown briefly after done, if there were failures) */}
      {!isBulkActive && progress && processingCount === 0 && failedCount > 0 && (
        <div className="flex items-center gap-2 text-base">
          <XCircle className="h-4 w-4 text-destructive" />
          <span className="text-destructive">
            {failedCount} 筆 AI 提取失敗
          </span>
        </div>
      )}

      {/* Retry failed button */}
      {showRetryButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRetryFailed}
          disabled={isEnqueuing}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          重試失敗項目
        </Button>
      )}

      {/* Main bulk extract button */}
      {!isBulkActive && (
        <Button
          variant="outline"
          onClick={handleBulkExtract}
          disabled={isLocked || isEnqueuing || totalEntities === 0}
        >
          {isEnqueuing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          AI 批次提取
        </Button>
      )}
    </div>
  );
}
