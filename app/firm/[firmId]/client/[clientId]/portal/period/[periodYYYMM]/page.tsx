"use client";

import { use, useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, FileText, Loader2, Receipt } from "lucide-react";
import Link from "next/link";
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
import { FilePreviewDialog } from "@/components/file-preview-dialog";
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

type PreviewTarget = {
  filename?: string | null;
  storagePath?: string | null;
  bucketName: "invoices" | "electronic-invoices";
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
}

export default function PortalPeriodDetailPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string; periodYYYMM: string }>;
}) {
  const { firmId, clientId, periodYYYMM } = use(params);
  const supabase = createSupabaseClient();
  const rocPeriod = RocPeriod.fromYYYMM(periodYYYMM);
  const [invoiceToDelete, setInvoiceToDelete] = useState<DeleteTarget | null>(
    null,
  );
  const [allowanceToDelete, setAllowanceToDelete] =
    useState<DeleteTarget | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(
    null,
  );

  const handleReview = useCallback(
    (item: {
      filename?: string | null;
      storage_path?: string | null;
      extracted_data?: { source?: string | null } | null;
    }) => {
      setPreviewTarget({
        filename: item.filename,
        storagePath: item.storage_path,
        bucketName:
          item.extracted_data?.source === "import-excel"
            ? "electronic-invoices"
            : "invoices",
      });
    },
    [],
  );

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
  const overviewItems = [
    {
      label: "進項發票",
      value: inInvoices.length,
      icon: FileText,
    },
    {
      label: "銷項發票",
      value: outInvoices.length,
      icon: Receipt,
    },
    {
      label: "進項折讓",
      value: inAllowances.length,
      icon: FileText,
    },
    {
      label: "銷項折讓",
      value: outAllowances.length,
      icon: Receipt,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <Button
        asChild
        variant="ghost"
        className="w-fit rounded-full px-3 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <Link href={`/firm/${firmId}/client/${clientId}/portal`}>
          <ArrowLeft className="h-4 w-4" />
          返回申報期列表
        </Link>
      </Button>

      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-emerald-50/70 p-6 shadow-sm shadow-slate-200/70 md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_36%)]" />
        <div className="relative">
          <div>
            <h1 className="flex flex-col items-start gap-3 text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:flex-row sm:flex-wrap sm:items-center sm:text-3xl">
              <span className="whitespace-nowrap">{rocPeriod.format()}</span>
              <Badge
                variant="outline"
                className={
                  isLocked
                    ? "w-fit shrink-0 rounded-full border-slate-200 bg-slate-100 px-3 py-1 text-slate-700"
                    : "w-fit shrink-0 rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700"
                }
              >
                {isLocked ? "已鎖定" : "進行中"}
              </Badge>
            </h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              {client.name}（統編: {client.tax_id}）
            </p>
          </div>
        </div>
      </section>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-4 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1.5">
          <TabsTrigger
            value="overview"
            className="rounded-xl text-slate-600 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-100/80"
          >
            總覽
          </TabsTrigger>
          <TabsTrigger
            value="input"
            className="rounded-xl text-slate-600 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-100/80"
          >
            進項
          </TabsTrigger>
          <TabsTrigger
            value="output"
            className="rounded-xl text-slate-600 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-100/80"
          >
            銷項
          </TabsTrigger>
          <TabsTrigger
            value="ranges"
            className="rounded-xl text-slate-600 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-100/80"
          >
            字軌
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-4">
          <Card className="border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
            <CardHeader className="border-b border-slate-100/80">
              <CardTitle className="text-slate-900">本期上傳摘要</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 xl:grid-cols-4">
              {overviewItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-emerald-100/80 bg-gradient-to-br from-white to-emerald-50/70 p-4 shadow-sm shadow-emerald-100/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-500">{item.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {item.value}
                          <span className="ml-1 text-sm font-medium text-slate-500">
                            張
                          </span>
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
            <CardHeader className="border-b border-slate-100/80">
              <CardTitle className="text-slate-900">操作指引</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6 text-sm text-slate-600">
              <p>1. 在「進項」與「銷項」分頁上傳本期文件並確認資料。</p>
              <p>2. 若有購買紙本發票，請至「字軌」分頁輸入起訖號。</p>
              {isLocked ? (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-800">
                  此期別已鎖定，目前僅可檢視既有資料。
                </p>
              ) : (
                <p className="rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 font-medium text-emerald-800">
                  建議當期10號以前完成上傳！
                </p>
              )}
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
              onReview={handleReview}
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
              onReview={handleReview}
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
              onReview={handleReview}
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
              onReview={handleReview}
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

      <FilePreviewDialog
        filename={previewTarget?.filename}
        storagePath={previewTarget?.storagePath}
        bucketName={previewTarget?.bucketName}
        isOpen={!!previewTarget}
        onOpenChange={(open) => !open && setPreviewTarget(null)}
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
