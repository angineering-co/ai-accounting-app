"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "heic",
  "heif",
]);

const isImageFilename = (filename: string | null | undefined) => {
  if (!filename) return false;
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
};

const isPdfFilename = (filename: string | null | undefined) => {
  return filename?.toLowerCase().endsWith(".pdf") ?? false;
};

interface FilePreviewDialogProps {
  filename?: string | null;
  storagePath?: string | null;
  bucketName?: "invoices" | "electronic-invoices";
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilePreviewDialog({
  filename,
  storagePath,
  bucketName = "invoices",
  isOpen,
  onOpenChange,
}: FilePreviewDialogProps) {
  const supabase = createClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isImage = isImageFilename(filename);
  const isPdf = isPdfFilename(filename);
  const isInlinePreviewSupported = isImage || isPdf;

  useEffect(() => {
    let cancelled = false;

    const fetchPreviewUrl = async () => {
      if (!isOpen || !storagePath || !isInlinePreviewSupported) {
        setPreviewUrl(null);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(storagePath, 3600);

        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setPreviewUrl(null);
          return;
        }

        setPreviewUrl(data.signedUrl);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchPreviewUrl();

    return () => {
      cancelled = true;
    };
  }, [isOpen, storagePath, bucketName, isInlinePreviewSupported, supabase]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl">
        <DialogHeader>
          <DialogTitle className="truncate">
            {filename ?? "檔案預覽"}
          </DialogTitle>
          <DialogDescription>僅供檢視原始上傳文件。</DialogDescription>
        </DialogHeader>

        <div className="relative h-[75vh] w-full overflow-hidden rounded-md border bg-muted/30">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>載入預覽中...</span>
            </div>
          ) : !previewUrl ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              {isInlinePreviewSupported
                ? "無法載入預覽"
                : "此檔案類型不支援內嵌預覽"}
            </div>
          ) : isImage ? (
            <Image
              src={previewUrl}
              alt={filename ?? "File Preview"}
              fill
              className="object-contain"
              unoptimized
            />
          ) : isPdf ? (
            <iframe
              src={previewUrl}
              title={filename ?? "File Preview"}
              className="h-full w-full bg-white"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              此檔案類型不支援內嵌預覽
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
