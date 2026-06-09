"use client";

import { FilePreview } from "@/components/file-preview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FilePreviewDialogProps {
  filename?: string | null;
  storagePath?: string | null;
  bucketName?: "documents" | "electronic-invoices";
  initialPreviewUrl?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilePreviewDialog({
  filename,
  storagePath,
  bucketName = "documents",
  initialPreviewUrl,
  isOpen,
  onOpenChange,
}: FilePreviewDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl">
        <DialogHeader>
          <DialogTitle className="truncate">
            {filename ?? "檔案預覽"}
          </DialogTitle>
          <DialogDescription>僅供檢視原始上傳文件。</DialogDescription>
        </DialogHeader>

        <FilePreview
          filename={filename}
          storagePath={storagePath}
          bucketName={bucketName}
          initialPreviewUrl={initialPreviewUrl}
          active={isOpen}
          className="h-[75vh]"
        />
      </DialogContent>
    </Dialog>
  );
}
