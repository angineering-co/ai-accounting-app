"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FilePreview } from "@/components/file-preview";
import { renameOtherDocument } from "@/lib/services/document";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { DocumentRow } from "@/hooks/use-other-documents";

interface DocumentDetailDialogProps {
  document: DocumentRow | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed?: () => void | Promise<void>;
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

// Detail view for an `other` document: original-file preview plus an editable
// filename and read-only metadata. `documents.filename` is the source of truth
// for `other` docs, so the name field saves directly. More editable fields
// (doc_date, notes) can join the same panel later.
export function DocumentDetailDialog({
  document,
  isOpen,
  onOpenChange,
  onRenamed,
}: DocumentDetailDialogProps) {
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reload the editable name whenever the dialog opens on a (different) document.
  useEffect(() => {
    if (isOpen) setName(document?.filename ?? "");
  }, [isOpen, document]);

  const trimmed = name.trim();
  const isDirty = !!document && trimmed !== "" && trimmed !== (document.filename ?? "");

  const handleSave = async () => {
    if (!document || !isDirty) return;
    setIsSaving(true);
    try {
      await renameOtherDocument(document.id, trimmed);
      toast.success("檔名已更新");
      await onRenamed?.();
    } catch (error) {
      console.error(error);
      toast.error("更新失敗");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] max-w-5xl"
        // Don't auto-focus (and select) the filename input on open — the dialog
        // is for viewing first; renaming is opt-in.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
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

          <div className="space-y-4 text-base">
            <div className="space-y-2">
              <Label htmlFor="document-filename" className="text-sm text-muted-foreground">
                檔名
              </Label>
              <div className="flex gap-2">
                <Input
                  id="document-filename"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="未命名"
                  disabled={isSaving}
                />
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!isDirty || isSaving}
                >
                  儲存
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">類型</p>
              <p className="text-slate-900">其他文件</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">上傳時間</p>
              <p className="text-slate-900">
                {formatDateTime(document?.created_at ?? null)}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
