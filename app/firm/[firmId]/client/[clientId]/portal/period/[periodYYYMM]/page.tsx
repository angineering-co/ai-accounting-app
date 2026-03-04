"use client";

import { use, useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { RocPeriod } from "@/lib/domain/roc-period";
import { clientSchema, invoiceSchema, allowanceSchema, type Invoice, type Allowance } from "@/lib/domain/models";
import { getTaxPeriodByYYYMM } from "@/lib/services/tax-period";
import { createInvoice } from "@/lib/services/invoice";
import { createAllowance } from "@/lib/services/allowance";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import { InvoiceTable } from "@/components/invoice-table";
import { AllowanceTable } from "@/components/allowance-table";
import { RangeManagement } from "@/components/range-management";
import { InvoiceDeleteDialog } from "@/components/invoice/invoice-delete-dialog";
import { AllowanceDeleteDialog } from "@/components/allowance-delete-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/dropzone";

type DocumentSectionProps = {
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

function DocumentUploadSection({
  title,
  firmId,
  clientId,
  periodId,
  periodYYYMM,
  type,
  inOrOut,
  isLocked,
  onUploaded,
}: DocumentSectionProps) {
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

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
  ]);

  useEffect(() => {
    if (uploadProps.isSuccess && !isProcessingUpload) {
      handleUploadComplete();
    }
  }, [uploadProps.isSuccess, isProcessingUpload, handleUploadComplete]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLocked ? (
          <p className="text-sm text-muted-foreground">此期別已鎖定，無法上傳新檔案。</p>
        ) : (
          <div className="space-y-2">
            <Label>檔案上傳（僅支援 PDF / 圖片）</Label>
            <Dropzone {...uploadProps}>
              <DropzoneEmptyState />
              <DropzoneContent />
            </Dropzone>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortalPeriodDetailPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string; periodYYYMM: string }>;
}) {
  const { firmId, clientId, periodYYYMM } = use(params);
  const supabase = createSupabaseClient();
  const router = useRouter();
  const rocPeriod = RocPeriod.fromYYYMM(periodYYYMM);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [allowanceToDelete, setAllowanceToDelete] = useState<Allowance | null>(null);

  const {
    data: period,
    mutate: mutatePeriod,
    isLoading: isPeriodLoading,
  } = useSWR(["portal-tax-period", clientId, periodYYYMM], () =>
    getTaxPeriodByYYYMM(clientId, periodYYYMM),
  );

  const { data: client, isLoading: isClientLoading } = useSWR(
    ["portal-client-detail", clientId],
    async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return clientSchema.parse(data);
    },
  );

  const {
    data: invoices = [],
    isLoading: isInvoicesLoading,
    mutate: mutateInvoices,
  } = useSWR(period ? ["portal-period-invoices", period.id] : null, async () => {
    if (!period) return [];
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("tax_filing_period_id", period.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return invoiceSchema.array().parse(data || []);
  });

  const {
    data: allowances = [],
    isLoading: isAllowancesLoading,
    mutate: mutateAllowances,
  } = useSWR(period ? ["portal-period-allowances", period.id] : null, async () => {
    if (!period) return [];
    const { data, error } = await supabase
      .from("allowances")
      .select("*")
      .eq("tax_filing_period_id", period.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return allowanceSchema.array().parse(data || []);
  });

  if (isPeriodLoading || isClientLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!period || !client) {
    return <div className="p-6 text-center">找不到此期別</div>;
  }

  const isLocked = period.status === "locked" || period.status === "filed";

  const inInvoices = invoices.filter((item) => item.in_or_out === "in");
  const outInvoices = invoices.filter((item) => item.in_or_out === "out");
  const inAllowances = allowances.filter((item) => item.in_or_out === "in");
  const outAllowances = allowances.filter((item) => item.in_or_out === "out");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              {rocPeriod.format()}
              <Badge variant={isLocked ? "secondary" : "default"}>
                {isLocked ? "已鎖定" : "進行中"}
              </Badge>
            </h1>
            <p className="text-muted-foreground mt-1">
              {client.name}（統編: {client.tax_id}）
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>本期上傳摘要</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          進項發票: {inInvoices.length} 張 | 銷項發票: {outInvoices.length} 張 | 進項折讓: {inAllowances.length} 張 |
          銷項折讓: {outAllowances.length} 張
        </CardContent>
      </Card>

      <DocumentUploadSection
        title="進項發票"
        firmId={firmId}
        clientId={clientId}
        periodId={period.id}
        periodYYYMM={periodYYYMM}
        type="invoice"
        inOrOut="in"
        isLocked={isLocked}
        onUploaded={mutateInvoices}
      />
      <InvoiceTable
        invoices={inInvoices}
        isLoading={isInvoicesLoading}
        showClientColumn={false}
        onDelete={isLocked ? undefined : setInvoiceToDelete}
      />

      <DocumentUploadSection
        title="銷項發票"
        firmId={firmId}
        clientId={clientId}
        periodId={period.id}
        periodYYYMM={periodYYYMM}
        type="invoice"
        inOrOut="out"
        isLocked={isLocked}
        onUploaded={mutateInvoices}
      />
      <InvoiceTable
        invoices={outInvoices}
        isLoading={isInvoicesLoading}
        showClientColumn={false}
        onDelete={isLocked ? undefined : setInvoiceToDelete}
      />

      <DocumentUploadSection
        title="進項折讓"
        firmId={firmId}
        clientId={clientId}
        periodId={period.id}
        periodYYYMM={periodYYYMM}
        type="allowance"
        inOrOut="in"
        isLocked={isLocked}
        onUploaded={mutateAllowances}
      />
      <AllowanceTable
        allowances={inAllowances}
        isLoading={isAllowancesLoading}
        onDelete={isLocked ? undefined : setAllowanceToDelete}
      />

      <DocumentUploadSection
        title="銷項折讓"
        firmId={firmId}
        clientId={clientId}
        periodId={period.id}
        periodYYYMM={periodYYYMM}
        type="allowance"
        inOrOut="out"
        isLocked={isLocked}
        onUploaded={mutateAllowances}
      />
      <AllowanceTable
        allowances={outAllowances}
        isLoading={isAllowancesLoading}
        onDelete={isLocked ? undefined : setAllowanceToDelete}
      />

      <RangeManagement
        clientId={clientId}
        period={rocPeriod}
        isLocked={isLocked}
      />

      <InvoiceDeleteDialog
        invoice={invoiceToDelete}
        open={!!invoiceToDelete}
        onOpenChange={(open) => !open && setInvoiceToDelete(null)}
        onSuccess={async () => {
          await mutatePeriod();
          await mutateInvoices();
        }}
      />

      <AllowanceDeleteDialog
        allowance={allowanceToDelete}
        open={!!allowanceToDelete}
        onOpenChange={(open) => !open && setAllowanceToDelete(null)}
        onSuccess={mutateAllowances}
      />
    </div>
  );
}
