"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  BellRing,
  CheckCircle2,
  Download,
  FileText,
  Hash,
  LayoutGrid,
  Loader2,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { cn, formatDateTimeZhTW } from "@/lib/utils";
import { RocPeriod } from "@/lib/domain/roc-period";
import { clientSchema } from "@/lib/domain/models";
import {
  getFilingAttachmentSignedUrl,
  getTaxPeriodByYYYMM,
  markClientReady,
} from "@/lib/services/tax-period";
import { usePaginatedPeriodInvoices } from "@/hooks/use-paginated-period-invoices";
import { usePaginatedPeriodAllowances } from "@/hooks/use-paginated-period-allowances";
import {
  DocumentUploadSection,
  type DocumentUploadSectionHandle,
} from "@/components/document-upload-section";
import { InvoiceDeleteDialog } from "@/components/invoice/invoice-delete-dialog";
import { AllowanceDeleteDialog } from "@/components/allowance-delete-dialog";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { PortalUploadFab } from "@/components/portal-upload-fab";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodStatusBadge } from "@/components/period-status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const InvoiceTable = dynamic(
  () =>
    import("@/components/invoice-table").then((m) => ({
      default: m.InvoiceTable,
    })),
  {
    loading: () => <Skeleton className="h-64 w-full" />,
    ssr: false,
  },
);

const AllowanceTable = dynamic(
  () =>
    import("@/components/allowance-table").then((m) => ({
      default: m.AllowanceTable,
    })),
  {
    loading: () => <Skeleton className="h-64 w-full" />,
    ssr: false,
  },
);

const RangeManagement = dynamic(
  () =>
    import("@/components/range-management").then((m) => ({
      default: m.RangeManagement,
    })),
  {
    loading: () => <Skeleton className="h-64 w-full" />,
  },
);

const PAGE_SIZE = 50;

type DeleteTarget = {
  id: string;
  name: string;
};

