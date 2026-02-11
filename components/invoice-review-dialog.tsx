"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  CalendarIcon,
} from "lucide-react";
import {
  allowanceSchema,
  type ExtractedInvoiceData,
  type Invoice,
  type Allowance,
} from "@/lib/domain/models";
import { ACCOUNTS, ACCOUNT_LIST } from "@/lib/data/accounts";
import { RocPeriod } from "@/lib/domain/roc-period";
import { updateInvoice } from "@/lib/services/invoice";
import { toast } from "sonner";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { cn, formatDateToYYYYMMDD, normalizeDateInput, parseNormalizedDate } from "@/lib/utils";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const invoiceDatePattern = /^\d{4}\/(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])$/;
const taxIdPattern = /^\d{8}$/;
const invoiceSerialPattern = /^[A-Z]{2}\d{8}$/;

const invoiceReviewFormSchema = z
  .object({
    invoiceSerialCode: z
      .string()
      .trim()
      .min(1, "請輸入發票字軌號碼")
      .regex(
        invoiceSerialPattern,
        "發票字軌號碼格式錯誤，請使用 2 碼英文 + 8 碼數字",
      ),
    date: z
      .string()
      .trim()
      .min(1, "請輸入發票日期")
      .regex(invoiceDatePattern, "日期格式錯誤，請使用 YYYY/MM/DD"),
    totalSales: z
      .number({ message: "請輸入銷售額" })
      .int("請輸入非負整數")
      .positive("銷售額需大於 0"),
    tax: z
      .number({ message: "請輸入稅額" })
      .int("請輸入非負整數")
      .nonnegative("請輸入非負整數"),
    totalAmount: z
      .number({ message: "請輸入總計" })
      .int("請輸入非負整數")
      .nonnegative("請輸入非負整數"),
    sellerName: z.string().optional(),
    sellerTaxId: z
      .string()
      .trim()
      .min(1, "請輸入賣方統編")
      .regex(taxIdPattern, "賣方統編需為 8 碼數字"),
    buyerName: z.string().optional(),
    buyerTaxId: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || taxIdPattern.test(value), {
        message: "買方統編需為 8 碼數字",
      }),
    summary: z.string().optional(),
    deductible: z.boolean().optional(),
    account: z.enum(ACCOUNT_LIST, { message: "請選擇會計科目" }),
    taxType: z.enum(["應稅", "零稅率", "免稅", "作廢", "彙加"]).optional(),
    invoiceType: z
      .enum(["手開二聯式", "手開三聯式", "電子發票", "二聯式收銀機", "三聯式收銀機"])
      .optional(),
    inOrOut: z.enum(["進項", "銷項"]).optional(),
    confidence: z.record(z.string(), z.enum(["low", "medium", "high"])).optional(),
    source: z.enum(["import-excel"]).optional(),
  })
  .superRefine((data, ctx) => {
    const buyerName = data.buyerName?.trim() || "";
    const buyerTaxId = data.buyerTaxId?.trim() || "";
    const isConsumer = buyerName === "" || buyerName === "0000000000";

    if (!buyerTaxId && !isConsumer) {
      ctx.addIssue({
        code: "custom",
        path: ["buyerTaxId"],
        message: "買方名稱非空白或 0000000000 時，需填寫買方統編",
      });
    }
  })
  .passthrough();

type InvoiceReviewFormValues = z.infer<typeof invoiceReviewFormSchema>;

interface InvoiceReviewDialogProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  isLocked?: boolean;
}

