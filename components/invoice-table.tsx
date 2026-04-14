"use client";

import { useState, useEffect, useRef } from "react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ExternalLink,
  MoreHorizontal,
  Sparkles,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { type Invoice } from "@/lib/domain/models";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import {
  getSignedPreviewUrl,
  THUMBNAIL_TRANSFORM,
} from "@/lib/supabase/signed-preview-url-cache";

const SIGNED_URL_EXPIRATION_SECONDS = 60 * 30;
const PREVIEW_SIGNING_CONCURRENCY = 6;

type JoinedInvoice = Invoice & {
  client?: { id: string; name: string } | null;
};

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

interface InvoiceTableProps {
  invoices: JoinedInvoice[];
  isLoading: boolean;
  onReview?: (invoice: Invoice, options?: { previewUrl?: string }) => void;
  onExtractAI?: (invoiceId: string) => void;
  onDelete?: (invoice: Invoice) => void;
  showClientColumn?: boolean;
}

export function InvoiceTable({
  invoices,
  isLoading,
  onReview,
  onExtractAI,
  onDelete,
  showClientColumn = true,
}: InvoiceTableProps) {
  const { firmId } = useParams() as { firmId: string };
  const [processingInvoiceIds, setProcessingInvoiceIds] = useState<Set<string>>(
    new Set(),
  );
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  // Sync processing state with actual invoice statuses
  // This effect runs when invoices data refreshes (after SWR fetches new data from parent)
  // The parent component calls fetchInvoices() after extractInvoiceDataAction completes
  useEffect(() => {
    setProcessingInvoiceIds((prev) => {
      const next = new Set(prev);

      // Add all invoices that backend says are processing
      invoices.forEach((invoice) => {
        if (invoice.status === "processing") {
          next.add(invoice.id);
        }
      });

      // Remove invoices that are no longer processing
      // But only if they were in the previous set (to avoid removing user-clicked items prematurely)
      invoices.forEach((invoice) => {
        if (invoice.status !== "processing" && prev.has(invoice.id)) {
          // Only remove if it was previously processing and now it's not
          // This ensures user-clicked items stay until backend confirms the status change
          next.delete(invoice.id);
        }
      });

      return next;
    });
  }, [invoices]);

  useEffect(() => {
    const missingPreviewInvoices = invoices.filter(
      (invoice) =>
        !!invoice.storage_path &&
        isImageFilename(invoice.filename) &&
        !previewUrlsRef.current[invoice.id],
    );

    if (missingPreviewInvoices.length === 0) {
      return;
    }

    let mounted = true;

    const loadPreviews = async () => {
      const results = await mapWithConcurrency(
        missingPreviewInvoices,
        PREVIEW_SIGNING_CONCURRENCY,
        async (invoice) => {
          const signedUrl = await getSignedPreviewUrl({
            bucketName: "invoices",
            storagePath: invoice.storage_path,
            expiresInSeconds: SIGNED_URL_EXPIRATION_SECONDS,
            transform: THUMBNAIL_TRANSFORM,
          });

          if (!signedUrl) {
            return { id: invoice.id, url: null as string | null };
          }

          return { id: invoice.id, url: signedUrl };
        },
      );

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
  }, [invoices]);

  const getTypeIndicator = (inOrOut: Invoice["in_or_out"]) => {
    const label = inOrOut === "in" ? "進項發票" : "銷項發票";
    const barClass = inOrOut === "in" ? "bg-sky-500" : "bg-orange-500";

    return (
      <span className="inline-flex items-center gap-2 text-base text-muted-foreground">
        <span className={`h-4 w-0.5 rounded-full ${barClass}`} />
        {label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { label: string; badgeClass: string; dotClass: string }
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
    <div className="relative w-full overflow-auto max-h-[60vh] border rounded-md">
      <table className="w-full caption-bottom text-base table-fixed">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-[88px]">縮圖</TableHead>
            <TableHead className="w-[180px]">文件識別</TableHead>
            {showClientColumn && (
              <TableHead className="w-[180px]">客戶</TableHead>
            )}
            <TableHead className="w-[180px]">交易資訊</TableHead>
            <TableHead className="w-[120px] text-right">金額</TableHead>
            <TableHead className="w-[120px] text-right">稅額</TableHead>
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
                colSpan={
                  showClientColumn
                    ? onExtractAI || onDelete
                      ? 9
                      : 8
                    : onExtractAI || onDelete
                      ? 8
                      : 7
                }
                className="h-24 text-center"
              >
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : invoices.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={
                  showClientColumn
                    ? onExtractAI || onDelete
                      ? 9
                      : 8
                    : onExtractAI || onDelete
                      ? 8
                      : 7
                }
                className="h-24 text-center text-muted-foreground"
              >
                無發票資料。
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((invoice) => (
              <TableRow
                key={invoice.id}
                className={onReview ? "cursor-pointer hover:bg-muted/50" : ""}
                onClick={() =>
                  onReview?.(invoice, { previewUrl: previewUrls[invoice.id] })
                }
              >
                <TableCell className="w-[88px]">
                  <div className="flex h-12 w-16 items-center justify-center overflow-hidden rounded border bg-muted/20">
                    {previewUrls[invoice.id] ? (
                      <Image
                        src={previewUrls[invoice.id]}
                        alt={invoice.filename}
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
                  {invoice.invoice_serial_code ? (
                    invoice.invoice_serial_code
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      待辨識
                    </span>
                  )}
                </TableCell>
                {showClientColumn && (
                  <TableCell className="w-[180px]">
                    {invoice.client ? (
                      <Link
                        href={`/firm/${firmId}/client/${invoice.client.id}`}
                        className="flex items-center gap-1 truncate text-primary hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {invoice.client.name}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">未指定</span>
                    )}
                  </TableCell>
                )}
                <TableCell
                  className="w-[180px]"
                  title={invoice.extracted_data?.invoiceType || "尚未擷取"}
                >
                  <div className="space-y-1">
                    <div>{getTypeIndicator(invoice.in_or_out)}</div>
                    <p className="truncate text-sm text-muted-foreground">
                      {invoice.extracted_data?.invoiceType || "尚未擷取"}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="w-[120px] text-right tabular-nums">
                  {formatAmount(invoice.extracted_data?.totalSales)}
                </TableCell>
                <TableCell className="w-[120px] text-right tabular-nums">
                  {formatAmount(invoice.extracted_data?.tax)}
                </TableCell>
                <TableCell className="w-[120px]">
                  {invoice.extracted_data?.date || "尚未擷取"}
                </TableCell>
                <TableCell className="w-[140px]">
                  <div className="space-y-1">
                    {getStatusBadge(invoice.status || "uploaded")}
                  </div>
                </TableCell>
                {(onExtractAI || onDelete) && (
                  <TableCell className="w-[88px] text-right">
                    <div className="flex items-center justify-end gap-1">
                      {onExtractAI &&
                        (() => {
                          const isProcessing =
                            invoice.status === "processing" ||
                            processingInvoiceIds.has(invoice.id);
                          return (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-blue-600 hover:text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-400 dark:hover:bg-blue-950/20"
                              onClick={(event) => {
                                event.stopPropagation();
                                setProcessingInvoiceIds((prev) =>
                                  new Set(prev).add(invoice.id),
                                );
                                onExtractAI(invoice.id);
                              }}
                              title={
                                isProcessing
                                  ? "AI 處理中，請稍候..."
                                  : "AI 提取 / 重新提取"
                              }
                              disabled={isProcessing}
                            >
                              {isProcessing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4" />
                              )}
                            </Button>
                          );
                        })()}
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
                          {onReview && (
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                onReview(invoice, {
                                  previewUrl: previewUrls[invoice.id],
                                });
                              }}
                            >
                              預覽與確認
                            </DropdownMenuItem>
                          )}
                          {onExtractAI &&
                            (() => {
                              const isProcessing =
                                invoice.status === "processing" ||
                                processingInvoiceIds.has(invoice.id);
                              return (
                                <DropdownMenuItem
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!isProcessing) {
                                      setProcessingInvoiceIds((prev) =>
                                        new Set(prev).add(invoice.id),
                                      );
                                      onExtractAI(invoice.id);
                                    }
                                  }}
                                  disabled={isProcessing}
                                >
                                  {isProcessing
                                    ? "AI 處理中..."
                                    : "AI 提取 / 重新提取"}
                                </DropdownMenuItem>
                              );
                            })()}
                          {onDelete && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDelete(invoice);
                              }}
                            >
                              刪除發票
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </table>
    </div>
  );
}
