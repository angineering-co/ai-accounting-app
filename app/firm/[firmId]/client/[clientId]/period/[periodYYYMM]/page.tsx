"use client";

import { use, useState, useCallback, useRef, useEffect } from "react";
import useSWR from "swr";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Lock, Unlock, Plus, FileText, BookOpen } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { InvoiceTable } from "@/components/invoice-table";
import { AllowanceTable } from "@/components/allowance-table";
import { RangeManagement } from "@/components/range-management";
import { ReportGeneration } from "@/components/report-generation";
import { StatusFilterBar } from "@/components/status-filter-bar";
import { TablePagination } from "@/components/table-pagination";
import { toast } from "sonner";
import {
  type Invoice,
  type Allowance,
  clientSchema,
  invoiceSchema,
} from "@/lib/domain/models";
import { RocPeriod } from "@/lib/domain/roc-period";
import {
  getTaxPeriodByYYYMM,
  updateTaxPeriodStatus,
} from "@/lib/services/tax-period";
import { Badge } from "@/components/ui/badge";
import { InvoiceReviewDialog } from "@/components/invoice-review-dialog";
import { extractInvoiceDataAction } from "@/lib/services/invoice";
import { InvoiceUploadDialog } from "@/components/invoice/invoice-upload-dialog";
import { InvoiceImportDialog } from "@/components/invoice/invoice-import-dialog";

import { InvoiceDeleteDialog } from "@/components/invoice/invoice-delete-dialog";
import { AllowanceReviewDialog } from "@/components/allowance-review-dialog";
import { AllowanceDeleteDialog } from "@/components/allowance-delete-dialog";
import { extractAllowanceDataAction } from "@/lib/services/allowance";
import { BulkExtractionProgress } from "@/components/bulk-extraction-progress";
import { usePaginatedPeriodInvoices } from "@/hooks/use-paginated-period-invoices";
import { usePaginatedPeriodAllowances } from "@/hooks/use-paginated-period-allowances";
import { useStatusCounts } from "@/hooks/use-status-counts";

const PAGE_SIZE = 50;

type DeleteTarget = {
  id: string;
  name: string;
};

