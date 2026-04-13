"use client";

import { useEffect, useState, use } from "react";
import useSWR from "swr";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Database } from "@/supabase/database.types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  updateInvoice,
  deleteInvoice,
  extractInvoiceDataAction,
} from "@/lib/services/invoice";
import {
  updateInvoiceSchema,
  invoiceSchema,
  type Invoice as DomainInvoice,
} from "@/lib/domain/models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceReviewDialog } from "@/components/invoice-review-dialog";
import { InvoiceTable } from "@/components/invoice-table";
import { RocPeriod } from "@/lib/domain/roc-period";
import { PeriodSelector } from "@/components/period-selector";

type Invoice = DomainInvoice & {
  client?: { id: string; name: string } | null;
};

type Client = Database["public"]["Tables"]["clients"]["Row"];

const updateFormSchema = updateInvoiceSchema.extend({
  period: z.instanceof(RocPeriod),
});

type UpdateFormInput = z.infer<typeof updateFormSchema>;

export default function InvoicePage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = use(params);
  const supabase = createSupabaseClient();
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [reviewingInvoice, setReviewingInvoice] = useState<Invoice | null>(null);

  const updateForm = useForm<UpdateFormInput>({
    resolver: zodResolver(updateFormSchema),
    defaultValues: {
      client_id: null,
      in_or_out: "in",
      status: "uploaded",
      period: RocPeriod.now(),
    },
  });

  const fetcher = async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select(`
        *,
        client:clients(id, name)
      `)
      .eq("firm_id", firmId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    
    const invoiceWithClientSchema = invoiceSchema.extend({
      client: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
    });
    return z.array(invoiceWithClientSchema).parse(data || []);
  };

  const {
    data: invoices = [],
    error,
    isLoading,
    mutate: fetchInvoices,
  } = useSWR<Invoice[]>(["invoices", firmId], fetcher);

  const clientsFetcher = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("firm_id", firmId)
      .order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  };

  const { data: clients = [] } = useSWR<Client[]>(["clients", firmId], clientsFetcher);

  const handleEditInvoice = async (values: UpdateFormInput) => {
    if (!editingInvoice) return;

    try {
      const { period, ...rest } = values;
      const result = await updateInvoice(editingInvoice.id, {
        ...rest,
        year_month: period.toString(),
      });

      if (!result.success && result.error === "serial_conflict") {
        toast.error(`字軌號碼 ${result.serialCode} 已被使用`);
        return;
      }

      toast.success("更新發票成功。");
      setEditingInvoice(null);
      updateForm.reset();
      fetchInvoices();
    } catch (error) {
      console.error("Error updating invoice:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "更新發票失敗。請檢查您的輸入。"
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
      fetchInvoices();
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    setIsDeleting(true);
    try {
      await deleteInvoice(invoiceToDelete.id);
      toast.success("刪除發票成功。");
      setInvoiceToDelete(null);
      fetchInvoices();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      toast.error("刪除發票失敗。");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (error) {
      console.error("Error fetching invoices:", error);
      toast.error("取得發票資料失敗。");
    }
  }, [error]);

  const filteredInvoices = invoices.filter((invoice) => {
    const statusMatch = statusFilter === "all" || invoice.status === statusFilter;
    const typeMatch = typeFilter === "all" || invoice.in_or_out === typeFilter;
    return statusMatch && typeMatch;
  });

  const handleReviewNext = () => {
    if (!reviewingInvoice) return;
    const currentIndex = filteredInvoices.findIndex(
      (inv) => inv.id === reviewingInvoice.id
    );
    if (currentIndex >= 0 && currentIndex < filteredInvoices.length - 1) {
      setReviewingInvoice(filteredInvoices[currentIndex + 1]);
    }
  };

  const handleReviewPrevious = () => {
    if (!reviewingInvoice) return;
    const currentIndex = filteredInvoices.findIndex(
      (inv) => inv.id === reviewingInvoice.id
    );
    if (currentIndex > 0) {
      setReviewingInvoice(filteredInvoices[currentIndex - 1]);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">發票管理</h1>
        <p className="text-muted-foreground">管理客戶的發票資料。</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>篩選</CardTitle>
          <CardDescription>依據狀態或類型篩選發票</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <label className="text-base font-medium mb-2 block">狀態</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="uploaded">已上傳</SelectItem>
                <SelectItem value="processing">處理中</SelectItem>
                <SelectItem value="processed">待確認</SelectItem>
                <SelectItem value="confirmed">已確認</SelectItem>
                <SelectItem value="failed">失敗</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-base font-medium mb-2 block">類型</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="in">進項發票</SelectItem>
                <SelectItem value="out">銷項發票</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Table */}
      <InvoiceTable
        invoices={filteredInvoices}
        isLoading={isLoading}
        onReview={setReviewingInvoice}
        onExtractAI={handleExtractInvoice}
        onDelete={setInvoiceToDelete}
      />

      {/* Edit Modal */}
      <Dialog
        open={!!editingInvoice}
        onOpenChange={(open) => !open && setEditingInvoice(null)}
      >
        <ResponsiveDialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>編輯發票</DialogTitle>
            <DialogDescription>
              編輯發票的客戶和類型資訊。
            </DialogDescription>
          </DialogHeader>
          <Form {...updateForm}>
            <form
              onSubmit={updateForm.handleSubmit(handleEditInvoice)}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
                <FormField
                  control={updateForm.control}
                  name="period"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>所屬期別</FormLabel>
                      <FormControl>
                        <PeriodSelector
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={updateForm.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>客戶</FormLabel>
                      <Select
                        value={field.value || "none"}
                        onValueChange={(value) =>
                          field.onChange(value === "none" ? null : value)
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="選擇客戶" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">未指定</SelectItem>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={updateForm.control}
                  name="in_or_out"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>發票類型</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="in">進項發票</SelectItem>
                          <SelectItem value="out">銷項發票</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="pt-2">
                <Button
                  type="submit"
                  disabled={updateForm.formState.isSubmitting}
                >
                  {updateForm.formState.isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  保存
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </ResponsiveDialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!invoiceToDelete}
        onOpenChange={(open) => !open && setInvoiceToDelete(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">確認刪除</DialogTitle>
            <DialogDescription>
              您確定要刪除發票「{invoiceToDelete?.filename}」嗎？此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setInvoiceToDelete(null)}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteInvoice}
              disabled={isDeleting}
            >
              {isDeleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoiceReviewDialog
        invoice={reviewingInvoice}
        isOpen={!!reviewingInvoice}
        onOpenChange={(open) => !open && setReviewingInvoice(null)}
        onSuccess={fetchInvoices}
        onNext={handleReviewNext}
        onPrevious={handleReviewPrevious}
      />
    </div>
  );
}

