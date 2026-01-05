"use client";

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
  Eye, 
  Loader2, 
  Pencil, 
  Trash2,
  ExternalLink
} from "lucide-react";
import { type Invoice } from "@/lib/domain/models";
import Link from "next/link";
import { useParams } from "next/navigation";

type JoinedInvoice = Invoice & {
  client?: { id: string; name: string } | null;
};

interface InvoiceTableProps {
  invoices: JoinedInvoice[];
  isLoading: boolean;
  onReview?: (invoice: Invoice) => void;
  onSimulateAI?: (invoiceId: string) => void;
  onEdit?: (invoice: Invoice) => void;
  onDelete?: (invoice: Invoice) => void;
  showClientColumn?: boolean;
}

export function InvoiceTable({
  invoices,
  isLoading,
  onReview,
  onSimulateAI,
  onEdit,
  onDelete,
  showClientColumn = true
}: InvoiceTableProps) {
  const { firmId } = useParams() as { firmId: string };

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
                <TableCell className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {invoice.filename}
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
                  {invoice.in_or_out === "in" ? "進項發票" : "銷項發票"}
                </TableCell>
                <TableCell>{getStatusBadge(invoice.status || "uploaded")}</TableCell>
                <TableCell>
                  {invoice.created_at ? invoice.created_at.toLocaleDateString("zh-TW") : "-"}
                </TableCell>
                <TableCell className="text-right flex items-center justify-end gap-1">
                  {(invoice.status === "processed" || invoice.status === "confirmed") && onReview && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => onReview(invoice)}
                      title="確認內容"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  {invoice.status === "uploaded" && onSimulateAI && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-amber-600 hover:text-amber-600 hover:bg-amber-100"
                      onClick={() => onSimulateAI(invoice.id)}
                      title="模擬 AI 處理"
                    >
                      <Loader2 className="h-4 w-4" />
                    </Button>
                  )}
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(invoice)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">編輯</span>
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onDelete(invoice)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">刪除</span>
                    </Button>
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

