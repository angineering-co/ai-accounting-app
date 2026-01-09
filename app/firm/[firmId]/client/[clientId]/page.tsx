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
import { createInvoice, deleteInvoice, extractInvoiceDataAction } from "@/lib/services/invoice";
import { RangeManagement } from "@/components/range-management";
import { ReportGeneration } from "@/components/report-generation";
import { toast } from "sonner";
import { type Invoice, invoiceSchema, clientSchema } from "@/lib/domain/models";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
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
});

type UploadFormInput = z.infer<typeof uploadFormSchema>;

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
        });
      });

      await Promise.all(promises);
      toast.success("發票上傳成功");
      setIsUploadModalOpen(false);
      uploadForm.reset();
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
              <div className="space-y-2">
                <Label>發票類型</Label>
                <Select 
                  onValueChange={(val: "in" | "out") => uploadForm.setValue("in_or_out", val)}
                  defaultValue="in"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">進項發票</SelectItem>
                    <SelectItem value="out">銷項發票</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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