export function InvoiceReviewDialog({
  invoice,
  isOpen,
  onOpenChange,
  onSuccess,
  onNext,
  onPrevious,
  isLocked = false,
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
  const [linkedAllowances, setLinkedAllowances] = useState<Allowance[]>([]);
  const supabase = createClient();

  const form = useForm<InvoiceReviewFormValues>({
    resolver: zodResolver(invoiceReviewFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
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
      account: undefined as unknown as InvoiceReviewFormValues["account"],
      taxType: "應稅",
      invoiceType: "手開三聯式",
      inOrOut: "進項",
    },
  });

  const totalSales = form.watch("totalSales");
  const tax = form.watch("tax");
  const totalAmount = form.watch("totalAmount");

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
      const dateObj = parseNormalizedDate(dateValue);
      if (!dateObj) return false;
      if (isNaN(dateObj.getTime())) return false;

      const datePeriod = RocPeriod.fromDate(dateObj);
      return !invoicePeriod.equals(datePeriod);
    } catch {
      return false;
    }
  }, [invoice?.year_month, dateValue]);

  const selectedInvoiceDate = useMemo(
    () => parseNormalizedDate(dateValue),
    [dateValue],
  );

  const isConfirmDisabled = useMemo(() => {
    return (
      invoice?.status === "confirmed" || // Already confirmed
      !form.formState.isValid ||
      isMathError ||
      isPeriodMismatch
    );
  }, [
    form.formState.isValid,
    isMathError,
    isPeriodMismatch,
    invoice?.status,
  ]);

  const confirmDisabledReason = useMemo(() => {
    if (isLocked) return "此發票目前已被鎖定，無法修改";
    if (invoice?.status === "confirmed") return "此發票已確認";
    if (typeof form.formState.errors.invoiceSerialCode?.message === "string")
      return form.formState.errors.invoiceSerialCode.message;
    if (typeof form.formState.errors.date?.message === "string")
      return form.formState.errors.date.message;
    if (typeof form.formState.errors.totalSales?.message === "string")
      return form.formState.errors.totalSales.message;
    if (typeof form.formState.errors.sellerTaxId?.message === "string")
      return form.formState.errors.sellerTaxId.message;
    if (typeof form.formState.errors.buyerTaxId?.message === "string")
      return form.formState.errors.buyerTaxId.message;
    if (typeof form.formState.errors.account?.message === "string")
      return form.formState.errors.account.message;
    if (isMathError) return "銷售額 + 稅額 不等於 總計";
    if (isPeriodMismatch) return "日期與期別不符";
    if (!form.formState.isValid) return "請修正欄位錯誤";
    return null;
  }, [
    isLocked,
    invoice?.status,
    form.formState.errors,
    form.formState.isValid,
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

      // Determine initial deductible based on account if available
      let initialDeductible = extractedData.deductible || false;
      if (extractedData.account) {
        const accountCode = extractedData.account.split(" ")[0];
        if (ACCOUNTS[accountCode as keyof typeof ACCOUNTS]) {
          initialDeductible =
            ACCOUNTS[accountCode as keyof typeof ACCOUNTS].deductible;
        }
      }

      form.reset({
        invoiceSerialCode: extractedData.invoiceSerialCode || "",
        date: normalizeDateInput(extractedData.date) || "",
        totalSales: extractedData.totalSales ?? 0,
        tax: extractedData.tax ?? 0,
        totalAmount: extractedData.totalAmount ?? 0,
        sellerName: extractedData.sellerName || "",
        sellerTaxId: extractedData.sellerTaxId || "",
        buyerName: extractedData.buyerName || "",
        buyerTaxId: extractedData.buyerTaxId || "",
        summary: extractedData.summary || "",
        deductible: initialDeductible,
        account: extractedData.account || undefined,
        taxType: extractedData.taxType || "應稅",
        invoiceType: extractedData.invoiceType || "手開三聯式",
        inOrOut:
          extractedData.inOrOut ||
          (invoice.in_or_out === "in" ? "進項" : "銷項"),
        ...extractedData, // Include any additional fields
      } as InvoiceReviewFormValues);

      // Get signed URL or text content for preview
      const getPreview = async () => {
        const extracted = invoice.extracted_data as ExtractedInvoiceData & {
          source?: string;
        };
        const isExcelImport = extracted?.source === "import-excel";
        const bucket = isExcelImport ? "electronic-invoices" : "invoices";

        // Reset states
        setExcelData(null);

        if (isExcelImport) {
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

      // Fetch linked allowances
      const fetchLinkedAllowances = async () => {
        const { data } = await supabase
          .from("allowances")
          .select("*")
          .eq("original_invoice_id", invoice.id);
        
        if (data) {
          setLinkedAllowances(allowanceSchema.array().parse(data));
        } else {
          setLinkedAllowances([]);
        }
      };
      fetchLinkedAllowances();
    } else {
      setPreviewUrl(null);
      setPreviewText(null);
      setExcelData(null);
      setLinkedAllowances([]);
    }
  }, [invoice, isOpen, form, supabase.storage, supabase]);

  const handleSave = useCallback(
    async (
      data: InvoiceReviewFormValues,
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
                          field.onChange(
                            e.target.value.toUpperCase().replace(/\s+/g, "")
                          );
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
                    <div className="space-y-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                              getConfidenceStyle("date"),
                              isPeriodMismatch &&
                                "ring-2 ring-orange-400 ring-offset-1"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedInvoiceDate
                              ? formatDateToYYYYMMDD(selectedInvoiceDate)
                              : "選擇發票日期"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={selectedInvoiceDate}
                            defaultMonth={selectedInvoiceDate ?? new Date()}
                            onSelect={(selectedDate) => {
                              if (!selectedDate) return;
                              form.setValue(
                                "date",
                                formatDateToYYYYMMDD(selectedDate),
                                {
                                  shouldValidate: true,
                                  shouldDirty: true,
                                }
                              );
                              form.clearErrors("date");
                              clearConfidence("date");
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="YYYY/MM/DD"
                          className={cn(
                            getConfidenceStyle("date"),
                            isPeriodMismatch &&
                              "ring-2 ring-orange-400 ring-offset-1"
                          )}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            clearConfidence("date");
                          }}
                          onBlur={(e) => {
                            field.onBlur();
                            const normalized = normalizeDateInput(e.target.value);
                            if (!e.target.value.trim()) return;
                            if (!normalized) return;
                            form.setValue("date", normalized, {
                              shouldValidate: true,
                              shouldDirty: true,
                            });
                          }}
                        />
                      </FormControl>
                    </div>
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
                          type="text"
                          inputMode="numeric"
                          value={field.value ?? ""}
                          className={cn(
                            getConfidenceStyle("totalSales"),
                            isMathError && "ring-2 ring-orange-400 ring-offset-1"
                          )}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/[,\s]/g, "");
                            if (!cleaned) {
                              field.onChange(undefined);
                              form.clearErrors("totalSales");
                              clearConfidence("totalSales");
                              return;
                            }
                            if (!/^\d+$/.test(cleaned)) {
                              form.setError("totalSales", {
                                type: "manual",
                                message: "請輸入非負整數",
                              });
                              return;
                            }
                            field.onChange(Number(cleaned));
                            form.clearErrors("totalSales");
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
                          type="text"
                          inputMode="numeric"
                          value={field.value ?? ""}
                          className={cn(
                            getConfidenceStyle("tax"),
                            isMathError && "ring-2 ring-orange-400 ring-offset-1"
                          )}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/[,\s]/g, "");
                            if (!cleaned) {
                              field.onChange(undefined);
                              form.clearErrors("tax");
                              clearConfidence("tax");
                              return;
                            }
                            if (!/^\d+$/.test(cleaned)) {
                              form.setError("tax", {
                                type: "manual",
                                message: "請輸入非負整數",
                              });
                              return;
                            }
                            field.onChange(Number(cleaned));
                            form.clearErrors("tax");
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
                        type="text"
                        inputMode="numeric"
                        value={field.value ?? ""}
                        className={cn(
                          getConfidenceStyle("totalAmount"),
                          isMathError && "ring-2 ring-orange-400 ring-offset-1"
                        )}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[,\s]/g, "");
                          if (!cleaned) {
                            field.onChange(undefined);
                            form.clearErrors("totalAmount");
                            clearConfidence("totalAmount");
                            return;
                          }
                          if (!/^\d+$/.test(cleaned)) {
                            form.setError("totalAmount", {
                              type: "manual",
                              message: "請輸入非負整數",
                            });
                            return;
                          }
                          field.onChange(Number(cleaned));
                          form.clearErrors("totalAmount");
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
                            inputMode="numeric"
                            maxLength={8}
                            className={getConfidenceStyle("sellerTaxId")}
                            onChange={(e) => {
                              field.onChange(
                                e.target.value.replace(/\D/g, "").slice(0, 8)
                              );
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
                            inputMode="numeric"
                            maxLength={8}
                            className={getConfidenceStyle("buyerTaxId")}
                            onChange={(e) => {
                              field.onChange(
                                e.target.value.replace(/\D/g, "").slice(0, 8)
                              );
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

                            // Update deductible based on selected account
                            const accountCode = value.split(" ")[0];
                            if (ACCOUNTS[accountCode as keyof typeof ACCOUNTS]) {
                              form.setValue(
                                "deductible",
                                ACCOUNTS[accountCode as keyof typeof ACCOUNTS]
                                  .deductible
                              );
                              clearConfidence("deductible");
                            }
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

        {/* Linked Allowances Section */}
        {linkedAllowances.length > 0 && (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                相關折讓單 ({linkedAllowances.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {linkedAllowances.map((allowance) => (
                  <div
                    key={allowance.id}
                    className="flex items-center justify-between text-sm p-2 bg-muted rounded-md"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono">
                        {allowance.allowance_serial_code || "-"}
                      </span>
                      <span className="text-muted-foreground">
                        {allowance.extracted_data?.date || "-"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-red-600 font-medium">
                        -${(allowance.extracted_data?.amount || 0).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {allowance.status === "confirmed" ? "已確認" : "待確認"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex-1">
                  <Button
                    variant="outline"
                    onClick={form.handleSubmit((data) =>
                      handleSave(data, "processed")
                    )}
                    disabled={form.formState.isSubmitting || isLocked}
                    className="w-full"
                  >
                    <Save className="mr-2 h-4 w-4" /> 僅儲存
                  </Button>
                </div>
              </TooltipTrigger>
              {isLocked && (
                <TooltipContent>
                  <p>此發票目前已被鎖定，無法修改</p>
                </TooltipContent>
              )}
            </Tooltip>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex-1">
                  <Button
                    onClick={form.handleSubmit((data) =>
                      handleSave(data, "confirmed")
                    )}
                    disabled={
                      form.formState.isSubmitting ||
                      isConfirmDisabled ||
                      isLocked
                    }
                    className="w-full"
                  >
                    {form.formState.isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    確認並儲存
                  </Button>
                </div>
              </TooltipTrigger>
              {(isConfirmDisabled || isLocked) && confirmDisabledReason && (
                <TooltipContent>
                  <p>{confirmDisabledReason}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
