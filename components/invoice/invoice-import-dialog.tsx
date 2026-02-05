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
  onAllowanceSuccess?: () => void; // Optional callback when allowances are imported
}

export function InvoiceImportDialog({
  open,
  onOpenChange,
  firmId,
  clientId,
  period,
  onSuccess,
  onAllowanceSuccess,
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
    maxFiles: 4, // Allow up to 4 files (in/out invoices + in/out allowances)
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
      // Process all files in parallel
      const results = await Promise.allSettled(
        importUploadedFiles.map(file =>
          processElectronicInvoiceFile(
            clientId,
            firmId,
            file.path,
            file.name,
            importPeriod.toString(),
          )
        )
      );

      // Aggregate results by type
      const aggregated = {
        invoices: { inserted: 0, updated: 0, failed: 0 },
        allowances: { inserted: 0, updated: 0, failed: 0 },
        errors: [] as string[],
      };

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const r = result.value;
          if (r.fileType === 'allowance') {
            aggregated.allowances.inserted += r.inserted;
            aggregated.allowances.updated += r.updated;
            aggregated.allowances.failed += r.failed;
          } else {
            aggregated.invoices.inserted += r.inserted;
            aggregated.invoices.updated += r.updated;
            aggregated.invoices.failed += r.failed;
          }
          aggregated.errors.push(...r.errors);
        } else {
          aggregated.errors.push(`${importUploadedFiles[index].name}: ${result.reason}`);
        }
      });

      // Show success messages
      const invoiceCount = aggregated.invoices.inserted + aggregated.invoices.updated;
      const allowanceCount = aggregated.allowances.inserted + aggregated.allowances.updated;
      const totalSuccess = invoiceCount + allowanceCount;

      if (totalSuccess > 0) {
        const messages: string[] = [];
        if (invoiceCount > 0) {
          messages.push(`${invoiceCount} 筆發票`);
        }
        if (allowanceCount > 0) {
          messages.push(`${allowanceCount} 筆折讓`);
        }
        toast.success(`成功匯入 ${messages.join('、')}`);
        
        onOpenChange(false);
        setImportFiles([]);
        setImportUploadedFiles([]);
        onSuccess();
        
        // Also refresh allowances if any were imported
        if (allowanceCount > 0 && onAllowanceSuccess) {
          onAllowanceSuccess();
        }
      }

      // Show error messages
      const totalFailed = aggregated.invoices.failed + aggregated.allowances.failed;
      if (totalFailed > 0 || aggregated.errors.length > 0) {
        toast.error(`${totalFailed} 筆匯入失敗，請查看詳情`);
        console.error("Import errors:", aggregated.errors);
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
    onAllowanceSuccess,
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
          <DialogTitle>匯入電子發票/折讓</DialogTitle>
          <DialogDescription>
            上傳電子發票或折讓 Excel 檔（最多 4 個檔案），系統會自動識別檔案類型。
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