type PreviewTarget = {
  filename?: string | null;
  storagePath?: string | null;
  bucketName: "documents" | "electronic-invoices";
  previewUrl?: string;
};

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
  const [activeTab, setActiveTab] = useState("overview");
  const [isMarkingReady, setIsMarkingReady] = useState(false);
  const [inInvoicePage, setInInvoicePage] = useState(0);
  const [outInvoicePage, setOutInvoicePage] = useState(0);
  const [inAllowancePage, setInAllowancePage] = useState(0);
  const [outAllowancePage, setOutAllowancePage] = useState(0);
  const inInvoiceRef = useRef<DocumentUploadSectionHandle>(null);
  const outInvoiceRef = useRef<DocumentUploadSectionHandle>(null);
  const inAllowanceRef = useRef<DocumentUploadSectionHandle>(null);
  const outAllowanceRef = useRef<DocumentUploadSectionHandle>(null);

  const handleReview = useCallback(
    (
      item: {
        filename?: string | null;
        storage_path?: string | null;
        extracted_data?: { source?: string | null } | null;
      },
      options?: { previewUrl?: string },
    ) => {
      setPreviewTarget({
        filename: item.filename,
        storagePath: item.storage_path,
        bucketName:
          item.extracted_data?.source === "import-excel"
            ? "electronic-invoices"
            : "documents",
        previewUrl: options?.previewUrl,
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
    invoices: inInvoices,
    totalCount: inInvoiceTotalCount,
    isLoading: isInInvoicesLoading,
    mutate: mutateInInvoices,
  } = usePaginatedPeriodInvoices({
    periodId: period?.id ?? null,
    inOrOut: "in",
    page: inInvoicePage,
    pageSize: PAGE_SIZE,
  });

  const {
    invoices: outInvoices,
    totalCount: outInvoiceTotalCount,
    isLoading: isOutInvoicesLoading,
    mutate: mutateOutInvoices,
  } = usePaginatedPeriodInvoices({
    periodId: period?.id ?? null,
    inOrOut: "out",
    page: outInvoicePage,
    pageSize: PAGE_SIZE,
  });

  const {
    allowances: inAllowances,
    totalCount: inAllowanceTotalCount,
    isLoading: isInAllowancesLoading,
    mutate: mutateInAllowances,
  } = usePaginatedPeriodAllowances({
    periodId: period?.id ?? null,
    clientId,
    inOrOut: "in",
    page: inAllowancePage,
    pageSize: PAGE_SIZE,
  });

  const {
    allowances: outAllowances,
    totalCount: outAllowanceTotalCount,
    isLoading: isOutAllowancesLoading,
    mutate: mutateOutAllowances,
  } = usePaginatedPeriodAllowances({
    periodId: period?.id ?? null,
    clientId,
    inOrOut: "out",
    page: outAllowancePage,
    pageSize: PAGE_SIZE,
  });

  // Reset page to 0 when current page is beyond available data (e.g. after deletion)
  useEffect(() => {
    if (inInvoicePage > 0 && inInvoicePage * PAGE_SIZE >= inInvoiceTotalCount) setInInvoicePage(0);
    if (outInvoicePage > 0 && outInvoicePage * PAGE_SIZE >= outInvoiceTotalCount) setOutInvoicePage(0);
    if (inAllowancePage > 0 && inAllowancePage * PAGE_SIZE >= inAllowanceTotalCount) setInAllowancePage(0);
    if (outAllowancePage > 0 && outAllowancePage * PAGE_SIZE >= outAllowanceTotalCount) setOutAllowancePage(0);
  }, [inInvoiceTotalCount, outInvoiceTotalCount, inAllowanceTotalCount, outAllowanceTotalCount, inInvoicePage, outInvoicePage, inAllowancePage, outAllowancePage]);

  const handleFabFilesSelected = useCallback(
    (files: File[], inOrOut: "in" | "out", type: "invoice" | "allowance") => {
      setActiveTab(inOrOut === "in" ? "input" : "output");
      const refs: Record<
        string,
        React.RefObject<DocumentUploadSectionHandle | null>
      > = {
        "in-invoice": inInvoiceRef,
        "out-invoice": outInvoiceRef,
        "in-allowance": inAllowanceRef,
        "out-allowance": outAllowanceRef,
      };
      refs[`${inOrOut}-${type}`]?.current?.addFiles(files);
    },
    [],
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
  const isFiled = period.status === "filed";

  const isPeriodOver = Date.now() >= rocPeriod.nextPeriod().startDate.getTime();
  const readyAtLabel = period.client_ready_at
    ? formatDateTimeZhTW(period.client_ready_at)
    : null;

  const handleMarkReady = async () => {
    setIsMarkingReady(true);
    try {
      await markClientReady(period.id);
      await mutatePeriod();
      toast.success("已通知事務所開始審核");
    } catch (err) {
      toast.error(
        `通知失敗: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsMarkingReady(false);
    }
  };

  const handleDownloadFilingAttachment = async (filename: string) => {
    try {
      const url = await getFilingAttachmentSignedUrl(period.id, filename);
      if (!url) {
        toast.error("無法取得下載連結");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(
        `下載失敗: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const filedDateLabel = isFiled && period.filing.filed_at
    ? new Date(period.filing.filed_at).toLocaleDateString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "";

  const overviewItems = [
    {
      label: "進項發票",
      value: inInvoiceTotalCount,
      icon: FileText,
    },
    {
      label: "銷項發票",
      value: outInvoiceTotalCount,
      icon: Receipt,
    },
    {
      label: "進項折讓",
      value: inAllowanceTotalCount,
      icon: FileText,
    },
    {
      label: "銷項折讓",
      value: outAllowanceTotalCount,
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
              <PeriodStatusBadge
                period={period}
                className="w-fit shrink-0"
                showIcon={isFiled}
              />
            </h1>
            <p className="mt-2 text-base text-slate-600">
              {client.name}（統編: {client.tax_id}）
            </p>
          </div>
        </div>
      </section>

      {!isLocked && (
        <Card
          className={cn(
            "border-slate-200/80 bg-white shadow-sm shadow-slate-200/60",
            readyAtLabel && "border-amber-200/80 bg-amber-50/40",
          )}
        >
          <CardHeader className="border-b border-slate-100/80">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              {readyAtLabel ? (
                <>
                  <BellRing className="h-5 w-5 text-amber-600" />
                  已通知事務所
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  完成上傳？
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {readyAtLabel ? (
              <p className="text-base text-slate-700">
                已於 {readyAtLabel} 通知事務所，事務所將開始審核。
                如果還有遺漏的發票或折讓單，仍可繼續上傳。
              </p>
            ) : (
              <>
                <p className="text-base text-slate-700">
                  整理完所有發票與折讓單後，點下方按鈕通知事務所開始審核。
                  如果之後還有發票，仍可繼續上傳，事務所會看到。
                </p>
                <div className="flex flex-col items-start gap-2">
                  <Button
                    onClick={handleMarkReady}
                    disabled={!isPeriodOver || isMarkingReady}
                    className="rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    {isMarkingReady ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        通知中...
                      </>
                    ) : (
                      <>
                        <BellRing className="h-4 w-4" />
                        通知事務所開始審核
                      </>
                    )}
                  </Button>
                  {!isPeriodOver && (
                    <p className="text-sm text-slate-500">
                      本期需於 {rocPeriod.formatEndDate()} 後才能通知事務所。
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {isFiled && (
        <Card className="border-indigo-200/70 bg-white shadow-sm shadow-slate-200/60">
          <CardHeader className="border-b border-indigo-100/80">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <CheckCircle2 className="h-5 w-5 text-indigo-600" />
              申報資訊
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <p className="text-base text-slate-700">
              本期已於 {filedDateLabel} 完成申報。
            </p>
            {period.filing.attachments.length === 0 ? (
              <p className="text-sm text-slate-500">尚未提供任何申報附件。</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {period.filing.attachments.map((a) => (
                  <li
                    key={a.filename}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <p className="truncate text-base text-slate-900">
                        {a.filename}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadFilingAttachment(a.filename)}
                    >
                      <Download className="mr-1 h-4 w-4" /> 下載
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-4 gap-2 rounded-2xl bg-transparent p-0">
          <TabsTrigger
            value="overview"
            className="flex h-auto items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-base font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-700 hover:shadow-md data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-emerald-200/80"
          >
            <LayoutGrid className="h-4 w-4" />
            總覽
          </TabsTrigger>
          <TabsTrigger
            value="input"
            className="flex h-auto items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-base font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-700 hover:shadow-md data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-emerald-200/80"
          >
            <ArrowDownToLine className="h-4 w-4" />
            進項
          </TabsTrigger>
          <TabsTrigger
            value="output"
            className="flex h-auto items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-base font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-700 hover:shadow-md data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-emerald-200/80"
          >
            <ArrowUpFromLine className="h-4 w-4" />
            銷項
          </TabsTrigger>
          <TabsTrigger
            value="ranges"
            className="flex h-auto items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-base font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-700 hover:shadow-md data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-emerald-200/80"
          >
            <Hash className="h-4 w-4" />
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
                        <p className="text-base text-slate-500">{item.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {item.value}
                          <span className="ml-1 text-base font-medium text-slate-500">
                            張
                          </span>
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
            <p className="px-6 pb-6 text-sm text-slate-500 md:hidden">
              總覽顯示本期所有資料數量，手機版僅顯示待辨識檔案。如需查看完整資料，請使用電腦版。
            </p>
          </Card>

          <Card className="border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
            <CardHeader className="border-b border-slate-100/80">
              <CardTitle className="text-slate-900">操作指引</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6 text-base text-slate-600">
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

        {/* Keep heavy panels mounted to preserve preview cache/state, while hiding inactive content to avoid stacked panels. */}
        <TabsContent
          value="input"
          className="mt-6 space-y-6 data-[state=inactive]:hidden"
          forceMount
        >
          <DocumentUploadSection
            ref={inInvoiceRef}
            title="進項發票"
            firmId={firmId}
            clientId={clientId}
            periodId={period.id}
            periodYYYMM={periodYYYMM}
            type="invoice"
            inOrOut="in"
            isLocked={isLocked}
            onUploaded={mutateInInvoices}
          />
          <div className="hidden md:block">
            <InvoiceTable
              invoices={inInvoices}
              isLoading={isInInvoicesLoading}
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
            <TablePagination
              page={inInvoicePage}
              totalPages={Math.max(1, Math.ceil(inInvoiceTotalCount / PAGE_SIZE))}
              totalItems={inInvoiceTotalCount}
              pageSize={PAGE_SIZE}
              onPageChange={setInInvoicePage}
            />
          </div>

          <DocumentUploadSection
            ref={inAllowanceRef}
            title="進項折讓"
            firmId={firmId}
            clientId={clientId}
            periodId={period.id}
            periodYYYMM={periodYYYMM}
            type="allowance"
            inOrOut="in"
            isLocked={isLocked}
            onUploaded={mutateInAllowances}
          />
          <div className="hidden md:block">
            <AllowanceTable
              allowances={inAllowances}
              isLoading={isInAllowancesLoading}
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
            <TablePagination
              page={inAllowancePage}
              totalPages={Math.max(1, Math.ceil(inAllowanceTotalCount / PAGE_SIZE))}
              totalItems={inAllowanceTotalCount}
              pageSize={PAGE_SIZE}
              onPageChange={setInAllowancePage}
            />
          </div>

          <p className="text-sm text-slate-500 md:hidden">
            手機版僅顯示待辨識檔案，如需查看所有已處理資料請使用電腦版。
          </p>
        </TabsContent>

        {/* Same pattern as input tab: mounted for performance, hidden when inactive for correct tab UX. */}
        <TabsContent
          value="output"
          className="mt-6 space-y-6 data-[state=inactive]:hidden"
          forceMount
        >
          <DocumentUploadSection
            ref={outInvoiceRef}
            title="銷項發票"
            firmId={firmId}
            clientId={clientId}
            periodId={period.id}
            periodYYYMM={periodYYYMM}
            type="invoice"
            inOrOut="out"
            isLocked={isLocked}
            onUploaded={mutateOutInvoices}
          />
          <div className="hidden md:block">
            <InvoiceTable
              invoices={outInvoices}
              isLoading={isOutInvoicesLoading}
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
            <TablePagination
              page={outInvoicePage}
              totalPages={Math.max(1, Math.ceil(outInvoiceTotalCount / PAGE_SIZE))}
              totalItems={outInvoiceTotalCount}
              pageSize={PAGE_SIZE}
              onPageChange={setOutInvoicePage}
            />
          </div>

          <DocumentUploadSection
            ref={outAllowanceRef}
            title="銷項折讓"
            firmId={firmId}
            clientId={clientId}
            periodId={period.id}
            periodYYYMM={periodYYYMM}
            type="allowance"
            inOrOut="out"
            isLocked={isLocked}
            onUploaded={mutateOutAllowances}
          />
          <div className="hidden md:block">
            <AllowanceTable
              allowances={outAllowances}
              isLoading={isOutAllowancesLoading}
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
            <TablePagination
              page={outAllowancePage}
              totalPages={Math.max(1, Math.ceil(outAllowanceTotalCount / PAGE_SIZE))}
              totalItems={outAllowanceTotalCount}
              pageSize={PAGE_SIZE}
              onPageChange={setOutAllowancePage}
            />
          </div>

          <p className="text-sm text-slate-500 md:hidden">
            手機版僅顯示待辨識檔案，如需查看所有已處理資料請使用電腦版。
          </p>
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
          await Promise.all([mutateInInvoices(), mutateOutInvoices()]);
        }}
      />

      <FilePreviewDialog
        filename={previewTarget?.filename}
        storagePath={previewTarget?.storagePath}
        bucketName={previewTarget?.bucketName}
        initialPreviewUrl={previewTarget?.previewUrl}
        isOpen={!!previewTarget}
        onOpenChange={(open) => !open && setPreviewTarget(null)}
      />

      <AllowanceDeleteDialog
        allowance={allowanceToDelete}
        open={!!allowanceToDelete}
        onOpenChange={(open) => !open && setAllowanceToDelete(null)}
        onSuccess={async () => {
          await Promise.all([mutateInAllowances(), mutateOutAllowances()]);
        }}
      />

      <PortalUploadFab
        onFilesSelected={handleFabFilesSelected}
        isLocked={isLocked}
      />
    </div>
  );
}
