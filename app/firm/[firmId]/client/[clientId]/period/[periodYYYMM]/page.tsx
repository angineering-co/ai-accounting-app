"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Lock, Unlock, Plus, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { InvoiceTable } from "@/components/invoice-table";
import { AllowanceTable } from "@/components/allowance-table";
import { RangeManagement } from "@/components/range-management";
import { ReportGeneration } from "@/components/report-generation";
import { toast } from "sonner";
import { type Invoice, type Allowance, invoiceSchema, allowanceSchema, clientSchema } from "@/lib/domain/models";
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
import { InvoiceEditDialog } from "@/components/invoice/invoice-edit-dialog";
import { InvoiceDeleteDialog } from "@/components/invoice/invoice-delete-dialog";
import { AllowanceReviewDialog } from "@/components/allowance-review-dialog";

export default function PeriodDetailPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string; periodYYYMM: string }>;
}) {
  const { firmId, clientId, periodYYYMM } = use(params);
  const router = useRouter();
  const supabase = createSupabaseClient();
  const rocPeriod = RocPeriod.fromYYYMM(periodYYYMM);

  // State
  const [reviewingInvoice, setReviewingInvoice] = useState<Invoice | null>(null);
  const [reviewingAllowance, setReviewingAllowance] = useState<Allowance | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  
  // Import Electronic Invoice State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

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

  // Fetch Invoices (Filtered by Period ID)
  const { 
    data: invoices = [], 
    isLoading: isInvoicesLoading,
    mutate: fetchInvoices
  } = useSWR(
    period ? ["period-invoices", period.id] : null,
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

  // Fetch Allowances (Filtered by Period ID)
  const { 
    data: allowances = [], 
    isLoading: isAllowancesLoading,
    mutate: fetchAllowances
  } = useSWR(
    period ? ["period-allowances", period.id] : null,
    async () => {
      if (!period) return [];
      const { data, error } = await supabase
        .from("allowances")
        .select("*")
        .eq("client_id", clientId)
        .eq("tax_filing_period_id", period.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return allowanceSchema.array().parse(data || []);
    },
  );

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

  const handleExtractInvoice = async (invoiceId: string) => {
    try {
      toast.info("AI 正在處理中...");
      await extractInvoiceDataAction(invoiceId);
      fetchInvoices();
      toast.success("AI 處理完成，請進行確認");
    } catch (error) {
      console.error("Error extracting invoice data:", error);
      const errorMessage = error instanceof Error ? error.message : "AI 提取失敗";
      toast.error(errorMessage);
      fetchInvoices(); // Refresh to show updated status (likely "failed")
    }
  };

  const handleReviewNext = () => {
    if (!reviewingInvoice) return;
    const currentIndex = invoices.findIndex(
      (inv) => inv.id === reviewingInvoice.id
    );
    if (currentIndex >= 0 && currentIndex < invoices.length - 1) {
      setReviewingInvoice(invoices[currentIndex + 1]);
    }
  };

  const handleReviewPrevious = () => {
    if (!reviewingInvoice) return;
    const currentIndex = invoices.findIndex(
      (inv) => inv.id === reviewingInvoice.id
    );
    if (currentIndex > 0) {
      setReviewingInvoice(invoices[currentIndex - 1]);
    }
  };

  const handleAllowanceReviewNext = () => {
    if (!reviewingAllowance) return;
    const currentIndex = allowances.findIndex(
      (a) => a.id === reviewingAllowance.id
    );
    if (currentIndex >= 0 && currentIndex < allowances.length - 1) {
      setReviewingAllowance(allowances[currentIndex + 1]);
    }
  };

  const handleAllowanceReviewPrevious = () => {
    if (!reviewingAllowance) return;
    const currentIndex = allowances.findIndex(
      (a) => a.id === reviewingAllowance.id
    );
    if (currentIndex > 0) {
      setReviewingAllowance(allowances[currentIndex - 1]);
    }
  };

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
          <div className="flex justify-end">
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
              <CardTitle className="text-lg">發票 ({invoices.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <InvoiceTable
                invoices={invoices}
                isLoading={isInvoicesLoading}
                onReview={setReviewingInvoice}
                onExtractAI={isLocked ? undefined : handleExtractInvoice}
                onEdit={isLocked ? undefined : setEditingInvoice}
                onDelete={isLocked ? undefined : setInvoiceToDelete}
                showClientColumn={false}
              />
            </CardContent>
          </Card>

          {/* Allowances Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">折讓 ({allowances.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <AllowanceTable
                allowances={allowances}
                isLoading={isAllowancesLoading}
                onReview={setReviewingAllowance}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ranges" className="mt-6">
          <RangeManagement clientId={clientId} period={rocPeriod} isLocked={isLocked} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <ReportGeneration client={client} period={rocPeriod} />
        </TabsContent>
      </Tabs>

      <InvoiceImportDialog
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        firmId={firmId}
        clientId={clientId}
        period={rocPeriod}
        onSuccess={fetchInvoices}
        onAllowanceSuccess={fetchAllowances}
      />

      <InvoiceUploadDialog
        open={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        firmId={firmId}
        clientId={clientId}
        period={rocPeriod}
        periodId={period.id}
        clientName={client.name}
        onSuccess={fetchInvoices}
        onAllowanceSuccess={fetchAllowances}
      />

      <InvoiceReviewDialog
        invoice={reviewingInvoice}
        isOpen={!!reviewingInvoice}
        onOpenChange={(open) => !open && setReviewingInvoice(null)}
        onSuccess={fetchInvoices}
        onNext={handleReviewNext}
        onPrevious={handleReviewPrevious}
        isLocked={isLocked}
      />

      <InvoiceEditDialog
        invoice={editingInvoice}
        open={!!editingInvoice}
        onOpenChange={(open) => !open && setEditingInvoice(null)}
        clientId={clientId}
        currentPeriod={rocPeriod}
        currentPeriodId={period.id}
        onSuccess={fetchInvoices}
      />

      <InvoiceDeleteDialog
        invoice={invoiceToDelete}
        open={!!invoiceToDelete}
        onOpenChange={(open) => !open && setInvoiceToDelete(null)}
        onSuccess={fetchInvoices}
      />

      <AllowanceReviewDialog
        allowance={reviewingAllowance}
        isOpen={!!reviewingAllowance}
        onOpenChange={(open) => !open && setReviewingAllowance(null)}
        onSuccess={fetchAllowances}
        onNext={handleAllowanceReviewNext}
        onPrevious={handleAllowanceReviewPrevious}
        isLocked={isLocked}
      />
    </div>
  );
}
