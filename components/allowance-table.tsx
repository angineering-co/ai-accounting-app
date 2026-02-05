"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import { type Allowance } from "@/lib/domain/models";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AllowanceTableProps {
  allowances: Allowance[];
  isLoading: boolean;
  onReview?: (allowance: Allowance) => void;
}

export function AllowanceTable({
  allowances,
  isLoading,
  onReview,
}: AllowanceTableProps) {
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

  const formatAmount = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return "-";
    return amount.toLocaleString("zh-TW");
  };

  return (
    <div className="border rounded-md">
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : allowances.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="h-24 text-center text-muted-foreground"
              >
                無折讓資料。
              </TableCell>
            </TableRow>
          ) : (
            allowances.map((allowance) => {
              const extractedData = allowance.extracted_data;
              const hasUnlinkedWarning = allowance.original_invoice_serial_code && !allowance.original_invoice_id;
              
              return (
                <TableRow 
                  key={allowance.id}
                  className={onReview ? "cursor-pointer hover:bg-muted/50" : ""}
                  onClick={() => onReview?.(allowance)}
                >
                  <TableCell className="font-mono tabular-nums">
                    {allowance.allowance_serial_code || "-"}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    <div className="flex items-center gap-1">
                      {allowance.original_invoice_serial_code || "-"}
                      {hasUnlinkedWarning && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>找不到原始發票</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                  <TableCell>
                    {extractedData?.date || "-"}
                  </TableCell>
                  <TableCell>{getStatusBadge(allowance.status || "uploaded")}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
