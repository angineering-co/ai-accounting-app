"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowUpCircle, FileText, Trash2 } from "lucide-react";
import { createOtherDocument, deleteOtherDocument } from "@/lib/services/document";
import { useOtherDocuments, type DocumentRow } from "@/hooks/use-other-documents";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import {
  ACCEPTED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BATCH_SIZE,
  MAX_UPLOAD_FILE_SIZE,
  MAX_UPLOAD_FILES,
} from "@/lib/upload-limits";
import { FilePreview } from "@/components/file-preview";
import { DocumentDetailDialog } from "@/components/document-detail-dialog";
import { ConvertDocumentToChildDialog } from "@/components/convert-document-to-child-dialog";
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

const RECEIPT_EXAMPLES = [
  {
    title: "員工、商業保險",
    detail:
      "員工團體保險、雇主為員工投保的商業保險，以及公司投保的產物、責任等商業保險費收據。",
  },
  {
    title: "車票、捷運、火車票（高鐵有統編）",
    detail:
      "因公出差的交通票證。高鐵可在購票時輸入統一編號開立電子發票，記得留存明細。",
  },
  {
    title: "執行業務與規費收據",
    detail:
      "律師、會計師、地政士、記帳士等執行業務者開立的收據，以及向政府機關繳納的登記費、規費、罰鍰等收據。",
  },
  {
    title: "免用統一發票收據",
    detail:
      "小規模營業人或依規定免用統一發票的商家所開立的收據，例如攤商、部分小店家。",
  },
];

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
  // Firm staff get re-classification actions (PR-1b: promote `other` →
  // invoice/allowance). Portal clients see browse / upload / delete only.
  canManage?: boolean;
}

// Shared `/documents` surface for both firm staff and portal clients (PR-1a:
// browse / upload / delete `other` documents — identical for both roles). Firm
// management actions and classifier hints layer on in later PRs.
export function DocumentsView({ firmId, clientId, canManage = false }: DocumentsViewProps) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<DocumentRow | null>(null);
  const [toDelete, setToDelete] = useState<DocumentRow | null>(null);
  const [toConvert, setToConvert] = useState<DocumentRow | null>(null);
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
    allowedMimeTypes: ACCEPTED_UPLOAD_MIME_TYPES,
    maxFiles: MAX_UPLOAD_FILES,
    maxFileSize: MAX_UPLOAD_FILE_SIZE,
    maxTotalSize: MAX_UPLOAD_BATCH_SIZE,
    getStorageKey: (file) => {
      // lastIndexOf, not split('.').pop(): an extension-less name like "myfile"
      // would otherwise yield "myfile" as the "extension". Leading-dot files
      // (".env") have dotIdx === 0 and correctly get no extension.
      const dotIdx = file.name.lastIndexOf(".");
      const ext = dotIdx > 0 ? file.name.slice(dotIdx + 1) : null;
      return `${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
    },
  });

  const { uploadedFiles, setFiles, setUploadedFiles, isSuccess } = uploadProps;

  const handleUploadComplete = useCallback(async () => {
    if (isProcessingUpload || uploadedFiles.length === 0) return;
    setIsProcessingUpload(true);
    try {
      // allSettled so one failed row doesn't abort the rest. Clear the queue
      // immediately after, before mutate, so a partial failure can't re-trigger
      // this effect and re-create the already-succeeded documents (duplicates).
      const results = await Promise.allSettled(
        uploadedFiles.map((uploadedFile) =>
          createOtherDocument({
            firm_id: firmId,
            client_id: clientId,
            storage_path: uploadedFile.path,
            filename: uploadedFile.name,
          }),
        ),
      );
      setFiles([]);
      setUploadedFiles([]);

      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        failures.forEach((f) => console.error(f.reason));
        toast.error(`有 ${failures.length} 個文件上傳失敗`);
      } else {
        toast.success("其他文件上傳成功");
      }

      await mutate();
      setPage(0);
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
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-base font-medium text-slate-700">
                常見的收據範例
              </p>
              <p className="mt-1 text-sm text-slate-500">
                拿不到統一發票、但仍可列為費用的單據，都可以放這裡。
              </p>
              <ul className="mt-3 space-y-3">
                {RECEIPT_EXAMPLES.map((example) => (
                  <li key={example.title} className="text-base text-slate-700">
                    <span className="font-medium">{example.title}</span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {example.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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
                  <p
                    className="truncate text-base font-medium text-slate-900"
                    title={doc.filename ?? undefined}
                  >
                    {doc.filename ?? "其他文件"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    上傳 {formatUploadDate(doc.created_at)}
                  </p>
                </div>
              </button>
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="轉為發票 / 折讓"
                    title="轉為發票 / 折讓"
                    className="h-8 w-8 bg-white/80 text-slate-700 hover:bg-white hover:text-slate-900"
                    onClick={() => setToConvert(doc)}
                  >
                    <ArrowUpCircle className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="刪除文件"
                  className="h-8 w-8 bg-white/80 text-destructive hover:bg-white hover:text-destructive"
                  onClick={() => setToDelete(doc)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
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
        onRenamed={async () => {
          await mutate();
        }}
      />

      {canManage && (
        <ConvertDocumentToChildDialog
          document={toConvert}
          clientId={clientId}
          isOpen={!!toConvert}
          onOpenChange={(open) => !open && setToConvert(null)}
          onConverted={async () => {
            await mutate();
          }}
        />
      )}

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
