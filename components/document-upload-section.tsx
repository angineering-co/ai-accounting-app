"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { FileError } from "react-dropzone";
import { toast } from "sonner";
import { createInvoice } from "@/lib/services/invoice";
import { createAllowance } from "@/lib/services/allowance";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import { usePreAiUploadQueue } from "@/hooks/use-pre-ai-upload-queue";
import { InvoiceDeleteDialog } from "@/components/invoice/invoice-delete-dialog";
import { AllowanceDeleteDialog } from "@/components/allowance-delete-dialog";
import { MobileUploadActions } from "@/components/mobile-upload-actions";
import { UploadQueueList } from "@/components/upload-queue-list";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type DeleteTarget = {
  id: string;
  name: string;
};

export type DocumentUploadSectionProps = {
  title: string;
  firmId: string;
  clientId: string;
  periodId: string;
  periodYYYMM: string;
  type: "invoice" | "allowance";
  inOrOut: "in" | "out";
  isLocked: boolean;
  onUploaded: () => Promise<unknown>;
};

export type DocumentUploadSectionHandle = {
  addFiles: (files: File[]) => void;
};

export const DocumentUploadSection = forwardRef<
  DocumentUploadSectionHandle,
  DocumentUploadSectionProps
>(function DocumentUploadSection(
  {
    title,
    firmId,
    clientId,
    periodId,
    periodYYYMM,
    type,
    inOrOut,
    isLocked,
    onUploaded,
  },
  ref,
) {
  const autoUploadPending = useRef(false);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [queueItemToDelete, setQueueItemToDelete] =
    useState<DeleteTarget | null>(null);
  const {
    items: queueItems,
    hasMore,
    pageSize,
    isLoading: isQueueLoading,
    isLoadingMore: isQueueLoadingMore,
    fetchNextPage,
    refresh: refreshQueue,
  } = usePreAiUploadQueue({
    periodId,
    inOrOut,
    type,
  });

  const uploadProps = useSupabaseUpload({
    bucketName: "invoices",
    path: `${firmId}/${periodYYYMM}/${clientId}`,
    allowedMimeTypes: ["image/*", "application/pdf"],
    maxFiles: 10,
    maxFileSize: 50 * 1024 * 1024,
    getStorageKey: (file) => {
      const ext = file.name.split(".").pop();
      return `${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
    },
  });

  const {
    uploadedFiles,
    setFiles: setUploadFiles,
    setUploadedFiles: setUploadedFilesList,
  } = uploadProps;

  useImperativeHandle(ref, () => ({
    addFiles: (newFiles: File[]) => {
      const prepared = newFiles.map((f) => {
        const uf = f as File & {
          preview?: string;
          errors: readonly FileError[];
        };
        uf.preview = URL.createObjectURL(f);
        uf.errors = [];
        return uf;
      });
      setUploadFiles((prev) => [...prev, ...prepared]);
      autoUploadPending.current = true;
    },
  }));

  // Auto-trigger upload when files are injected via the FAB
  useEffect(() => {
    if (
      autoUploadPending.current &&
      uploadProps.files.length > 0 &&
      !uploadProps.loading
    ) {
      autoUploadPending.current = false;
      uploadProps.onUpload();
    }
  }, [uploadProps.files.length, uploadProps.loading, uploadProps.onUpload]);

  const handleUploadComplete = useCallback(async () => {
    if (isProcessingUpload || uploadedFiles.length === 0) return;
    setIsProcessingUpload(true);
    try {
      await Promise.all(
        uploadedFiles.map(async (uploadedFile) => {
          if (type === "invoice") {
            await createInvoice({
              firm_id: firmId,
              client_id: clientId,
              storage_path: uploadedFile.path,
              filename: uploadedFile.name,
              in_or_out: inOrOut,
              year_month: periodYYYMM,
              tax_filing_period_id: periodId,
            });
            return;
          }

          await createAllowance({
            firm_id: firmId,
            client_id: clientId,
            storage_path: uploadedFile.path,
            filename: uploadedFile.name,
            in_or_out: inOrOut,
            tax_filing_period_id: periodId,
          });
        }),
      );

      toast.success(`${title}上傳成功`);
      await onUploaded();
      await refreshQueue();
      setUploadFiles([]);
      setUploadedFilesList([]);
    } catch (error) {
      console.error(error);
      toast.error(`${title}上傳失敗`);
    } finally {
      setIsProcessingUpload(false);
    }
  }, [
    clientId,
    firmId,
    inOrOut,
    isProcessingUpload,
    onUploaded,
    periodId,
    periodYYYMM,
    title,
    type,
    uploadedFiles,
    setUploadFiles,
    setUploadedFilesList,
    refreshQueue,
  ]);

  useEffect(() => {
    if (uploadProps.isSuccess && !isProcessingUpload) {
      handleUploadComplete();
    }
  }, [uploadProps.isSuccess, isProcessingUpload, handleUploadComplete]);

  const handleQueueDeleteSuccess = async () => {
    await onUploaded();
    await refreshQueue();
  };

  return (
    <>
      <Card className="border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
        <CardHeader className="border-b border-slate-100/80">
          <CardTitle className="text-slate-900">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {isLocked ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              此期別已鎖定，無法上傳新檔案。
            </p>
          ) : (
            <div className="space-y-2">
              <Label className="text-slate-700">
                檔案上傳（僅支援 PDF / 圖片）
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
          )}
        </CardContent>
      </Card>
      <div className="md:hidden">
        <UploadQueueList
          items={queueItems}
          isLoading={isQueueLoading}
          isLoadingMore={isQueueLoadingMore}
          hasMore={hasMore}
          pageSize={pageSize}
          onLoadMore={fetchNextPage}
          onDelete={
            isLocked
              ? undefined
              : (item) =>
                  setQueueItemToDelete({ id: item.id, name: item.filename })
          }
        />
      </div>
      {type === "invoice" ? (
        <InvoiceDeleteDialog
          invoice={queueItemToDelete}
          open={!!queueItemToDelete}
          onOpenChange={(open) => !open && setQueueItemToDelete(null)}
          onSuccess={handleQueueDeleteSuccess}
        />
      ) : (
        <AllowanceDeleteDialog
          allowance={queueItemToDelete}
          open={!!queueItemToDelete}
          onOpenChange={(open) => !open && setQueueItemToDelete(null)}
          onSuccess={handleQueueDeleteSuccess}
        />
      )}
    </>
  );
});
