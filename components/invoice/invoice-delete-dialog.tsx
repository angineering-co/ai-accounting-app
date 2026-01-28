"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deleteInvoice } from "@/lib/services/invoice";
import { type Invoice } from "@/lib/domain/models";

interface InvoiceDeleteDialogProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function InvoiceDeleteDialog({
  invoice,
  open,
  onOpenChange,
  onSuccess,
}: InvoiceDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteInvoice = async () => {
    if (!invoice) return;
    setIsDeleting(true);
    try {
      await deleteInvoice(invoice.id);
      toast.success("刪除成功");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      toast.error("刪除失敗");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">確認刪除</DialogTitle>
          <DialogDescription>
            確定要刪除發票 「{invoice?.filename}」 嗎？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteInvoice}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            確認刪除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
