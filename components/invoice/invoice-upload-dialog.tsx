"use client";

import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PeriodSelector } from "@/components/period-selector";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/dropzone";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { RocPeriod } from "@/lib/domain/roc-period";
import { createInvoice } from "@/lib/services/invoice";
import { createAllowance } from "@/lib/services/allowance";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";

const uploadFormSchema = z.object({
  document_type: z.enum([
    "invoice-in",
    "invoice-out",
    "allowance-in",
    "allowance-out",
  ]),
  period: z.instanceof(RocPeriod),
});

type UploadFormInput = z.infer<typeof uploadFormSchema>;

const documentTypeOptions = [
  { value: "invoice-in", label: "進項發票", type: "invoice", inOrOut: "in" },
  { value: "invoice-out", label: "銷項發票", type: "invoice", inOrOut: "out" },
  { value: "allowance-in", label: "進項折讓", type: "allowance", inOrOut: "in" },
  { value: "allowance-out", label: "銷項折讓", type: "allowance", inOrOut: "out" },
] as const;

type DocumentTypeValue = (typeof documentTypeOptions)[number]["value"];

const getDocumentTypeMeta = (value: DocumentTypeValue) => {
  const match = documentTypeOptions.find((option) => option.value === value);
  if (!match) {
    return { type: "invoice" as const, inOrOut: "in" as const };
  }
  return { type: match.type, inOrOut: match.inOrOut };
};

interface InvoiceUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firmId: string;
  clientId: string;
  period: RocPeriod;
  periodId: string;
  clientName: string;
  onSuccess: () => void;
  onAllowanceSuccess: () => void;
}

export function InvoiceUploadDialog({
  open,
  onOpenChange,
  firmId,
  clientId,
  period,
  periodId,
  clientName,
  onSuccess,
  onAllowanceSuccess,
}: InvoiceUploadDialogProps) {
  const [uploadFolderId, setUploadFolderId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

  const uploadForm = useForm<UploadFormInput>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      document_type: "invoice-in",
      period: period,
    },
  });

  // Reset form when dialog opens/closes or period changes
  useEffect(() => {
    if (open) {
      uploadForm.reset({
        document_type: "invoice-in",
        period: period,
      });
    }
  }, [open, period, uploadForm]);

  const uploadProps = useSupabaseUpload({
    bucketName: "invoices",
    path: `${firmId}/${uploadFolderId}`,
    allowedMimeTypes: ["image/*", "application/pdf"],
    maxFiles: 10,
    maxFileSize: 50 * 1024 * 1024,
    getStorageKey: (file) => {
      const ext = file.name.split(".").pop();
      return `${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
    },
  });

  const handleUploadComplete = useCallback(async () => {
    if (isProcessingUpload) return;
    setIsProcessingUpload(true);
    const formData = uploadForm.getValues();
    const documentMeta = getDocumentTypeMeta(formData.document_type);

    try {
      const promises = uploadProps.uploadedFiles.map(async (uploadedFile) => {
        if (documentMeta.type === "allowance") {
          await createAllowance({
            firm_id: firmId,
            client_id: clientId,
            storage_path: uploadedFile.path,
            filename: uploadedFile.name,
            in_or_out: documentMeta.inOrOut,
            tax_filing_period_id: periodId,
          });
          return;
        }

        await createInvoice({
          firm_id: firmId,
          client_id: clientId,
          storage_path: uploadedFile.path,
          filename: uploadedFile.name,
          in_or_out: documentMeta.inOrOut,
          year_month: formData.period.toString(),
          tax_filing_period_id: periodId,
        });
      });

      await Promise.all(promises);
      toast.success("單據上傳成功");
      onOpenChange(false);

      // Reset
      uploadForm.reset({
        document_type: "invoice-in",
        period: period,
      });
      uploadProps.setFiles([]);
      uploadProps.setUploadedFiles([]);
      setUploadFolderId(crypto.randomUUID());

      if (documentMeta.type === "allowance") {
        onAllowanceSuccess();
      } else {
        onSuccess();
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("上傳失敗");
    } finally {
      setIsProcessingUpload(false);
    }
  }, [
    clientId,
    firmId,
    isProcessingUpload,
    uploadForm,
    uploadProps,
    periodId,
    onSuccess,
    onAllowanceSuccess,
    onOpenChange,
    period,
  ]);

  useEffect(() => {
    if (uploadProps.isSuccess && !isProcessingUpload) {
      handleUploadComplete();
    }
  }, [uploadProps.isSuccess, isProcessingUpload, handleUploadComplete]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>上傳單據 - {clientName}</DialogTitle>
        </DialogHeader>
        <Form {...uploadForm}>
          <form className="space-y-4 py-4">
            <FormField
              control={uploadForm.control}
              name="period"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>所屬期別</FormLabel>
                  <FormControl>
                    <PeriodSelector
                      value={field.value}
                      onChange={field.onChange}
                      disabled={true}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={uploadForm.control}
              name="document_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>文件類型</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {documentTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <Label>檔案</Label>
              <Dropzone {...uploadProps}>
                <DropzoneEmptyState />
                <DropzoneContent />
              </Dropzone>
            </div>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
