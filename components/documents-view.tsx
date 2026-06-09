"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Trash2 } from "lucide-react";
import { createOtherDocument, deleteOtherDocument } from "@/lib/services/document";
import { useOtherDocuments, type DocumentRow } from "@/hooks/use-other-documents";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import { FilePreview } from "@/components/file-preview";
import { DocumentDetailDialog } from "@/components/document-detail-dialog";
import { MobileUploadActions } from "@/components/mobile-upload-actions";
import { TablePagination } from "@/components/table-pagination";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_SIZE = 24;

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

const isImagePath = (path: string | null) => {
  const ext = path?.split(".").pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
};

const formatUploadDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

interface DocumentsViewProps {
  firmId: string;
  clientId: string;
}

// Shared `/documents` surface for both firm staff and portal clients (PR-1a:
// browse / upload / delete `other` documents — identical for both roles). Firm
// management actions and classifier hints layer on in later PRs.
export function DocumentsView({ firmId, clientId }: DocumentsViewProps) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<DocumentRow | null>(null);
  const [toDelete, setToDelete] = useState<DocumentRow | null>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { documents, totalCount, isLoading, mutate } = useOtherDocuments({
    clientId,
    page,
    pageSize: PAGE_SIZE,
  });

  const uploadProps = useSupabaseUpload({
    bucketName: "documents",
    // Periodless, client-scoped path — `other` files are not filed under a period.
    path: `${firmId}/${clientId}/other`,
    allowedMimeTypes: ["image/*", "application/pdf"],
    maxFiles: 10,
    maxFileSize: 50 * 1024 * 1024,
    getStorageKey: (file) => {
      const ext = file.name.split(".").pop();
      return `${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
    },
  });

  const { uploadedFiles, setFiles, setUploadedFiles, isSuccess } = uploadProps;

  const handleUploadComplete = useCallback(async () => {
    if (isProcessingUpload || uploadedFiles.length === 0) return;
    setIsProcessingUpload(true);
    try {
      await Promise.all(
        uploadedFiles.map((uploadedFile) =>
          createOtherDocument({
            firm_id: firmId,
            client_id: clientId,
            storage_path: uploadedFile.path,
          }),
        ),
      );
      toast.success("其他文件上傳成功");
      await mutate();
      setFiles([]);
      setUploadedFiles([]);
      setPage(0);
    } catch (error) {
      console.error(error);
      toast.error("其他文件上傳失敗");
    } finally {
      setIsProcessingUpload(false);
    }
  }, [
    isProcessingUpload,
    uploadedFiles,
    firmId,
    clientId,
    mutate,
    setFiles,
    setUploadedFiles,
  ]);

  useEffect(() => {
    if (isSuccess && !isProcessingUpload) {
      handleUploadComplete();
    }
  }, [isSuccess, isProcessingUpload, handleUploadComplete]);

  const handleDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      await deleteOtherDocument(toDelete.id);
      toast.success("文件已刪除");
      await mutate();
      setToDelete(null);
    } catch (error) {
      console.error(error);
      toast.error("刪除失敗");
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
        <CardHeader className="border-b border-slate-100/80">
          <CardTitle className="text-slate-900">其他文件</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label className="text-slate-700">
              上傳非發票 / 折讓的文件（收據、帳單、其他單據；僅支援 PDF / 圖片）
            </Label>
            <Dropzone {...uploadProps}>
              <div className="md:hidden">
                <MobileUploadActions
                  files={uploadProps.files}
                  setFiles={uploadProps.setFiles}
                  allowedMimeTypes={uploadProps.allowedMimeTypes}
                  maxFileSize={uploadProps.maxFileSize}
                  maxFiles={uploadProps.maxFiles}
                />
              </div>
              <DropzoneEmptyState className="hidden md:flex" />
              <DropzoneContent />
            </Dropzone>
          </div>
        </CardContent>
      </Card>

      {isLoading && documents.length === 0 ? (
        <p className="px-2 py-8 text-center text-base text-muted-foreground">
          載入中...
        </p>
      ) : documents.length === 0 ? (
        <p className="px-2 py-8 text-center text-base text-muted-foreground">
          尚無其他文件。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => setSelected(doc)}
                className="block w-full text-left"
              >
                <div className="flex h-40 items-center justify-center overflow-hidden bg-muted/30">
                  {isImagePath(doc.file_url) ? (
                    <FilePreview
                      storagePath={doc.file_url}
                      bucketName="documents"
                      rawStoragePath
                      className="h-40 rounded-none border-0"
                    />
                  ) : (
                    <FileText className="h-12 w-12 text-slate-400" />
                  )}
                </div>
                <div className="space-y-0.5 p-3">
                  <p className="text-base font-medium text-slate-900">其他文件</p>
                  <p className="text-sm text-muted-foreground">
                    上傳 {formatUploadDate(doc.created_at)}
                  </p>
                </div>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="刪除文件"
                className="absolute right-2 top-2 h-8 w-8 bg-white/80 text-destructive opacity-0 transition-opacity hover:bg-white hover:text-destructive group-hover:opacity-100"
                onClick={() => setToDelete(doc)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <TablePagination
        page={page}
        totalPages={totalPages}
        totalItems={totalCount}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <DocumentDetailDialog
        document={selected}
        isOpen={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && !isDeleting && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這份文件？</AlertDialogTitle>
            <AlertDialogDescription>
              文件與其原始檔案將一併刪除，無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              保留文件
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
