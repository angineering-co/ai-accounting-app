"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Save } from "lucide-react";
import { 
  extractedInvoiceDataSchema, 
  type ExtractedInvoiceData, 
  type Invoice 
} from "@/lib/domain/models";
import { updateInvoice } from "@/lib/services/invoice";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

interface InvoiceReviewDialogProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function InvoiceReviewDialog({
  invoice,
  isOpen,
  onOpenChange,
  onSuccess
}: InvoiceReviewDialogProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const supabase = createClient();

  const form = useForm<ExtractedInvoiceData>({
    resolver: zodResolver(extractedInvoiceDataSchema),
    defaultValues: {
      invoice_number: "",
      invoice_date: "",
      amount: 0,
      tax_amount: 0,
      total_amount: 0,
      vendor_name: "",
      vendor_tax_id: "",
    },
  });

  useEffect(() => {
    if (invoice && isOpen) {
      form.reset({
        invoice_number: invoice.extracted_data?.invoice_number || "",
        invoice_date: invoice.extracted_data?.invoice_date || "",
        amount: invoice.extracted_data?.amount || 0,
        tax_amount: invoice.extracted_data?.tax_amount || 0,
        total_amount: invoice.extracted_data?.total_amount || 0,
        vendor_name: invoice.extracted_data?.vendor_name || "",
        vendor_tax_id: invoice.extracted_data?.vendor_tax_id || "",
        ...invoice.extracted_data
      });

      // Get signed URL for preview
      const getPreview = async () => {
        const { data } = await supabase.storage
          .from("invoices")
          .createSignedUrl(invoice.storage_path, 3600);
        
        if (data) setPreviewUrl(data.signedUrl);
      };
      getPreview();
    } else {
      setPreviewUrl(null);
    }
  }, [invoice, isOpen, form, supabase.storage]);

  const handleSave = async (data: ExtractedInvoiceData, status: Invoice["status"] = "processed") => {
    if (!invoice) return;

    try {
      await updateInvoice(invoice.id, {
        extracted_data: data,
        status: status
      });
      toast.success(status === "confirmed" ? "發票已確認" : "變更已儲存");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error updating invoice:", error);
      toast.error("更新失敗");
    }
  };

  const isPdf = invoice?.filename.toLowerCase().endsWith('.pdf');

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>發票內容確認</DialogTitle>
          <DialogDescription>
            請確認 AI 提取的資訊是否正確。您可以在此進行修改。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          {/* Preview Section */}
          <div className="border rounded-lg bg-muted flex items-center justify-center min-h-[300px] overflow-hidden">
            {previewUrl ? (
              isPdf ? (
                <iframe src={previewUrl} className="w-full h-full min-h-[400px]" title="Invoice Preview" />
              ) : (
                <Image 
                  src={previewUrl} 
                  alt="Invoice Preview" 
                  width={0}
                  height={0}
                  sizes="100vw"
                  className="w-auto h-auto max-w-full max-h-full object-contain" 
                  unoptimized
                />
              )
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>載入預覽中...</p>
              </div>
            )}
          </div>

          {/* Form Section */}
          <Form {...form}>
            <form className="space-y-4">
              <FormField
                control={form.control}
                name="invoice_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>發票號碼</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="例如: AB-12345678" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoice_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>發票日期</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>銷售額</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="number" 
                          onChange={e => field.onChange(parseFloat(e.target.value))} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tax_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>稅額</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="number" 
                          onChange={e => field.onChange(parseFloat(e.target.value))} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="total_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>總計</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        onChange={e => field.onChange(parseFloat(e.target.value))} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vendor_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>供應商名稱</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vendor_tax_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>供應商統編</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={form.handleSubmit(data => handleSave(data, "processed"))}
            disabled={form.formState.isSubmitting}
            className="flex-1"
          >
            <Save className="mr-2 h-4 w-4" /> 僅儲存
          </Button>
          <Button
            onClick={form.handleSubmit(data => handleSave(data, "confirmed"))}
            disabled={form.formState.isSubmitting}
            className="flex-1"
          >
            {form.formState.isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            確認並儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

