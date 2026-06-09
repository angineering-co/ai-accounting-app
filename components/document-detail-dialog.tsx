"use client";

import { FilePreview } from "@/components/file-preview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocumentRow } from "@/hooks/use-other-documents";

interface DocumentDetailDialogProps {
  document: DocumentRow | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Detail view for an `other` document: original-file preview plus a read-only
// fields panel. The fields are laid out as label/value rows so the panel can be
// swapped for an editable form (doc_date, a label, notes) when the editable-fields
// work lands — see UPLOAD_CLASSIFIER_PHASED_PLAN.md PR-1a.
export function DocumentDetailDialog({
  document,
  isOpen,
  onOpenChange,
}: DocumentDetailDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl">
        <DialogHeader>
          <DialogTitle>文件詳情</DialogTitle>
          <DialogDescription>其他文件（非發票 / 折讓）。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <FilePreview
            storagePath={document?.file_url}
            bucketName="documents"
            active={isOpen}
            rawStoragePath
            className="h-[60vh]"
          />

          <dl className="space-y-4 text-base">
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">類型</dt>
              <dd className="text-slate-900">其他文件</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">上傳時間</dt>
              <dd className="text-slate-900">
                {formatDateTime(document?.created_at ?? null)}
              </dd>
            </div>
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
