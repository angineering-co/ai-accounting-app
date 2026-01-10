"use client";

import { use, useEffect, useState, useCallback } from "react";
import useSWR from "swr";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { InvoiceTable } from "@/components/invoice-table";
import { InvoiceReviewDialog } from "@/components/invoice-review-dialog";
import { createInvoice, updateInvoice, deleteInvoice, extractInvoiceDataAction } from "@/lib/services/invoice";
import { RangeManagement } from "@/components/range-management";
import { ReportGeneration } from "@/components/report-generation";
import { toast } from "sonner";
import { type Invoice, invoiceSchema, clientSchema, updateInvoiceSchema, type UpdateInvoiceInput } from "@/lib/domain/models";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/dropzone";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import { Label } from "@/components/ui/label";
import { PeriodSelector } from "@/components/period-selector";

import { RocPeriod } from "@/lib/domain/roc-period";

const uploadFormSchema = z.object({
  in_or_out: z.enum(["in", "out"]),
  period: z.instanceof(RocPeriod),
});

type UploadFormInput = z.infer<typeof uploadFormSchema>;

const updateFormSchema = updateInvoiceSchema.extend({
  period: z.instanceof(RocPeriod),
});

type UpdateFormInput = z.infer<typeof updateFormSchema>;

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = use(params);
  const router = useRouter();
  const supabase = createSupabaseClient();
  const [reviewingInvoice, setReviewingInvoice] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [uploadFolderId, setUploadFolderId] = useState<string>(() => crypto.randomUUID());
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  
  // Period for reports
  const [reportPeriod, setReportPeriod] = useState<RocPeriod>(() => RocPeriod.now());

  // Fetch client details
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
    }
  );

  // Fetch client invoices
  const { data: invoices = [], isLoading: isInvoicesLoading, mutate: fetchInvoices } = useSWR(
    ["client-invoices", clientId],
    async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return invoiceSchema.array().parse(data || []);
    }
  );

  const uploadForm = useForm<UploadFormInput>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      in_or_out: "in",
      period: RocPeriod.now(),
    },
  });

  const updateForm = useForm<UpdateFormInput>({
    resolver: zodResolver(updateFormSchema),
    defaultValues: {
      client_id: clientId,
      in_or_out: "in",
      status: "uploaded",
      period: RocPeriod.now(),
    },
  });

  const uploadProps = useSupabaseUpload({
    bucketName: "invoices",
    path: `${firmId}/${uploadFolderId}`,
    allowedMimeTypes: ["image/*", "application/pdf"],
    maxFiles: 10,
    maxFileSize: 50 * 1024 * 1024,
    getStorageKey: (file) => {
      const ext = file.name.split('.').pop();
      return `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
    },
  });

  const handleUploadComplete = useCallback(async () => {
    if (isProcessingUpload) return;
    setIsProcessingUpload(true);
    const formData = uploadForm.getValues();
    
    try {
      const promises = uploadProps.uploadedFiles.map(async (uploadedFile) => {
        await createInvoice({
          firm_id: firmId,
          client_id: clientId,
          storage_path: uploadedFile.path,
          filename: uploadedFile.name,
          in_or_out: formData.in_or_out,
          year_month: formData.period.toString(),
        });
      });

      await Promise.all(promises);
      toast.success("發票上傳成功");
      setIsUploadModalOpen(false);
      uploadForm.reset({
        in_or_out: "in",
        period: RocPeriod.now(),
      });
      uploadProps.setFiles([]);
      uploadProps.setUploadedFiles([]);
      setUploadFolderId(crypto.randomUUID());
      fetchInvoices();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("上傳失敗");
    } finally {
      setIsProcessingUpload(false);
    }
  }, [clientId, fetchInvoices, firmId, isProcessingUpload, uploadForm, uploadProps]);

  const handleEditInvoice = async (values: UpdateFormInput) => {
    if (!editingInvoice) return;

    try {
      const { period, ...rest } = values;
      await updateInvoice(editingInvoice.id, {
        ...rest,
        year_month: period.toString(),
      });

      toast.success("更新發票成功");
      setEditingInvoice(null);
      updateForm.reset();
      fetchInvoices();
    } catch (error) {
      console.error("Error updating invoice:", error);
      toast.error("更新失敗");
    }
  };

  const openEditModal = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    updateForm.reset({
      client_id: invoice.client_id || clientId,
      in_or_out: invoice.in_or_out as "in" | "out",
      status: invoice.status as UpdateInvoiceInput["status"] || "uploaded",
      period: invoice.year_month ? RocPeriod.fromYYYMM(invoice.year_month) : RocPeriod.now(),
    });
  };

  useEffect(() => {
    if (uploadProps.isSuccess && !isProcessingUpload) {
      handleUploadComplete();
    }
  }, [uploadProps.isSuccess, isProcessingUpload, handleUploadComplete]);

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

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    setIsDeleting(true);
    try {
      await deleteInvoice(invoiceToDelete.id);
      toast.success("刪除成功");
      setInvoiceToDelete(null);
      fetchInvoices();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      toast.error("刪除失敗");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isClientLoading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!client) return <div className="p-6 text-center">找不到客戶</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList>
          <TabsTrigger value="basic">基本資料</TabsTrigger>
          <TabsTrigger value="invoices">發票管理</TabsTrigger>
          <TabsTrigger value="reports">報表與字軌</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>基本資訊</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">統一編號</p>
                <p>{client.tax_id}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">稅籍編號</p>
                <p>{client.tax_payer_id}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">負責人</p>
                <p>{client.contact_person || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">產業</p>
                <p>{client.industry || "-"}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">發票列表</h2>
            <Button onClick={() => setIsUploadModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> 上傳發票
            </Button>
          </div>

          <InvoiceTable
            invoices={invoices}
            isLoading={isInvoicesLoading}
            onReview={setReviewingInvoice}
            onExtractAI={handleExtractInvoice}
            onEdit={openEditModal}
            onDelete={setInvoiceToDelete}
            showClientColumn={false}
          />
        </TabsContent>

        <TabsContent value="reports" className="mt-6 space-y-6">
          <div className="flex items-center gap-4">
            <Label className="text-lg font-semibold">選擇期別:</Label>
            <PeriodSelector 
              value={reportPeriod} 
              onChange={setReportPeriod} 
            />
          </div>

          <RangeManagement clientId={clientId} period={reportPeriod} />
          
          <ReportGeneration client={client} period={reportPeriod} />
        </TabsContent>
      </Tabs>

      {/* Upload Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <ResponsiveDialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>上傳發票 - {client.name}</DialogTitle>
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
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={uploadForm.control}
                name="in_or_out"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>發票類型</FormLabel>
                    <Select 
                      onValueChange={field.onChange}
                      defaultValue={field.value}
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

      <InvoiceReviewDialog
        invoice={reviewingInvoice}
        isOpen={!!reviewingInvoice}
        onOpenChange={(open) => !open && setReviewingInvoice(null)}
        onSuccess={fetchInvoices}
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
              編輯發票的類型與期別。
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

      <Dialog open={!!invoiceToDelete} onOpenChange={(open) => !open && setInvoiceToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">確認刪除</DialogTitle>
            <DialogDescription>確定要刪除發票 「{invoiceToDelete?.filename}」 嗎？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInvoiceToDelete(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDeleteInvoice} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

