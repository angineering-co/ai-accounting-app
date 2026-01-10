"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Loader2,
  ExternalLink,
  MoreHorizontal,
  Sparkles
} from "lucide-react";
import { type Invoice } from "@/lib/domain/models";
import { RocPeriod } from "@/lib/domain/roc-period";
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
  onEdit?: (invoice: Invoice) => void;
  onDelete?: (invoice: Invoice) => void;
  showClientColumn?: boolean;
}

export function InvoiceTable({
  invoices,
  isLoading,
  onReview,
  onExtractAI,
  onEdit,
  onDelete,
  showClientColumn = true
}: InvoiceTableProps) {
  const { firmId } = useParams() as { firmId: string };
  const [processingInvoiceIds, setProcessingInvoiceIds] = useState<Set<string>>(new Set());

  // Sync processing state with actual invoice statuses
  // This effect runs when invoices data refreshes (after SWR fetches new data from parent)
  // The parent component calls fetchInvoices() after extractInvoiceDataAction completes
  useEffect(() => {
    setProcessingInvoiceIds(prev => {
      const next = new Set(prev);
      
      // Add all invoices that backend says are processing
      invoices.forEach(invoice => {
        if (invoice.status === "processing") {
          next.add(invoice.id);
        }
      });
      
      // Remove invoices that are no longer processing
      // But only if they were in the previous set (to avoid removing user-clicked items prematurely)
      invoices.forEach(invoice => {
        if (invoice.status !== "processing" && prev.has(invoice.id)) {
          // Only remove if it was previously processing and now it's not
          // This ensures user-clicked items stay until backend confirms the status change
          next.delete(invoice.id);
        }
      });
      
      return next;
    });
  }, [invoices]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      uploaded: { label: "已上傳", variant: "secondary" },
      processing: { label: "處理中", variant: "default" },
      processed: { label: "待確認", variant: "outline" },
      confirmed: { label: "已確認", variant: "default" },
      failed: { label: "失敗", variant: "destructive" },
    };

    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>檔案名稱</TableHead>
            {showClientColumn && <TableHead>客戶</TableHead>}
            <TableHead>所屬期別</TableHead>
            <TableHead>類型</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead>上傳時間</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={showClientColumn ? 6 : 5} className="h-24 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : invoices.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showClientColumn ? 6 : 5}
                className="h-24 text-center text-muted-foreground"
              >
                無發票資料。
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left hover:text-primary hover:underline focus:outline-none"
                    onClick={() => onReview?.(invoice)}
                    title="點擊預覽發票影像與內容"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{invoice.filename}</span>
                  </button>
                </TableCell>
                {showClientColumn && (
                  <TableCell>
                    {invoice.client ? (
                      <Link 
                        href={`/firm/${firmId}/client/${invoice.client.id}`}
                        className="hover:underline flex items-center gap-1 text-primary"
                      >
                        {invoice.client.name}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">未指定</span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {invoice.year_month ? (
                    <span className="text-sm">
                      {RocPeriod.fromYYYMM(invoice.year_month).format()}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {invoice.in_or_out === "in" ? "進項發票" : "銷項發票"}
                </TableCell>
                <TableCell>{getStatusBadge(invoice.status || "uploaded")}</TableCell>
                <TableCell>
                  {invoice.created_at ? invoice.created_at.toLocaleDateString("zh-TW") : "-"}
                </TableCell>
                <TableCell className="text-right flex items-center justify-end gap-1">
                  {onExtractAI && (() => {
                    const isProcessing = invoice.status === "processing" || processingInvoiceIds.has(invoice.id);
                    return (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-blue-600 hover:text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-400 dark:hover:bg-blue-950/20"
                        onClick={() => {
                          // Immediately show spinner
                          setProcessingInvoiceIds(prev => new Set(prev).add(invoice.id));
                          // Call the handler
                          onExtractAI(invoice.id);
                          // The useEffect will sync with actual status once data refreshes
                        }}
                        title={isProcessing ? "AI 處理中，請稍候..." : "AI 提取 / 重新提取"}
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

                  {(onReview || onExtractAI || onEdit || onDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">更多操作</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onReview && (
                          <DropdownMenuItem onClick={() => onReview(invoice)}>
                            預覽與確認
                          </DropdownMenuItem>
                        )}
                        {onExtractAI && (() => {
                          const isProcessing = invoice.status === "processing" || processingInvoiceIds.has(invoice.id);
                          return (
                            <DropdownMenuItem
                              onClick={() => {
                                if (!isProcessing) {
                                  setProcessingInvoiceIds(prev => new Set(prev).add(invoice.id));
                                  onExtractAI(invoice.id);
                                  // The useEffect will sync with actual status once data refreshes
                                }
                              }}
                              disabled={isProcessing}
                            >
                              {isProcessing ? "AI 處理中..." : "AI 提取 / 重新提取"}
                            </DropdownMenuItem>
                          );
                        })()}
                        {onEdit && (
                          <DropdownMenuItem onClick={() => onEdit(invoice)}>
                            編輯帳務資料
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDelete(invoice)}
                          >
                            刪除發票
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

