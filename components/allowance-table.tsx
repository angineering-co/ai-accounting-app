"use client";

import { useEffect, useState } from "react";
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
import { Loader2, AlertTriangle, Sparkles, MoreHorizontal } from "lucide-react";
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

interface AllowanceTableProps {
  allowances: Allowance[];
  isLoading: boolean;
  onReview?: (allowance: Allowance) => void;
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
    if (amount === undefined || amount === null) return "-";
    return amount.toLocaleString("zh-TW");
  };

  return (
    <div className="border rounded-md">
      <TooltipProvider>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">原發票號碼</TableHead>
              <TableHead className="w-[120px]">類型</TableHead>
              <TableHead className="w-[140px]">發票類型</TableHead>
              <TableHead className="w-[120px] text-right">折讓金額</TableHead>
              <TableHead className="w-[120px] text-right">折讓稅額</TableHead>
              <TableHead className="w-[120px]">折讓日期</TableHead>
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
                    onClick={() => onReview?.(allowance)}
                  >
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
                          TBD
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="w-[120px]">
                      {getTypeIndicator(allowance.in_or_out)}
                    </TableCell>
                    <TableCell
                      className="w-[140px] truncate"
                      title={extractedData?.allowanceType || "-"}
                    >
                      {extractedData?.allowanceType || "-"}
                    </TableCell>
                    <TableCell className="w-[120px] text-right tabular-nums">
                      {formatAmount(extractedData?.amount)}
                    </TableCell>
                    <TableCell className="w-[120px] text-right tabular-nums">
                      {formatAmount(extractedData?.taxAmount)}
                    </TableCell>
                    <TableCell className="w-[120px]">
                      {extractedData?.date || "-"}
                    </TableCell>
                    <TableCell className="w-[100px]">
                      {getStatusBadge(allowance.status || "uploaded")}
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
