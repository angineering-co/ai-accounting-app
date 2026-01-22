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
import {
  Loader2,
  CheckCircle,
  Save,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Hand,
  AlertCircle,
} from "lucide-react";
import {
  extractedInvoiceDataSchema,
  type ExtractedInvoiceData,
  type Invoice,
} from "@/lib/domain/models";
import { ACCOUNT_LIST } from "@/lib/data/accounts";
import { RocPeriod } from "@/lib/domain/roc-period";
import { updateInvoice } from "@/lib/services/invoice";
import { toast } from "sonner";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { cn } from "@/lib/utils";
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
  onNext?: () => void;
  onPrevious?: () => void;
}

export function InvoiceReviewDialog({
  invoice,
  isOpen,
  onOpenChange,
  onSuccess,
  onNext,
  onPrevious,
}: InvoiceReviewDialogProps) {
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanMode, setIsPanMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
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

  const totalSales = form.watch("totalSales");
  const tax = form.watch("tax");
  const totalAmount = form.watch("totalAmount");
  const invoiceSerialCode = form.watch("invoiceSerialCode");
  const sellerTaxId = form.watch("sellerTaxId");
  const buyerTaxId = form.watch("buyerTaxId");
  const account = form.watch("account");

  const isMathError = useMemo(() => {
    const s = Number(totalSales) || 0;
    const t = Number(tax) || 0;
    const a = Number(totalAmount) || 0;
    // Don't show error if all are zero
    if (s === 0 && t === 0 && a === 0) return false;
    return Math.abs(s + t - a) > 0.01;
  }, [totalSales, tax, totalAmount]);

  const dateValue = form.watch("date");

  const isPeriodMismatch = useMemo(() => {
    if (!invoice?.year_month || !dateValue) return false;
    try {
      const invoicePeriod = RocPeriod.fromYYYMM(invoice.year_month);
      // Support YYYY/MM/DD or YYYY-MM-DD
      const dateObj = new Date(dateValue.replace(/\//g, "-"));
      if (isNaN(dateObj.getTime())) return false;

      const datePeriod = RocPeriod.fromDate(dateObj);
      return !invoicePeriod.equals(datePeriod);
    } catch {
      return false;
    }
  }, [invoice?.year_month, dateValue]);

  const isConfirmDisabled = useMemo(() => {
    return (
      !invoiceSerialCode ||
      !dateValue ||
      !totalSales ||
      !sellerTaxId ||
      !buyerTaxId ||
      !account ||
      isMathError ||
      isPeriodMismatch
    );
  }, [
    invoiceSerialCode,
    dateValue,
    totalSales,
    sellerTaxId,
    buyerTaxId,
    account,
    isMathError,
    isPeriodMismatch,
  ]);

  const getConfidenceStyle = (fieldName: string) => {
    const confidence = form.getValues("confidence");
    if (!confidence) return "";
    const level = confidence[fieldName];
    if (level === "low") return "border-red-500 bg-red-50";
    if (level === "medium") return "border-yellow-500 bg-yellow-50";
    return "";
  };

  const clearConfidence = (fieldName: string) => {
    const currentConfidence = form.getValues("confidence");
    if (
      currentConfidence &&
      currentConfidence[fieldName] &&
      currentConfidence[fieldName] !== "high"
    ) {
      form.setValue(`confidence.${fieldName}`, "high", {
        shouldValidate: true,
      });
    }
  };

  useEffect(() => {
    if (invoice && isOpen) {
      setRotation(0);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsPanMode(false);
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

  const handleSave = useCallback(
    async (
      data: ExtractedInvoiceData,
      status: Invoice["status"] = "processed",
      shouldClose: boolean = true
    ) => {
      if (!invoice) return;

      try {
        // Clear confidence data as the user has reviewed/edited it
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { confidence, ...dataToSave } = data;

        await updateInvoice(invoice.id, {
          extracted_data: dataToSave,
          status: status,
        });
        toast.success(status === "confirmed" ? "發票已確認" : "變更已儲存");

        if (shouldClose) {
          onOpenChange(false);
        }

        onSuccess?.();
      } catch (error) {
        console.error("Error updating invoice:", error);
        toast.error("更新失敗");
      }
    },
    [invoice, onOpenChange, onSuccess]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if modifier keys (except Shift) are pressed
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.matches("input, textarea, select") ||
        target.closest('[role="combobox"]');

      // Shift + Enter to confirm
      if (e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        // Save and keep open (pass false for shouldClose)
        form.handleSubmit((data) => handleSave(data, "confirmed", false))();
        return;
      }

      if (isInput) return;

      switch (e.key) {
        case "+":
        case "=": // Also handle = key which is often same key as +
          if (!previewText && !excelData) {
            e.preventDefault();
            setZoom((prev) => Math.min(prev + 0.1, 3));
          }
          break;
        case "-":
        case "_":
          if (!previewText && !excelData) {
            e.preventDefault();
            setZoom((prev) => Math.max(prev - 0.1, 0.5));
          }
          break;
        case "ArrowLeft":
          if (!previewText && !excelData) {
            e.preventDefault();
            setRotation((prev) => prev - 90);
          }
          break;
        case "ArrowRight":
          if (!previewText && !excelData) {
            e.preventDefault();
            setRotation((prev) => prev + 90);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          onPrevious?.();
          break;
        case "ArrowDown":
          e.preventDefault();
          onNext?.();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, previewText, excelData, onNext, onPrevious, form, handleSave]);

  const isPdf = invoice?.filename.toLowerCase().endsWith(".pdf");
  const invoiceCode = invoice?.extracted_data?.invoiceSerialCode;

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((isPanMode || !isPdf) && previewUrl && !excelData) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>發票內容確認</DialogTitle>
          <DialogDescription>
            請確認 AI 提取的資訊是否正確。您可以在此進行修改。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          {/* Preview Section */}
          <div
            className={`border rounded-lg bg-muted flex items-center justify-center min-h-[300px] overflow-hidden relative group ${
              (isPanMode || !isPdf) && previewUrl && !excelData
                ? isDragging
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : ""
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Image Controls Overlay */}
            {!previewText && !excelData && previewUrl && (
              <div className="absolute top-2 right-2 flex gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 p-1 rounded-lg backdrop-blur-sm">
                <Button
                  type="button"
                  variant={isPanMode ? "secondary" : "ghost"}
                  size="icon"
                  className={`h-8 w-8 ${
                    isPanMode
                      ? "bg-white text-black hover:bg-white/90"
                      : "text-white hover:text-white hover:bg-white/20"
                  }`}
                  onClick={() => setIsPanMode(!isPanMode)}
                  title={isPanMode ? "關閉拖曳模式" : "開啟拖曳模式"}
                >
                  <Hand className="h-4 w-4" />
                </Button>
                <div className="w-px h-4 bg-white/20 my-auto mx-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                  onClick={() => setZoom((z) => Math.min(z + 0.1, 3))}
                  title="放大 (+)"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                  onClick={() => setZoom((z) => Math.max(z - 0.1, 0.5))}
                  title="縮小 (-)"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                  onClick={() => setRotation((r) => r + 90)}
                  title="旋轉 (Right Arrow)"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
            )}

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
              <div
                className="w-full h-full flex items-center justify-center transition-transform duration-75 ease-linear"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
              >
                {isPdf ? (
                  <div className="relative w-full h-full min-h-[400px]">
                    <iframe
                      src={previewUrl}
                      className="w-full h-full transition-transform duration-200 ease-in-out origin-center bg-white"
                      style={{
                        transform: `rotate(${rotation}deg) scale(${zoom})`,
                      }}
                      title="Invoice Preview"
                    />
                    {/* Overlay for dragging PDF */}
                    {isPanMode && (
                      <div className="absolute inset-0 z-10 bg-transparent" />
                    )}
                  </div>
                ) : (
                  <Image
                    src={previewUrl}
                    alt="Invoice Preview"
                    width={0}
                    height={0}
                    sizes="100vw"
                    className="w-auto h-auto max-w-full max-h-full object-contain transition-transform duration-200 ease-in-out origin-center"
                    style={{
                      transform: `rotate(${rotation}deg) scale(${zoom})`,
                    }}
                    unoptimized
                  />
                )}
              </div>
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
                      <Input
                        {...field}
                        placeholder="例如: AB12345678"
                        className={getConfidenceStyle("invoiceSerialCode")}
                        onChange={(e) => {
                          field.onChange(e);
                          clearConfidence("invoiceSerialCode");
                        }}
                      />
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
                      <Input
                        {...field}
                        placeholder="YYYY/MM/DD"
                        className={cn(
                          getConfidenceStyle("date"),
                          isPeriodMismatch && "ring-2 ring-orange-400 ring-offset-1"
                        )}
                        onChange={(e) => {
                          field.onChange(e);
                          clearConfidence("date");
                        }}
                      />
                    </FormControl>
                    {isPeriodMismatch && invoice?.year_month && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-orange-600 bg-orange-50 p-2 rounded border border-orange-200">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>
                          日期與期別不符 (期別:{" "}
                          {RocPeriod.fromYYYMM(invoice.year_month).format()})
                        </span>
                      </div>
                    )}
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
                          className={cn(
                            getConfidenceStyle("totalSales"),
                            isMathError && "ring-2 ring-orange-400 ring-offset-1"
                          )}
                          onChange={(e) => {
                            field.onChange(
                              e.target.value
                                ? parseFloat(e.target.value)
                                : undefined
                            );
                            clearConfidence("totalSales");
                          }}
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
                          className={cn(
                            getConfidenceStyle("tax"),
                            isMathError && "ring-2 ring-orange-400 ring-offset-1"
                          )}
                          onChange={(e) => {
                            field.onChange(
                              e.target.value
                                ? parseFloat(e.target.value)
                                : undefined
                            );
                            clearConfidence("tax");
                          }}
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
                        className={cn(
                          getConfidenceStyle("totalAmount"),
                          isMathError && "ring-2 ring-orange-400 ring-offset-1"
                        )}
                        onChange={(e) => {
                          field.onChange(
                            e.target.value
                              ? parseFloat(e.target.value)
                              : undefined
                          );
                          clearConfidence("totalAmount");
                        }}
                      />
                    </FormControl>
                    {isMathError && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-orange-600 bg-orange-50 p-2 rounded border border-orange-200">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>
                          銷售額 ({totalSales || 0}) + 稅額 ({tax || 0}) ≠ 總計 (
                          {totalAmount || 0})
                        </span>
                      </div>
                    )}
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
                        <Input
                          {...field}
                          className={getConfidenceStyle("sellerName")}
                          onChange={(e) => {
                            field.onChange(e);
                            clearConfidence("sellerName");
                          }}
                        />
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
                        <Input
                          {...field}
                          className={getConfidenceStyle("sellerTaxId")}
                          onChange={(e) => {
                            field.onChange(e);
                            clearConfidence("sellerTaxId");
                          }}
                        />
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
                        <Input
                          {...field}
                          className={getConfidenceStyle("buyerName")}
                          onChange={(e) => {
                            field.onChange(e);
                            clearConfidence("buyerName");
                          }}
                        />
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
                        <Input
                          {...field}
                          className={getConfidenceStyle("buyerTaxId")}
                          onChange={(e) => {
                            field.onChange(e);
                            clearConfidence("buyerTaxId");
                          }}
                        />
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
                      <Input
                        {...field}
                        placeholder="簡要描述"
                        className={getConfidenceStyle("summary")}
                        onChange={(e) => {
                          field.onChange(e);
                          clearConfidence("summary");
                        }}
                      />
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
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            clearConfidence("account");
                          }}
                        >
                          <SelectTrigger
                            className={getConfidenceStyle("account")}
                          >
                            <SelectValue placeholder="選擇會計科目" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {ACCOUNT_LIST.map((account) => (
                              <SelectItem key={account} value={account}>
                                {account}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                          onValueChange={(value) => {
                            field.onChange(value);
                            clearConfidence("taxType");
                          }}
                        >
                          <SelectTrigger
                            className={getConfidenceStyle("taxType")}
                          >
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
                          onValueChange={(value) => {
                            field.onChange(value);
                            clearConfidence("invoiceType");
                          }}
                        >
                          <SelectTrigger
                            className={getConfidenceStyle("invoiceType")}
                          >
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
                          onValueChange={(value) => {
                            field.onChange(value === "true");
                            clearConfidence("deductible");
                          }}
                        >
                          <SelectTrigger
                            className={getConfidenceStyle("deductible")}
                          >
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
            disabled={form.formState.isSubmitting || isConfirmDisabled}
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
