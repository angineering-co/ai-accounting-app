"use client";

import { use, useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { RocPeriod } from "@/lib/domain/roc-period";
import {
  clientSchema,
  invoiceSchema,
  allowanceSchema,
} from "@/lib/domain/models";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { MobileUploadActions } from "@/components/mobile-upload-actions";
import { UploadQueueList } from "@/components/upload-queue-list";
import { usePreAiUploadQueue } from "@/hooks/use-pre-ai-upload-queue";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/dropzone";

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

type DeleteTarget = {
  id: string;
  name: string;
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
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLocked ? (
            <p className="text-sm text-muted-foreground">
              此期別已鎖定，無法上傳新檔案。
            </p>
          ) : (
            <div className="space-y-2">
              <Label>檔案上傳（僅支援 PDF / 圖片）</Label>
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
  const [invoiceToDelete, setInvoiceToDelete] = useState<DeleteTarget | null>(
    null,
  );
  const [allowanceToDelete, setAllowanceToDelete] =
    useState<DeleteTarget | null>(null);

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
  } = useSWR(
    period ? ["portal-period-invoices", period.id] : null,
    async () => {
      if (!period) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("tax_filing_period_id", period.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return invoiceSchema.array().parse(data || []);
    },
  );

  const {
    data: allowances = [],
    isLoading: isAllowancesLoading,
    mutate: mutateAllowances,
  } = useSWR(
    period ? ["portal-period-allowances", period.id] : null,
    async () => {
      if (!period) return [];
      const { data, error } = await supabase
        .from("allowances")
        .select("*")
        .eq("tax_filing_period_id", period.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return allowanceSchema.array().parse(data || []);
    },
  );

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

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-4">
          <TabsTrigger value="overview">總覽</TabsTrigger>
          <TabsTrigger value="input">進項</TabsTrigger>
          <TabsTrigger value="output">銷項</TabsTrigger>
          <TabsTrigger value="ranges">字軌</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>本期上傳摘要</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <p>進項發票：{inInvoices.length} 張</p>
              <p>銷項發票：{outInvoices.length} 張</p>
              <p>進項折讓：{inAllowances.length} 張</p>
              <p>銷項折讓：{outAllowances.length} 張</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>操作指引</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. 在「進項」與「銷項」分頁上傳本期文件並確認資料。</p>
              <p>2. 若有購買紙本發票，請至「字軌」分頁輸入起訖號。</p>
              {isLocked ? (
                <p className="font-medium text-foreground">
                  此期別已鎖定，目前僅可檢視既有資料。
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="input" className="mt-6 space-y-6">
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
          <div className="hidden md:block">
            <InvoiceTable
              invoices={inInvoices}
              isLoading={isInvoicesLoading}
              showClientColumn={false}
              onDelete={
                isLocked
                  ? undefined
                  : (invoice) =>
                      setInvoiceToDelete({
                        id: invoice.id,
                        name: invoice.filename,
                      })
              }
            />
          </div>

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
          <div className="hidden md:block">
            <AllowanceTable
              allowances={inAllowances}
              isLoading={isAllowancesLoading}
              onDelete={
                isLocked
                  ? undefined
                  : (allowance) =>
                      setAllowanceToDelete({
                        id: allowance.id,
                        name:
                          allowance.allowance_serial_code ||
                          allowance.filename ||
                          "-",
                      })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="output" className="mt-6 space-y-6">
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
          <div className="hidden md:block">
            <InvoiceTable
              invoices={outInvoices}
              isLoading={isInvoicesLoading}
              showClientColumn={false}
              onDelete={
                isLocked
                  ? undefined
                  : (invoice) =>
                      setInvoiceToDelete({
                        id: invoice.id,
                        name: invoice.filename,
                      })
              }
            />
          </div>

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
          <div className="hidden md:block">
            <AllowanceTable
              allowances={outAllowances}
              isLoading={isAllowancesLoading}
              onDelete={
                isLocked
                  ? undefined
                  : (allowance) =>
                      setAllowanceToDelete({
                        id: allowance.id,
                        name:
                          allowance.allowance_serial_code ||
                          allowance.filename ||
                          "-",
                      })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="ranges" className="mt-6">
          <RangeManagement
            clientId={clientId}
            period={rocPeriod}
            isLocked={isLocked}
          />
        </TabsContent>
      </Tabs>

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