export default function PeriodDetailPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string; periodYYYMM: string }>;
}) {
  const { firmId, clientId, periodYYYMM } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseClient();
  const rocPeriod = RocPeriod.fromYYYMM(periodYYYMM);

  // State
  const [reviewingInvoice, setReviewingInvoice] = useState<Invoice | null>(
    null,
  );
  const [reviewingAllowance, setReviewingAllowance] =
    useState<Allowance | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<DeleteTarget | null>(
    null,
  );
  const [allowanceToDelete, setAllowanceToDelete] =
    useState<DeleteTarget | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Pagination & filter state
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("uploaded");
  const [invoicePage, setInvoicePage] = useState(0);
  const [allowanceStatusFilter, setAllowanceStatusFilter] =
    useState("uploaded");
  const [allowancePage, setAllowancePage] = useState(0);

  // Auto-advance refs
  const invoicePendingAdvanceRef = useRef(false);
  const allowancePendingAdvanceRef = useRef(false);

  // Fetch Period Entity
  const {
    data: period,
    mutate: mutatePeriod,
    isLoading: isPeriodLoading,
  } = useSWR(["tax-period", clientId, periodYYYMM], () =>
    getTaxPeriodByYYYMM(clientId, periodYYYMM),
  );

  // Fetch Client
  const { data: client, isLoading: isClientLoading } = useSWR(
    ["client", clientId],
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

  // Paginated invoice fetching
  const {
    invoices,
    totalCount: invoiceTotalCount,
    isLoading: isInvoicesLoading,
    mutate: mutateInvoices,
  } = usePaginatedPeriodInvoices({
    periodId: period?.id ?? null,
    statusFilter: invoiceStatusFilter,
    page: invoicePage,
    pageSize: PAGE_SIZE,
  });

  // Paginated allowance fetching
  const {
    allowances,
    totalCount: allowanceTotalCount,
    isLoading: isAllowancesLoading,
    mutate: mutateAllowances,
  } = usePaginatedPeriodAllowances({
    periodId: period?.id ?? null,
    clientId,
    statusFilter: allowanceStatusFilter,
    page: allowancePage,
    pageSize: PAGE_SIZE,
  });

  // Status counts for filter bar badges
  const { counts: invoiceStatusCounts, mutate: mutateInvoiceStatusCounts } =
    useStatusCounts({ table: "invoices", periodId: period?.id ?? null });
  const { counts: allowanceStatusCounts, mutate: mutateAllowanceStatusCounts } =
    useStatusCounts({ table: "allowances", periodId: period?.id ?? null, clientId });

  // Check if there are unconfirmed documents (for report generation)
  const { data: hasUnconfirmedDocuments = true } = useSWR(
    period ? ["unconfirmed-check", period.id, clientId] : null,
    async () => {
      if (!period) return true;

      const [invoiceResult, allowanceResult] = await Promise.all([
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("tax_filing_period_id", period.id)
          .neq("status", "confirmed"),
        supabase
          .from("allowances")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("tax_filing_period_id", period.id)
          .neq("status", "confirmed"),
      ]);

      return (
        (invoiceResult.count ?? 0) > 0 || (allowanceResult.count ?? 0) > 0
      );
    },
  );

  // Total entity count for bulk extraction (across all statuses)
  const { data: totalEntityCount = 0 } = useSWR(
    period ? ["total-entity-count", period.id, clientId] : null,
    async () => {
      if (!period) return 0;

      const [invoiceResult, allowanceResult] = await Promise.all([
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("tax_filing_period_id", period.id),
        supabase
          .from("allowances")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("tax_filing_period_id", period.id),
      ]);

      return (invoiceResult.count ?? 0) + (allowanceResult.count ?? 0);
    },
  );

  const handleInvoiceStatusFilterChange = (status: string) => {
    setInvoiceStatusFilter(status);
    setInvoicePage(0);
  };

  const handleAllowanceStatusFilterChange = (status: string) => {
    setAllowanceStatusFilter(status);
    setAllowancePage(0);
  };

  const handleToggleLock = async () => {
    if (!period) return;
    const newStatus = period.status === "locked" ? "open" : "locked";
    try {
      await updateTaxPeriodStatus(period.id, newStatus);
      toast.success(newStatus === "locked" ? "期別已鎖定" : "期別已解鎖");
      mutatePeriod();
    } catch (error) {
      toast.error(
        `更新狀態失敗: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const refreshInvoices = useCallback(() => {
    mutateInvoices();
    mutateInvoiceStatusCounts();
  }, [mutateInvoices, mutateInvoiceStatusCounts]);

  const refreshAllowances = useCallback(() => {
    mutateAllowances();
    mutateAllowanceStatusCounts();
  }, [mutateAllowances, mutateAllowanceStatusCounts]);

  const refreshAll = useCallback(() => {
    refreshInvoices();
    refreshAllowances();
  }, [refreshInvoices, refreshAllowances]);

  const handleExtractInvoice = async (invoiceId: string) => {
    toast.info("AI 正在處理中...");
    try {
      await extractInvoiceDataAction(invoiceId);
      toast.success("AI 處理完成，請進行確認");
    } catch (error) {
      console.error("Error extracting invoice data:", error);
      const errorMessage =
        error instanceof Error ? error.message : "AI 提取失敗";
      toast.error(errorMessage);
    } finally {
      refreshInvoices();
    }
  };

  const handleExtractAllowance = async (allowanceId: string) => {
    toast.info("AI 正在處理中...");
    try {
      await extractAllowanceDataAction(allowanceId);
      toast.success("AI 處理完成，請進行確認");
    } catch (error) {
      console.error("Error extracting allowance data:", error);
      const errorMessage =
        error instanceof Error ? error.message : "AI 提取失敗";
      toast.error(errorMessage);
    } finally {
      refreshAllowances();
    }
  };

  // Review navigation within current page
  const handleReviewNext = () => {
    if (!reviewingInvoice) return;
    const currentIndex = invoices.findIndex(
      (inv) => inv.id === reviewingInvoice.id,
    );
    if (currentIndex >= 0 && currentIndex < invoices.length - 1) {
      setReviewingInvoice(invoices[currentIndex + 1]);
    }
  };

  const handleReviewPrevious = () => {
    if (!reviewingInvoice) return;
    const currentIndex = invoices.findIndex(
      (inv) => inv.id === reviewingInvoice.id,
    );
    if (currentIndex > 0) {
      setReviewingInvoice(invoices[currentIndex - 1]);
    }
  };

  const handleAllowanceReviewNext = () => {
    if (!reviewingAllowance) return;
    const currentIndex = allowances.findIndex(
      (a) => a.id === reviewingAllowance.id,
    );
    if (currentIndex >= 0 && currentIndex < allowances.length - 1) {
      setReviewingAllowance(allowances[currentIndex + 1]);
    }
  };

  const handleAllowanceReviewPrevious = () => {
    if (!reviewingAllowance) return;
    const currentIndex = allowances.findIndex(
      (a) => a.id === reviewingAllowance.id,
    );
    if (currentIndex > 0) {
      setReviewingAllowance(allowances[currentIndex - 1]);
    }
  };

  // Navigate to a conflicting invoice within the same period
  const handleNavigateToConflict = useCallback(
    async (invoiceId: string) => {
      // Fetch the invoice directly since it may not be in the current filtered page
      const { data: inv } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (inv) {
        setReviewingInvoice(invoiceSchema.parse(inv));
      }
    },
    [supabase],
  );

  // Auto-open review dialog when ?invoiceId= query param is present
  useEffect(() => {
    const invoiceId = searchParams.get("invoiceId");
    if (invoiceId) {
      handleNavigateToConflict(invoiceId);
      // Clean up the URL param
      router.replace(
        `/firm/${firmId}/client/${clientId}/period/${periodYYYMM}`,
        { scroll: false },
      );
    }
  }, [searchParams, handleNavigateToConflict, router, firmId, clientId, periodYYYMM]);

  // Invoice review: optimistic auto-advance after confirm
  const handleInvoiceReviewSuccess = useCallback(() => {
    if (!reviewingInvoice) return;

    // Optimistically remove confirmed item and advance
    const currentIndex = invoices.findIndex(
      (inv) => inv.id === reviewingInvoice.id,
    );
    const remaining = invoices.filter(
      (inv) => inv.id !== reviewingInvoice.id,
    );

    if (remaining.length > 0) {
      const nextIndex = Math.min(currentIndex, remaining.length - 1);
      setReviewingInvoice(remaining[nextIndex]);
    } else {
      setReviewingInvoice(null);
    }

    // Optimistically update SWR cache (remove confirmed item from current page)
    mutateInvoices(
      (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.filter(
            (inv: Invoice) => inv.id !== reviewingInvoice.id,
          ),
          count: current.count - 1,
        };
      },
      { revalidate: false },
    );

    invoicePendingAdvanceRef.current = true;
  }, [reviewingInvoice, invoices, mutateInvoices]);

  // Allowance review: optimistic auto-advance after confirm
  const handleAllowanceReviewSuccess = useCallback(() => {
    if (!reviewingAllowance) return;

    const currentIndex = allowances.findIndex(
      (a) => a.id === reviewingAllowance.id,
    );
    const remaining = allowances.filter(
      (a) => a.id !== reviewingAllowance.id,
    );

    if (remaining.length > 0) {
      const nextIndex = Math.min(currentIndex, remaining.length - 1);
      setReviewingAllowance(remaining[nextIndex]);
    } else {
      setReviewingAllowance(null);
    }

    mutateAllowances(
      (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.filter(
            (a: Allowance) => a.id !== reviewingAllowance.id,
          ),
          count: current.count - 1,
        };
      },
      { revalidate: false },
    );

    allowancePendingAdvanceRef.current = true;
  }, [reviewingAllowance, allowances, mutateAllowances]);

  // Revalidate when review dialog closes after optimistic updates
  useEffect(() => {
    if (!reviewingInvoice && invoicePendingAdvanceRef.current) {
      invoicePendingAdvanceRef.current = false;
      refreshInvoices();
    }
  }, [reviewingInvoice, refreshInvoices]);

  useEffect(() => {
    if (!reviewingAllowance && allowancePendingAdvanceRef.current) {
      allowancePendingAdvanceRef.current = false;
      refreshAllowances();
    }
  }, [reviewingAllowance, refreshAllowances]);

  const handleBulkRefresh = useCallback(() => {
    refreshAll();
  }, [refreshAll]);

  const invoiceTotalPages = Math.max(
    1,
    Math.ceil(invoiceTotalCount / PAGE_SIZE),
  );
  const allowanceTotalPages = Math.max(
    1,
    Math.ceil(allowanceTotalCount / PAGE_SIZE),
  );

  if (isPeriodLoading || isClientLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!period) {
    return (
      <div className="p-6 flex flex-col items-center justify-center space-y-4">
        <h1 className="text-2xl font-bold">找不到此期別</h1>
        <p className="text-muted-foreground">
          期別 {rocPeriod.format()} 尚未建立。請先建立期別。
        </p>
        <Button onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> 返回
        </Button>
      </div>
    );
  }

  if (!client) {
    return <div>Client not found</div>;
  }

  const isLocked = period.status === "locked" || period.status === "filed";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              {rocPeriod.format()}
              <Badge
                variant={period.status === "locked" ? "secondary" : "default"}
              >
                {period.status === "locked" ? "已鎖定" : "進行中"}
              </Badge>
            </h1>
            <p className="text-muted-foreground mt-1">
              {client.name} (統編: {client.tax_id})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={period.status === "locked" ? "outline" : "secondary"}
            onClick={handleToggleLock}
          >
            {period.status === "locked" ? (
              <>
                <Unlock className="mr-2 h-4 w-4" /> 解鎖期別
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" /> 鎖定期別
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="invoices" className="w-full">
        <TabsList>
          <TabsTrigger value="invoices">發票列表</TabsTrigger>
          <TabsTrigger value="ranges">字軌管理</TabsTrigger>
          <TabsTrigger value="reports">報表產生</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-6 space-y-6">
          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <BulkExtractionProgress
              periodId={period.id}
              isLocked={isLocked}
              totalEntities={totalEntityCount}
              onRefresh={handleBulkRefresh}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsImportModalOpen(true)}
                disabled={isLocked}
              >
                <FileText className="mr-2 h-4 w-4" /> 匯入電子發票/折讓
              </Button>
              <Button
                onClick={() => setIsUploadModalOpen(true)}
                disabled={isLocked}
              >
                <Plus className="mr-2 h-4 w-4" /> 上傳發票
              </Button>
            </div>
          </div>

          {/* Invoices Section */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">
                  發票 ({invoiceTotalCount})
                </CardTitle>
                <Link
                  href={`/firm/${firmId}/client/${clientId}/voucher`}
                  className="inline-flex items-center gap-1 text-base text-muted-foreground hover:text-foreground"
                >
                  <BookOpen className="size-4" />
                  已 confirmed 之發票會產生 draft 傳票 →
                </Link>
              </div>
              <StatusFilterBar
                activeStatus={invoiceStatusFilter}
                onStatusChange={handleInvoiceStatusFilterChange}
                counts={invoiceStatusCounts}
              />
            </CardHeader>
            <CardContent>
              <InvoiceTable
                invoices={invoices}
                isLoading={isInvoicesLoading}
                onReview={setReviewingInvoice}
                onExtractAI={isLocked ? undefined : handleExtractInvoice}
                onDelete={
                  isLocked
                    ? undefined
                    : (invoice) =>
                        setInvoiceToDelete({
                          id: invoice.id,
                          name: invoice.filename,
                        })
                }
                showClientColumn={false}
              />
              <TablePagination
                page={invoicePage}
                totalPages={invoiceTotalPages}
                totalItems={invoiceTotalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setInvoicePage}
              />
            </CardContent>
          </Card>

          {/* Allowances Section */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">
                  折讓 ({allowanceTotalCount})
                </CardTitle>
                <Link
                  href={`/firm/${firmId}/client/${clientId}/voucher`}
                  className="inline-flex items-center gap-1 text-base text-muted-foreground hover:text-foreground"
                >
                  <BookOpen className="size-4" />
                  已 confirmed 之折讓會產生 draft 傳票 →
                </Link>
              </div>
              <StatusFilterBar
                activeStatus={allowanceStatusFilter}
                onStatusChange={handleAllowanceStatusFilterChange}
                counts={allowanceStatusCounts}
              />
            </CardHeader>
            <CardContent>
              <AllowanceTable
                allowances={allowances}
                isLoading={isAllowancesLoading}
                onReview={setReviewingAllowance}
                onExtractAI={isLocked ? undefined : handleExtractAllowance}
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
                page={allowancePage}
                totalPages={allowanceTotalPages}
                totalItems={allowanceTotalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setAllowancePage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ranges" className="mt-6">
          <RangeManagement
            clientId={clientId}
            period={rocPeriod}
            isLocked={isLocked}
          />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <ReportGeneration
            client={client}
            period={rocPeriod}
            hasUnconfirmedDocuments={hasUnconfirmedDocuments}
          />
        </TabsContent>
      </Tabs>

      <InvoiceImportDialog
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        firmId={firmId}
        clientId={clientId}
        period={rocPeriod}
        onSuccess={refreshInvoices}
        onAllowanceSuccess={refreshAllowances}
      />

      <InvoiceUploadDialog
        open={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        firmId={firmId}
        clientId={clientId}
        period={rocPeriod}
        periodId={period.id}
        clientName={client.name}
        onSuccess={refreshInvoices}
        onAllowanceSuccess={refreshAllowances}
      />

      <InvoiceReviewDialog
        invoice={reviewingInvoice}
        isOpen={!!reviewingInvoice}
        onOpenChange={(open) => !open && setReviewingInvoice(null)}
        onSuccess={handleInvoiceReviewSuccess}
        onNext={handleReviewNext}
        onPrevious={handleReviewPrevious}
        isLocked={isLocked}
        onNavigateToConflict={handleNavigateToConflict}
      />

      <InvoiceDeleteDialog
        invoice={invoiceToDelete}
        open={!!invoiceToDelete}
        onOpenChange={(open) => !open && setInvoiceToDelete(null)}
        onSuccess={refreshInvoices}
      />

      <AllowanceDeleteDialog
        allowance={allowanceToDelete}
        open={!!allowanceToDelete}
        onOpenChange={(open) => !open && setAllowanceToDelete(null)}
        onSuccess={refreshAllowances}
      />

      <AllowanceReviewDialog
        allowance={reviewingAllowance}
        isOpen={!!reviewingAllowance}
        onOpenChange={(open) => !open && setReviewingAllowance(null)}
        onSuccess={handleAllowanceReviewSuccess}
        onNext={handleAllowanceReviewNext}
        onPrevious={handleAllowanceReviewPrevious}
        isLocked={isLocked}
      />
    </div>
  );
}
