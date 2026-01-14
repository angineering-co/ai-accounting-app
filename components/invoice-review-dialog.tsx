"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Save } from "lucide-react";
import {
  extractedInvoiceDataSchema,
  type ExtractedInvoiceData,
  type Invoice,
} from "@/lib/domain/models";
import { updateInvoice } from "@/lib/services/invoice";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectValue,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  onSuccess,
}: InvoiceReviewDialogProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [excelData, setExcelData] = useState<{
    headers: string[];
    rows: unknown[][];
  } | null>(null);
  const supabase = createClient();

  const form = useForm<ExtractedInvoiceData>({
    resolver: zodResolver(extractedInvoiceDataSchema),
    defaultValues: {
      invoiceSerialCode: "",
      date: "",
      totalSales: 0,
      tax: 0,
      totalAmount: 0,
      sellerName: "",
      sellerTaxId: "",
      buyerName: "",
      buyerTaxId: "",
      summary: "",
      deductible: false,
      account: "",
      taxType: "應稅",
      invoiceType: "手開三聯式",
      inOrOut: "進項",
    },
  });

  useEffect(() => {
    if (invoice && isOpen) {
      // Use the extracted_data directly, ensuring all fields are properly mapped
      const extractedData = invoice.extracted_data || {};
      form.reset({
        invoiceSerialCode: extractedData.invoiceSerialCode || "",
        date: extractedData.date || "",
        totalSales: extractedData.totalSales ?? 0,
        tax: extractedData.tax ?? 0,
        totalAmount: extractedData.totalAmount ?? 0,
        sellerName: extractedData.sellerName || "",
        sellerTaxId: extractedData.sellerTaxId || "",
        buyerName: extractedData.buyerName || "",
        buyerTaxId: extractedData.buyerTaxId || "",
        summary: extractedData.summary || "",
        deductible: extractedData.deductible || false,
        account: extractedData.account || "",
        taxType: extractedData.taxType || "應稅",
        invoiceType: extractedData.invoiceType || "手開三聯式",
        inOrOut:
          extractedData.inOrOut ||
          (invoice.in_or_out === "in" ? "進項" : "銷項"),
        ...extractedData, // Include any additional fields
      });

      // Get signed URL or text content for preview
      const getPreview = async () => {
        const extracted = invoice.extracted_data as ExtractedInvoiceData & {
          source?: string;
        };
        const isTxtImport = extracted?.source === "import-txt";
        const isExcelImport = extracted?.source === "import-excel";
        const bucket =
          isTxtImport || isExcelImport ? "electronic-invoices" : "invoices";

        // Reset states
        setExcelData(null);

        if (isTxtImport) {
          try {
            const { data, error } = await supabase.storage
              .from(bucket)
              .download(invoice.storage_path);

            if (error) throw error;

            if (data) {
              const buffer = await data.arrayBuffer();

              // Try Big5 first as it's common for these files
              const text = new TextDecoder("big5").decode(buffer);

              setPreviewText(text);
              setPreviewUrl(null);
            }
          } catch (e) {
            console.error("Error downloading text file:", e);
            toast.error("無法載入檔案預覽");
            setPreviewText(null);
          }
        } else if (isExcelImport) {
          try {
            const { data, error } = await supabase.storage
              .from(bucket)
              .download(invoice.storage_path);

            if (error) throw error;

            if (data) {
              const buffer = await data.arrayBuffer();

              // Dynamically import xlsx to keep bundle size small
              const XLSX = await import("xlsx");

              const workbook = XLSX.read(buffer, { type: "array" });
              // Default to the first sheet
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];

              // Parse as array of arrays (header: 1)
              const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
              }) as unknown[][];

              if (jsonData && jsonData.length > 0) {
                const headers = jsonData[0] as string[];
                const rows = jsonData.slice(1);
                setExcelData({ headers, rows });
                setPreviewText(null);
                setPreviewUrl(null);
              } else {
                setPreviewText("Excel 檔案為空");
              }
            }
          } catch (e) {
            console.error("Error previewing excel:", e);
            setPreviewText("無法預覽 Excel 檔案");
          }
        } else {
          setPreviewText(null);
          const { data } = await supabase.storage
            .from(bucket)
            .createSignedUrl(invoice.storage_path, 3600);

          if (data) setPreviewUrl(data.signedUrl);
        }
      };
      getPreview();
    } else {
      setPreviewUrl(null);
      setPreviewText(null);
      setExcelData(null);
    }
  }, [invoice, isOpen, form, supabase.storage]);

  const handleSave = async (
    data: ExtractedInvoiceData,
    status: Invoice["status"] = "processed"
  ) => {
    if (!invoice) return;

    try {
      await updateInvoice(invoice.id, {
        extracted_data: data,
        status: status,
      });
      toast.success(status === "confirmed" ? "發票已確認" : "變更已儲存");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error updating invoice:", error);
      toast.error("更新失敗");
    }
  };

  const isPdf = invoice?.filename.toLowerCase().endsWith(".pdf");
  const invoiceCode = invoice?.extracted_data?.invoiceSerialCode;

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
          <div className="border rounded-lg bg-muted flex items-center justify-center min-h-[300px] overflow-hidden relative">
            {previewText ? (
              <div className="w-full h-full max-h-[600px] overflow-auto p-4 bg-white text-xs font-mono whitespace-pre text-left">
                {previewText.split("\n").map((line, i) => {
                  // Highlight line if it contains the invoice number
                  const isMatch = invoiceCode && line.includes(invoiceCode);
                  return (
                    <div
                      key={i}
                      className={`${
                        isMatch
                          ? "bg-yellow-100 font-bold text-black"
                          : "text-gray-600"
                      }`}
                    >
                      {line}
                    </div>
                  );
                })}
              </div>
            ) : excelData ? (
              <div className="w-full h-full max-h-[600px] overflow-auto bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {excelData.headers.map((header, i) => (
                        <TableHead
                          key={i}
                          className="whitespace-nowrap px-4 py-2 h-auto"
                        >
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {excelData.rows.map((row, i) => {
                      const isMatch =
                        invoiceCode &&
                        row.some((cell) => String(cell).includes(invoiceCode));

                      return (
                        <TableRow
                          key={i}
                          className={
                            isMatch ? "bg-yellow-100 hover:bg-yellow-200" : ""
                          }
                        >
                          {row.map((cell: unknown, cellIndex: number) => (
                            <TableCell
                              key={cellIndex}
                              className="whitespace-nowrap px-4 py-2"
                            >
                              {String(cell ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : previewUrl ? (
              isPdf ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full min-h-[400px]"
                  title="Invoice Preview"
                />
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
                name="invoiceSerialCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>發票字軌號碼</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="例如: AB12345678" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>發票日期</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="YYYY/MM/DD" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="totalSales"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>銷售額</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? parseFloat(e.target.value)
                                : undefined
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>稅額</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? parseFloat(e.target.value)
                                : undefined
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="totalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>總計</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value
                              ? parseFloat(e.target.value)
                              : undefined
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="sellerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>賣方名稱</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sellerTaxId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>賣方統編</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="buyerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>買方名稱</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="buyerTaxId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>買方統編</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>摘要</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="簡要描述" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="account"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>會計科目</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="例如: 5102 旅費" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>課稅別</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="選擇課稅別" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="應稅">應稅</SelectItem>
                            <SelectItem value="零稅率">零稅率</SelectItem>
                            <SelectItem value="免稅">免稅</SelectItem>
                            <SelectItem value="作廢">作廢</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="invoiceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>發票類型</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="選擇發票類型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="手開二聯式">
                              手開二聯式
                            </SelectItem>
                            <SelectItem value="手開三聯式">
                              手開三聯式
                            </SelectItem>
                            <SelectItem value="電子發票">電子發票</SelectItem>
                            <SelectItem value="二聯式收銀機">
                              二聯式收銀機
                            </SelectItem>
                            <SelectItem value="三聯式收銀機">
                              三聯式收銀機
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deductible"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>可扣抵</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value ? "true" : "false"}
                          onValueChange={(value) =>
                            field.onChange(value === "true")
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="選擇可扣抵" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">是</SelectItem>
                            <SelectItem value="false">否</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={form.handleSubmit((data) => handleSave(data, "processed"))}
            disabled={form.formState.isSubmitting}
            className="flex-1"
          >
            <Save className="mr-2 h-4 w-4" /> 僅儲存
          </Button>
          <Button
            onClick={form.handleSubmit((data) => handleSave(data, "confirmed"))}
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
