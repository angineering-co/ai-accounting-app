"use client";

import { useState, useEffect } from "react";
import {
  Table,
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
} from "lucide-react";
import { type Invoice } from "@/lib/domain/models";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type JoinedInvoice = Invoice & {
  client?: { id: string; name: string } | null;
};

interface InvoiceTableProps {
  invoices: JoinedInvoice[];
  isLoading: boolean;
  onReview?: (invoice: Invoice) => void;
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

  const getTypeIndicator = (inOrOut: Invoice["in_or_out"]) => {
    const label = inOrOut === "in" ? "進項發票" : "銷項發票";
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
    if (amount === undefined || amount === null) return "-";
    return amount.toLocaleString("zh-TW");
  };

  return (
    <div className="border rounded-md">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">發票字軌</TableHead>
            {showClientColumn && (
              <TableHead className="w-[180px]">客戶</TableHead>
            )}
            <TableHead className="w-[120px]">類型</TableHead>
            <TableHead className="w-[140px]">發票類型</TableHead>
            <TableHead className="w-[120px] text-right">金額</TableHead>
            <TableHead className="w-[120px] text-right">稅額</TableHead>
            <TableHead className="w-[120px]">發票日期</TableHead>
            <TableHead className="w-[100px]">狀態</TableHead>
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
                onClick={() => onReview?.(invoice)}
              >
                <TableCell className="w-[180px] font-mono tabular-nums">
                  {invoice.invoice_serial_code ? (
                    invoice.invoice_serial_code
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      TBD
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
                <TableCell className="w-[120px]">
                  {getTypeIndicator(invoice.in_or_out)}
                </TableCell>
                <TableCell
                  className="w-[140px] truncate"
                  title={invoice.extracted_data?.invoiceType || "-"}
                >
                  {invoice.extracted_data?.invoiceType || "-"}
                </TableCell>
                <TableCell className="w-[120px] text-right tabular-nums">
                  {formatAmount(invoice.extracted_data?.totalSales)}
                </TableCell>
                <TableCell className="w-[120px] text-right tabular-nums">
                  {formatAmount(invoice.extracted_data?.tax)}
                </TableCell>
                <TableCell className="w-[120px]">
                  {invoice.extracted_data?.date || "-"}
                </TableCell>
                <TableCell className="w-[100px]">
                  {getStatusBadge(invoice.status || "uploaded")}
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
                                onReview(invoice);
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
      </Table>
    </div>
  );
}
