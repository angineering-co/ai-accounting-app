"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { PeriodSelector } from "@/components/period-selector";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/dropzone";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RocPeriod } from "@/lib/domain/roc-period";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import { processElectronicInvoiceFile } from "@/lib/services/invoice-import";

interface InvoiceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firmId: string;
  clientId: string;
  period: RocPeriod;
  onSuccess: () => void;
}

export function InvoiceImportDialog({
  open,
  onOpenChange,
  firmId,
  clientId,
  period,
  onSuccess,
}: InvoiceImportDialogProps) {
  const [importPeriod, setImportPeriod] = useState<RocPeriod>(period);
  const [isProcessingImport, setIsProcessingImport] = useState(false);

  // Sync internal period state with prop
  useEffect(() => {
    setImportPeriod(period);
  }, [period]);

  const importUploadProps = useSupabaseUpload({
    bucketName: "electronic-invoices",
    path: `${firmId}/${importPeriod.toString()}`,
    allowedMimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    maxFiles: 1,
    maxFileSize: 5 * 1024 * 1024,
    getStorageKey: (file) => {
      // Sanitize filename to ensure valid storage key
      const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const timestamp = Date.now();
      return `${timestamp}_${cleanName}`;
    },
    upsert: true, // Allow overwriting if same file uploaded again
  });

  const {
    uploadedFiles: importUploadedFiles,
    setFiles: setImportFiles,
    setUploadedFiles: setImportUploadedFiles,
  } = importUploadProps;

  const handleImportComplete = useCallback(async () => {
    if (isProcessingImport || !importUploadedFiles.length) return;

    setIsProcessingImport(true);

    try {
      const file = importUploadedFiles[0];

      const result = await processElectronicInvoiceFile(
        clientId,
        firmId,
        file.path,
        file.name,
        importPeriod.toString(),
      );

      if (result.inserted > 0 || result.updated > 0) {
        toast.success(
          `成功匯入 ${result.inserted + result.updated} 筆發票 (新增 ${result.inserted} 筆，更新 ${result.updated} 筆)`,
        );
        onOpenChange(false);
        setImportFiles([]);
        setImportUploadedFiles([]);
        onSuccess();
      }

      if (result.failed > 0) {
        toast.error(`${result.failed} 筆發票匯入失敗，請查看詳情`);
        console.error("Import errors:", result.errors);
      }
    } catch (error) {
      console.error("Processing error:", error);
      toast.error("處理檔案時發生錯誤");
    } finally {
      setIsProcessingImport(false);
    }
  }, [
    clientId,
    firmId,
    isProcessingImport,
    importUploadedFiles,
    setImportFiles,
    setImportUploadedFiles,
    onSuccess,
    importPeriod,
    onOpenChange,
  ]);

  // Trigger import processing when upload succeeds
  useEffect(() => {
    if (
      importUploadProps.isSuccess &&
      !isProcessingImport &&
      importUploadedFiles.length > 0
    ) {
      handleImportComplete();
    }
  }, [
    importUploadProps.isSuccess,
    isProcessingImport,
    handleImportComplete,
    importUploadedFiles.length,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>匯入電子發票</DialogTitle>
          <DialogDescription>
            請選擇所屬期別並上傳電子發票 Excel 檔。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>所屬期別</Label>
            <PeriodSelector
              value={importPeriod}
              onChange={setImportPeriod}
              disabled={true}
            />
          </div>

          <div className="space-y-2">
            <Label>檔案 (Excel)</Label>
            {isProcessingImport ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  正在解析並匯入發票...
                </p>
              </div>
            ) : (
              <Dropzone {...importUploadProps}>
                <DropzoneEmptyState />
                <DropzoneContent />
              </Dropzone>
            )}
          </div>
        </div>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
