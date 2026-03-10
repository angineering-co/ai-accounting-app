"use client";

import { useEffect, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertTriangle,
  Sparkles,
  MoreHorizontal,
  FileText,
} from "lucide-react";
import { type Allowance } from "@/lib/domain/models";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { getSignedPreviewUrl } from "@/lib/supabase/signed-preview-url-cache";
import Image from "next/image";

const SIGNED_URL_EXPIRATION_SECONDS = 60 * 30;
const PREVIEW_SIGNING_CONCURRENCY = 6;

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "heic",
  "heif",
]);

const isImageFilename = (filename: string | null | undefined) => {
  if (!filename) return false;
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
};

interface AllowanceTableProps {
  allowances: Allowance[];
  isLoading: boolean;
  onReview?: (allowance: Allowance, options?: { previewUrl?: string }) => void;
  onExtractAI?: (allowanceId: string) => void;
  onDelete?: (allowance: Allowance) => void;
}

export function AllowanceTable({
  allowances,
  isLoading,
  onReview,
  onExtractAI,
  onDelete,
}: AllowanceTableProps) {
  const [processingAllowanceIds, setProcessingAllowanceIds] = useState<
    Set<string>
  >(new Set());
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    setProcessingAllowanceIds((prev) => {
      const next = new Set(prev);

      allowances.forEach((allowance) => {
        if (allowance.status === "processing") {
          next.add(allowance.id);
        }
      });

      allowances.forEach((allowance) => {
        if (allowance.status !== "processing" && prev.has(allowance.id)) {
          next.delete(allowance.id);
        }
      });

      return next;
    });
  }, [allowances]);

  useEffect(() => {
    const missingPreviewAllowances = allowances.filter(
      (allowance) =>
        !!allowance.storage_path &&
        isImageFilename(allowance.filename) &&
        !previewUrlsRef.current[allowance.id],
    );

    if (missingPreviewAllowances.length === 0) {
      return;
    }

    // Guard async completion so we don't update state after unmount/re-run.
    let mounted = true;

    const loadPreviews = async () => {
      const results = await mapWithConcurrency(
        missingPreviewAllowances,
        PREVIEW_SIGNING_CONCURRENCY,
        async (allowance) => {
          if (!allowance.storage_path) {
            return { id: allowance.id, url: null as string | null };
          }

          const signedUrl = await getSignedPreviewUrl({
            bucketName: "invoices",
            storagePath: allowance.storage_path,
            expiresInSeconds: SIGNED_URL_EXPIRATION_SECONDS,
          });

          if (!signedUrl) {
            return { id: allowance.id, url: null as string | null };
          }

          return { id: allowance.id, url: signedUrl };
        },
      );

      // Skip state update if this effect has already been cleaned up.
      if (!mounted) return;

      setPreviewUrls((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const result of results) {
          if (result.url && !next[result.id]) {
            next[result.id] = result.url;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    void loadPreviews();

    return () => {
      mounted = false;
    };
  }, [allowances]);

  const getTypeIndicator = (inOrOut: Allowance["in_or_out"]) => {
    const label = inOrOut === "in" ? "進項折讓" : "銷項折讓";
    const barClass = inOrOut === "in" ? "bg-sky-500" : "bg-orange-500";

    return (
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <span className={`h-4 w-0.5 rounded-full ${barClass}`} />
        {label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      {
        label: string;
        badgeClass: string;
        dotClass: string;
      }
    > = {
      uploaded: {
        label: "已上傳",
        badgeClass:
          "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300",
        dotClass: "bg-slate-500",
      },
      processing: {
        label: "處理中",
        badgeClass:
          "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
        dotClass: "bg-blue-500 animate-pulse",
      },
      processed: {
        label: "待確認",
        badgeClass:
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        dotClass: "bg-amber-500",
      },
      confirmed: {
        label: "已確認",
        badgeClass:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        dotClass: "bg-emerald-500",
      },
      failed: {
        label: "失敗",
        badgeClass:
          "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
        dotClass: "bg-rose-500",
      },
    };

    const config = statusConfig[status] || {
      label: status,
      badgeClass:
        "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300",
      dotClass: "bg-slate-500",
    };

    return (
      <Badge
        variant="outline"
        className={`min-w-[72px] justify-center gap-1.5 ${config.badgeClass}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`} />
        {config.label}
      </Badge>
    );
  };

  const formatAmount = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return "尚未擷取";
    return amount.toLocaleString("zh-TW");
  };

  return (
    <div className="border rounded-md">
      <TooltipProvider>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[88px]">縮圖</TableHead>
              <TableHead className="w-[180px]">文件識別</TableHead>
              <TableHead className="w-[180px]">交易資訊</TableHead>
              <TableHead className="w-[120px] text-right">折讓金額</TableHead>
              <TableHead className="w-[120px] text-right">折讓稅額</TableHead>
              <TableHead className="w-[120px]">日期</TableHead>
              <TableHead className="w-[140px]">狀態</TableHead>
              {(onExtractAI || onDelete) && (
                <TableHead className="w-[88px] text-right">操作</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={onExtractAI || onDelete ? 8 : 7}
                  className="h-24 text-center"
                >
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : allowances.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={onExtractAI || onDelete ? 8 : 7}
                  className="h-24 text-center text-muted-foreground"
                >
                  無折讓資料。
                </TableCell>
              </TableRow>
            ) : (
              allowances.map((allowance) => {
                const extractedData = allowance.extracted_data;
                const hasUnlinkedWarning =
                  Boolean(allowance.original_invoice_serial_code) &&
                  !allowance.original_invoice_id;

                return (
                  <TableRow
                    key={allowance.id}
                    className={
                      onReview ? "cursor-pointer hover:bg-muted/50" : ""
                    }
                    onClick={() =>
                      onReview?.(allowance, {
                        previewUrl: previewUrls[allowance.id],
                      })
                    }
                  >
                    <TableCell className="w-[88px]">
                      <div className="flex h-12 w-16 items-center justify-center overflow-hidden rounded border bg-muted/20">
                        {previewUrls[allowance.id] ? (
                          <Image
                            src={previewUrls[allowance.id]}
                            alt={allowance.filename ?? "折讓憑證"}
                            className="h-full w-full object-cover"
                            width={64}
                            height={48}
                            loading="lazy"
                            unoptimized
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" />
                            檔案
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="w-[180px] font-mono tabular-nums">
                      {allowance.original_invoice_serial_code ? (
                        <span className="inline-flex items-center gap-1">
                          <span>{allowance.original_invoice_serial_code}</span>
                          {hasUnlinkedWarning && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>找不到原始發票</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          待辨識
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className="w-[180px]"
                      title={extractedData?.allowanceType || "尚未擷取"}
                    >
                      <div className="space-y-1">
                        <div>{getTypeIndicator(allowance.in_or_out)}</div>
                        <p className="truncate text-xs text-muted-foreground">
                          {extractedData?.allowanceType || "尚未擷取"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="w-[120px] text-right tabular-nums">
                      {formatAmount(extractedData?.amount)}
                    </TableCell>
                    <TableCell className="w-[120px] text-right tabular-nums">
                      {formatAmount(extractedData?.taxAmount)}
                    </TableCell>
                    <TableCell className="w-[120px]">
                      {extractedData?.date || "尚未擷取"}
                    </TableCell>
                    <TableCell className="w-[140px]">
                      <div className="space-y-1">
                        {getStatusBadge(allowance.status || "uploaded")}
                      </div>
                    </TableCell>
                    {(onExtractAI || onDelete) && (
                      <TableCell className="w-[88px] text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onExtractAI &&
                            (() => {
                              const isProcessing =
                                allowance.status === "processing" ||
                                processingAllowanceIds.has(allowance.id);
                              const isImported =
                                extractedData?.source === "import-excel";
                              const isDisabled = isProcessing || isImported;
                              const button = (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-blue-600 hover:text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-400 dark:hover:bg-blue-950/20"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (isDisabled) return;
                                    setProcessingAllowanceIds((prev) =>
                                      new Set(prev).add(allowance.id),
                                    );
                                    onExtractAI(allowance.id);
                                  }}
                                  title={
                                    isProcessing
                                      ? "AI 處理中，請稍候..."
                                      : "AI 提取 / 重新提取"
                                  }
                                  disabled={isDisabled}
                                >
                                  {isProcessing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4" />
                                  )}
                                </Button>
                              );

                              if (!isImported) {
                                return button;
                              }

                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>{button}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>電子發票匯入不需 AI</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}

                          {onDelete && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">更多操作</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onDelete(allowance);
                                  }}
                                >
                                  刪除折讓
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TooltipProvider>
    </div>
  );
}
