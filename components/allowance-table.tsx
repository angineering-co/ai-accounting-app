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

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      {
        label: string;
        variant: "default" | "secondary" | "destructive" | "outline";
      }
    > = {
      uploaded: { label: "已上傳", variant: "secondary" },
      processing: { label: "處理中", variant: "default" },
      processed: { label: "待確認", variant: "outline" },
      confirmed: { label: "已確認", variant: "default" },
      failed: { label: "失敗", variant: "destructive" },
    };

    const config = statusConfig[status] || {
      label: status,
      variant: "outline",
    };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatAmount = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return "-";
    return amount.toLocaleString("zh-TW");
  };

  return (
    <div className="border rounded-md">
      <TooltipProvider>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>折讓單號碼</TableHead>
              <TableHead>原發票號碼</TableHead>
              <TableHead>類型</TableHead>
              <TableHead className="text-right">折讓金額</TableHead>
              <TableHead className="text-right">折讓稅額</TableHead>
              <TableHead>折讓日期</TableHead>
              <TableHead>狀態</TableHead>
              {(onExtractAI || onDelete) && (
                <TableHead className="text-right">操作</TableHead>
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
                  allowance.original_invoice_serial_code &&
                  !allowance.original_invoice_id;

                return (
                  <TableRow
                    key={allowance.id}
                    className={
                      onReview ? "cursor-pointer hover:bg-muted/50" : ""
                    }
                    onClick={() => onReview?.(allowance)}
                  >
                    <TableCell className="font-mono tabular-nums">
                      {allowance.allowance_serial_code || "-"}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      <div className="flex items-center gap-1">
                        {allowance.original_invoice_serial_code || "-"}
                        {hasUnlinkedWarning && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>找不到原始發票</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {allowance.in_or_out === "in" ? "進項折讓" : "銷項折讓"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(extractedData?.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(extractedData?.taxAmount)}
                    </TableCell>
                    <TableCell>{extractedData?.date || "-"}</TableCell>
                    <TableCell>
                      {getStatusBadge(allowance.status || "uploaded")}
                    </TableCell>
                    {(onExtractAI || onDelete) && (
                      <TableCell className="text-right">
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
