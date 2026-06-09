"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { getSignedPreviewUrl } from "@/lib/supabase/signed-preview-url-cache";
import { toDocumentsKey } from "@/lib/storage/documents-key";
import { cn } from "@/lib/utils";

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

const isImageFile = (nameOrPath: string | null | undefined) => {
  if (!nameOrPath) return false;
  const ext = nameOrPath.split(".").pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
};

const isPdfFile = (nameOrPath: string | null | undefined) => {
  return nameOrPath?.toLowerCase().endsWith(".pdf") ?? false;
};

export interface FilePreviewProps {
  /** Original filename, used for type detection when present. */
  filename?: string | null;
  /** Storage path of the file. Also used for type detection when no filename is given. */
  storagePath?: string | null;
  bucketName?: "documents" | "electronic-invoices";
  initialPreviewUrl?: string;
  /** Whether to load the preview. Defaults to true; the dialog passes its open state. */
  active?: boolean;
  /** Controls the height/sizing of the preview surface. */
  className?: string;
}

// Inline preview surface for an uploaded document: fetches a (cached) signed URL and
// renders images via next/image and PDFs via an iframe. Type detection falls back to the
// storage path's extension so callers that only have a storage_path (no filename) still
// work. `FilePreviewDialog` wraps this in a modal; the voucher detail page renders it
// inline.
export function FilePreview({
  filename,
  storagePath,
  bucketName = "documents",
  initialPreviewUrl,
  active = true,
  className,
}: FilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const typeSource = filename ?? storagePath;
  const isImage = isImageFile(typeSource);
  const isPdf = isPdfFile(typeSource);
  const isInlinePreviewSupported = isImage || isPdf;

  useEffect(() => {
    let cancelled = false;

    const fetchPreviewUrl = async () => {
      if (!active || !storagePath || !isInlinePreviewSupported) {
        setPreviewUrl(null);
        return;
      }

      if (initialPreviewUrl) {
        setPreviewUrl(initialPreviewUrl);
      }

      setIsLoading(!initialPreviewUrl);
      try {
        const signedUrl = await getSignedPreviewUrl({
          bucketName,
          storagePath:
            bucketName === "documents"
              ? toDocumentsKey(storagePath)
              : storagePath,
          expiresInSeconds: 3600,
          transform: isImage ? { quality: 80 } : undefined,
        });

        if (cancelled) return;
        if (!signedUrl) {
          setPreviewUrl(null);
          return;
        }

        setPreviewUrl(signedUrl);
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
  }, [
    active,
    storagePath,
    bucketName,
    isInlinePreviewSupported,
    isImage,
    initialPreviewUrl,
  ]);

  return (
    <div
      className={cn(
        // Default height so inner fill/h-full elements don't collapse to 0 when no
        // height is passed; tailwind-merge lets callers override via className (h-[75vh] etc).
        "relative w-full h-96 overflow-hidden rounded-md border bg-muted/30",
        className,
      )}
    >
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>載入預覽中...</span>
        </div>
      ) : !previewUrl ? (
        <div className="flex h-full w-full items-center justify-center text-base text-muted-foreground">
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
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-base text-muted-foreground">
          此檔案類型不支援內嵌預覽
        </div>
      )}
    </div>
  );
}
