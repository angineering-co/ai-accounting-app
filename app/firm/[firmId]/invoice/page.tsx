"use client";

import { useEffect, useState, use, useCallback } from "react";
import useSWR from "swr";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Database } from "@/supabase/database.types";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/dropzone";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createInvoice, updateInvoice } from "@/lib/services/invoice";
import { updateInvoiceSchema, type UpdateInvoiceInput, type Invoice as DomainInvoice } from "@/lib/domain/models";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { InvoiceReviewDialog } from "@/components/invoice-review-dialog";
import { InvoiceTable } from "@/components/invoice-table";

type Invoice = DomainInvoice & {
  client?: { id: string; name: string } | null;
};

type Client = Database["public"]["Tables"]["clients"]["Row"];

const uploadFormSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  in_or_out: z.enum(["in", "out"]),
});

type UploadFormInput = z.infer<typeof uploadFormSchema>;

export default function InvoicePage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = use(params);
  const supabase = createSupabaseClient();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [uploadFolderId, setUploadFolderId] = useState<string>(crypto.randomUUID());
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [reviewingInvoice, setReviewingInvoice] = useState<Invoice | null>(null);

  // Upload form
  const uploadForm = useForm<UploadFormInput>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      client_id: null,
      in_or_out: "in",
    },
  });

  // Update form
  const updateForm = useForm<UpdateInvoiceInput>({
    resolver: zodResolver(updateInvoiceSchema),
    defaultValues: {
      client_id: null,
      in_or_out: "in",
      status: "uploaded",
    },
  });

  // Dropzone for file uploads
  const uploadProps = useSupabaseUpload({
    bucketName: "invoices",
    path: `${firmId}/${uploadFolderId}`,
    allowedMimeTypes: ["image/*", "application/pdf"],
    maxFiles: 10,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    getStorageKey: (file) => {
      const ext = file.name.split('.').pop();
      return `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
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
    return (data || []) as unknown as Invoice[];
  };

  const {
    data: invoices = [],
    error,
    isLoading,
    mutate: fetchInvoices,
  } = useSWR<Invoice[]>(["invoices", firmId], fetcher);

  // Fetch clients for dropdown
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

  const handleUploadComplete = useCallback(async () => {
    if (isProcessingUpload) return; // Prevent duplicate processing
    
    setIsProcessingUpload(true);
    const formData = uploadForm.getValues();
    
    try {
      // Create invoice records for each uploaded file
      const promises = uploadProps.uploadedFiles.map(async (uploadedFile) => {
        await createInvoice({
          firm_id: firmId,
          client_id: formData.client_id || null,
          storage_path: uploadedFile.path,
          filename: uploadedFile.name,
          in_or_out: formData.in_or_out,
        });
      });

      await Promise.all(promises);

      toast.success(`成功上傳 ${uploadProps.uploadedFiles.length} 張發票。`);
      setIsUploadModalOpen(false);
      uploadForm.reset();
      uploadProps.setFiles([]);
      uploadProps.setUploadedFiles([]);
      // Generate new folder ID for next upload
      setUploadFolderId(crypto.randomUUID());
      fetchInvoices();
    } catch (error) {
      console.error("Error creating invoice records:", error);
      toast.error("建立發票記錄失敗。");
    } finally {
      setIsProcessingUpload(false);
    }
  }, [
    firmId,
    uploadForm,
    fetchInvoices,
    isProcessingUpload,
    uploadProps
  ]);

  useEffect(() => {
    if (error) {
      console.error("Error fetching invoices:", error);
      toast.error("取得發票資料失敗。");
    }
  }, [error]);

  // Reset upload on successful upload
  useEffect(() => {
    if (uploadProps.isSuccess && !isProcessingUpload) {
      handleUploadComplete();
    }
  }, [uploadProps.isSuccess, isProcessingUpload, handleUploadComplete]);

  const openUploadModal = () => {
    uploadForm.reset({
      client_id: null,
      in_or_out: "in",
    });
    uploadProps.setFiles([]);
    uploadProps.setErrors([]);
    setUploadFolderId(crypto.randomUUID());
    setIsUploadModalOpen(true);
  };

  const handleEditInvoice = async (data: UpdateInvoiceInput) => {
    if (!editingInvoice) return;

    try {
      await updateInvoice(editingInvoice.id, data);

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

  // Mock AI Processing Simulation
  const simulateAIProcessing = async (invoiceId: string) => {
    try {
      // Step 1: Status -> processing
      await updateInvoice(invoiceId, { status: "processing" });
      fetchInvoices();
      toast.info("AI 正在處理中...");

      // Step 2: Simulate delay then status -> processed + mock data
      setTimeout(async () => {
        await updateInvoice(invoiceId, {
          status: "processed",
          extracted_data: {
            invoice_number: "INV-" + Math.floor(Math.random() * 1000000),
            invoice_date: new Date().toISOString().split('T')[0],
            amount: 1000,
            tax_amount: 50,
            total_amount: 1050,
            vendor_name: "模擬供應商股份有限公司",
            vendor_tax_id: "12345678"
          }
        });
        fetchInvoices();
        toast.success("AI 處理完成，請進行確認");
      }, 3000);
    } catch (error) {
      console.error("Error simulating AI:", error);
      toast.error("模擬 AI 處理失敗");
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    setIsDeleting(true);
    try {
      // Delete file from storage
      const { error: storageError } = await supabase.storage
        .from("invoices")
        .remove([invoiceToDelete.storage_path]);

      if (storageError) throw storageError;

      // Delete database record
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceToDelete.id);

      if (error) {
        throw error;
      } else {
        toast.success("刪除發票成功。");
        setInvoiceToDelete(null);
        fetchInvoices();
      }
    } catch (error) {
      console.error("Error deleting invoice:", error);
      toast.error("刪除發票失敗。");
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditModal = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    updateForm.reset({
      client_id: invoice.client_id || null,
      in_or_out: invoice.in_or_out as "in" | "out",
      status: invoice.status as UpdateInvoiceInput["status"] || "uploaded",
    });
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const statusMatch = statusFilter === "all" || invoice.status === statusFilter;
    const typeMatch = typeFilter === "all" || invoice.in_or_out === typeFilter;
    return statusMatch && typeMatch;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">發票管理</h1>
          <p className="text-muted-foreground">上傳和管理您的發票資料。</p>
        </div>
        <Button onClick={openUploadModal}>
          <Upload className="mr-2 h-4 w-4" /> 上傳發票
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>篩選</CardTitle>
          <CardDescription>依據狀態或類型篩選發票</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">狀態</label>
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
            <label className="text-sm font-medium mb-2 block">類型</label>
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
        onSimulateAI={simulateAIProcessing}
        onEdit={openEditModal}
        onDelete={setInvoiceToDelete}
      />

      {/* Upload Modal */}
      <Dialog 
        open={isUploadModalOpen} 
        onOpenChange={(open) => {
          setIsUploadModalOpen(open);
          if (!open) {
            uploadProps.setFiles([]);
          }
        }}
      >
        <ResponsiveDialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>上傳發票</DialogTitle>
            <DialogDescription>
              選擇發票檔案並設定相關資訊。支援 PDF 和圖片格式。
            </DialogDescription>
          </DialogHeader>
          <Form {...uploadForm}>
            <form className="flex flex-col gap-4 py-4">
              <FormField
                control={uploadForm.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>客戶（選填）</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(value) => field.onChange(value === "none" ? null : value)}
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
                control={uploadForm.control}
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

              <div className="space-y-2">
                <Label>檔案</Label>
                <Dropzone {...uploadProps}>
                  <DropzoneEmptyState />
                  <DropzoneContent />
                </Dropzone>
              </div>
            </form>
          </Form>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsUploadModalOpen(false)}
            >
              取消
            </Button>
          </DialogFooter>
        </ResponsiveDialogContent>
      </Dialog>

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
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>客戶</FormLabel>
                      <Select
                        value={field.value || "none"}
                        onValueChange={(value) => field.onChange(value === "none" ? null : value)}
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
      />
    </div>
  );
}

