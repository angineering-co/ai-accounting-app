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
import { deleteAllowance } from "@/lib/services/allowance";
import { type Allowance } from "@/lib/domain/models";

interface AllowanceDeleteDialogProps {
  allowance: Allowance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AllowanceDeleteDialog({
  allowance,
  open,
  onOpenChange,
  onSuccess,
}: AllowanceDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAllowance = async () => {
    if (!allowance) return;
    setIsDeleting(true);
    try {
      await deleteAllowance(allowance.id);
      toast.success("刪除成功");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Error deleting allowance:", error);
      toast.error("刪除失敗");
    } finally {
      setIsDeleting(false);
    }
  };

  const label = allowance?.allowance_serial_code || allowance?.filename || "-";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">確認刪除</DialogTitle>
          <DialogDescription>確定要刪除折讓「{label}」嗎？</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteAllowance}
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
