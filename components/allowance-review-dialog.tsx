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
  AlertTriangle,
  Hand,
  ZoomIn,
  ZoomOut,
  RotateCw,
  CalendarIcon,
} from "lucide-react";
import { type Allowance } from "@/lib/domain/models";
import { updateAllowance } from "@/lib/services/allowance";
import { toast } from "sonner";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  formatDateToYYYYMMDD,
  normalizeDateInput,
  parseNormalizedDate,
} from "@/lib/utils";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import Image from "next/image";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const allowanceDatePattern =
  /^\d{4}\/(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])$/;
const taxIdPattern = /^\d{8}$/;
const invoiceSerialPattern = /^[A-Z]{2}\d{8}$/;

const allowanceReviewFormSchema = z
  .object({
    allowanceType: z.enum(["三聯式折讓", "電子發票折讓", "二聯式折讓"], {
      message: "請選擇折讓類型",
    }),
    originalInvoiceSerialCode: z
      .string()
      .trim()
      .min(1, "請輸入原發票號碼")
      .regex(
        invoiceSerialPattern,
        "原發票號碼格式錯誤，請使用 2 碼英文 + 8 碼數字",
      ),
    amount: z
      .number({ message: "請輸入折讓金額" })
      .int("請輸入非負整數")
      .positive("折讓金額需大於 0"),
    taxAmount: z
      .number({ message: "請輸入折讓稅額" })
      .int("請輸入非負整數")
      .nonnegative("請輸入非負整數"),
    date: z
      .string()
      .trim()
      .min(1, "請輸入折讓日期")
      .regex(allowanceDatePattern, "日期格式錯誤，請使用 YYYY/MM/DD"),
    sellerName: z.string().optional(),
    sellerTaxId: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || taxIdPattern.test(value), {
        message: "賣方統編需為 8 碼數字",
      }),
    buyerName: z.string().optional(),
    buyerTaxId: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || taxIdPattern.test(value), {
        message: "買方統編需為 8 碼數字",
      }),
    summary: z.string().optional(),
    deductionCode: z.enum(["1", "2"]).optional(),
    confidence: z
      .record(z.string(), z.enum(["low", "medium", "high"]))
      .optional(),
    source: z.enum(["scan", "import-excel"]).optional(),
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

type AllowanceReviewFormValues = z.infer<typeof allowanceReviewFormSchema>;

interface AllowanceReviewDialogProps {
  allowance: Allowance | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  isLocked?: boolean;
}

export function AllowanceReviewDialog({
  allowance,
  isOpen,
  onOpenChange,
  onSuccess,
  onNext,
  onPrevious,
  isLocked = false,
}: AllowanceReviewDialogProps) {
  const [excelData, setExcelData] = useState<{
    headers: string[];
    rows: unknown[][];
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanMode, setIsPanMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [previewLoading, setPreviewLoading] = useState(false);
  const supabase = createClient();

  const form = useForm<AllowanceReviewFormValues>({
    resolver: zodResolver(allowanceReviewFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      allowanceType: "電子發票折讓",
      originalInvoiceSerialCode: "",
      amount: 0,
      taxAmount: 0,
      date: "",
      sellerName: "",
      sellerTaxId: "",
      buyerName: "",
      buyerTaxId: "",
      summary: "",
      deductionCode: undefined,
    },
  });

  const source = form.watch("source");
  const isExcelImport = source === "import-excel";

  const dateValue = form.watch("date");
  const selectedAllowanceDate = useMemo(
    () => parseNormalizedDate(dateValue),
    [dateValue],
  );

  const hasUnlinkedWarning = useMemo(() => {
    return (
      allowance?.original_invoice_serial_code && !allowance?.original_invoice_id
    );
  }, [allowance]);

  const isConfirmDisabled = useMemo(() => {
    return allowance?.status === "confirmed" || !form.formState.isValid;
  }, [allowance?.status, form.formState.isValid]);

  const confirmDisabledReason = useMemo(() => {
    if (isLocked) return "此折讓目前已被鎖定，無法修改";
    if (allowance?.status === "confirmed") return "此折讓已確認";
    if (
      typeof form.formState.errors.originalInvoiceSerialCode?.message ===
      "string"
    ) {
      return form.formState.errors.originalInvoiceSerialCode.message;
    }
    if (typeof form.formState.errors.date?.message === "string") {
      return form.formState.errors.date.message;
    }
    if (typeof form.formState.errors.amount?.message === "string") {
      return form.formState.errors.amount.message;
    }
    if (!form.formState.isValid) return "請修正欄位錯誤";
    return null;
  }, [
    isLocked,
    allowance?.status,
    form.formState.errors,
    form.formState.isValid,
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
    if (allowance && isOpen) {
      const extractedData = allowance.extracted_data || {};

      form.reset({
        allowanceType: extractedData.allowanceType || "電子發票折讓",
        originalInvoiceSerialCode:
          extractedData.originalInvoiceSerialCode ||
          allowance.original_invoice_serial_code ||
          "",
        amount: extractedData.amount ?? 0,
        taxAmount: extractedData.taxAmount ?? 0,
        date: normalizeDateInput(extractedData.date) || "",
        sellerName: extractedData.sellerName || "",
        sellerTaxId: extractedData.sellerTaxId || "",
        buyerName: extractedData.buyerName || "",
        buyerTaxId: extractedData.buyerTaxId || "",
        summary: extractedData.summary || "",
        deductionCode: extractedData.deductionCode,
        ...extractedData,
      } as AllowanceReviewFormValues);

      // Load preview based on source
      const loadPreview = async () => {
        const isExcelImport = extractedData.source === "import-excel";
        if (!allowance.storage_path) {
          setExcelData(null);
          setPreviewUrl(null);
          setPreviewText("無文件預覽");
          return;
        }

        setPreviewLoading(true);
        try {
          if (isExcelImport) {
            const { data, error } = await supabase.storage
              .from("electronic-invoices")
              .download(allowance.storage_path);

            if (error) throw error;

            if (data) {
              const buffer = await data.arrayBuffer();
              const XLSX = await import("xlsx");
              const workbook = XLSX.read(buffer, { type: "array" });
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
              }) as unknown[][];

              if (jsonData && jsonData.length > 0) {
                const headers = jsonData[0] as string[];
                const rows = jsonData.slice(1);
                setExcelData({ headers, rows });
                setPreviewUrl(null);
                setPreviewText(null);
              } else {
                setExcelData(null);
                setPreviewText("Excel 檔案為空");
              }
            }
          } else {
            setExcelData(null);
            setPreviewText(null);
            const { data } = await supabase.storage
              .from("invoices")
              .createSignedUrl(allowance.storage_path, 3600);

            if (data) setPreviewUrl(data.signedUrl);
          }
        } catch (e) {
          console.error("Error previewing excel:", e);
          setPreviewText("無法預覽檔案");
        } finally {
          setPreviewLoading(false);
        }
      };
      loadPreview();
    } else {
      setExcelData(null);
      setPreviewUrl(null);
      setPreviewText(null);
    }
  }, [allowance, isOpen, form, supabase]);

  const handleSave = useCallback(
    async (
      data: AllowanceReviewFormValues,
      status: Allowance["status"] = "processed",
      shouldClose: boolean = true,
    ) => {
      if (!allowance) return;

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { confidence, ...dataToSave } = data;

        await updateAllowance(allowance.id, {
          extracted_data: dataToSave,
          status: status,
          original_invoice_serial_code:
            dataToSave.originalInvoiceSerialCode || null,
        });
        toast.success(status === "confirmed" ? "折讓已確認" : "變更已儲存");

        if (shouldClose) {
          onOpenChange(false);
        }

        onSuccess?.();
      } catch (error) {
        console.error("Error updating allowance:", error);
        toast.error("更新失敗");
      }
    },
    [allowance, onOpenChange, onSuccess],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.matches("input, textarea, select") ||
        target.closest('[role="combobox"]');

      // Shift + Enter to confirm
      if (e.shiftKey && e.key === "Enter") {
        e.preventDefault();
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

  const allowanceCode = allowance?.allowance_serial_code;
  const isPdf = allowance?.filename?.toLowerCase().endsWith(".pdf");

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
          <DialogTitle>折讓內容確認</DialogTitle>
          <DialogDescription>
            請確認折讓資訊是否正確。您可以在此進行修改。
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
                  title="旋轉"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
            )}
            {previewLoading ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>載入預覽中...</p>
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
                        allowanceCode &&
                        row.some((cell) =>
                          String(cell).includes(allowanceCode),
                        );

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
                      title="Allowance Preview"
                    />
                    {isPanMode && (
                      <div className="absolute inset-0 z-10 bg-transparent" />
                    )}
                  </div>
                ) : (
                  <Image
                    src={previewUrl}
                    alt="Allowance Preview"
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
              <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center">
                <p>無文件預覽</p>
                {previewText && <p className="text-sm">{previewText}</p>}
              </div>
            )}
          </div>

          {/* Form Section */}
          <Form {...form}>
            <form className="space-y-4">
              {/* Unlinked warning */}
              {hasUnlinkedWarning && (
                <Alert
                  variant="destructive"
                  className="bg-amber-50 border-amber-200"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    找不到原始發票 {allowance?.original_invoice_serial_code}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="allowanceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>折讓類型</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            clearConfidence("allowanceType");
                          }}
                        >
                          <SelectTrigger
                            className={getConfidenceStyle("allowanceType")}
                            disabled={isLocked || isExcelImport}
                          >
                            <SelectValue placeholder="選擇折讓類型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="電子發票折讓">
                              電子發票折讓
                            </SelectItem>
                            <SelectItem value="三聯式折讓">
                              三聯式折讓
                            </SelectItem>
                            <SelectItem value="二聯式折讓">
                              二聯式折讓
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
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>折讓日期</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={isLocked || isExcelImport}
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground",
                                  getConfidenceStyle("date"),
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {selectedAllowanceDate
                                  ? formatDateToYYYYMMDD(selectedAllowanceDate)
                                  : "選擇折讓日期"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={selectedAllowanceDate}
                                defaultMonth={
                                  selectedAllowanceDate ?? new Date()
                                }
                                onSelect={(selectedDate) => {
                                  if (!selectedDate) return;
                                  form.setValue(
                                    "date",
                                    formatDateToYYYYMMDD(selectedDate),
                                    {
                                      shouldValidate: true,
                                      shouldDirty: true,
                                    },
                                  );
                                  form.clearErrors("date");
                                  clearConfidence("date");
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <Input
                            {...field}
                            placeholder="YYYY/MM/DD"
                            className={getConfidenceStyle("date")}
                            disabled={isLocked || isExcelImport}
                            onChange={(e) => {
                              field.onChange(e.target.value);
                              clearConfidence("date");
                            }}
                            onBlur={(e) => {
                              field.onBlur();
                              const normalized = normalizeDateInput(
                                e.target.value,
                              );
                              if (!e.target.value.trim()) return;
                              if (!normalized) return;
                              form.setValue("date", normalized, {
                                shouldValidate: true,
                                shouldDirty: true,
                              });
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="originalInvoiceSerialCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>原發票號碼</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="例如: AB12345678"
                        className={getConfidenceStyle(
                          "originalInvoiceSerialCode",
                        )}
                        disabled={isLocked || isExcelImport}
                        onChange={(e) => {
                          field.onChange(
                            e.target.value.toUpperCase().replace(/\s+/g, ""),
                          );
                          clearConfidence("originalInvoiceSerialCode");
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>折讓金額</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          inputMode="numeric"
                          value={field.value ?? ""}
                          className={cn(getConfidenceStyle("amount"))}
                          disabled={isLocked || isExcelImport}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(
                              /[,\s]/g,
                              "",
                            );
                            if (!cleaned) {
                              field.onChange(undefined);
                              form.clearErrors("amount");
                              clearConfidence("amount");
                              return;
                            }
                            if (!/^\d+$/.test(cleaned)) {
                              form.setError("amount", {
                                type: "manual",
                                message: "請輸入非負整數",
                              });
                              return;
                            }
                            field.onChange(Number(cleaned));
                            form.clearErrors("amount");
                            clearConfidence("amount");
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>折讓稅額</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          inputMode="numeric"
                          value={field.value ?? ""}
                          className={cn(getConfidenceStyle("taxAmount"))}
                          disabled={isLocked || isExcelImport}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(
                              /[,\s]/g,
                              "",
                            );
                            if (!cleaned) {
                              field.onChange(undefined);
                              form.clearErrors("taxAmount");
                              clearConfidence("taxAmount");
                              return;
                            }
                            if (!/^\d+$/.test(cleaned)) {
                              form.setError("taxAmount", {
                                type: "manual",
                                message: "請輸入非負整數",
                              });
                              return;
                            }
                            field.onChange(Number(cleaned));
                            form.clearErrors("taxAmount");
                            clearConfidence("taxAmount");
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
                  name="sellerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>賣方名稱</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className={getConfidenceStyle("sellerName")}
                          disabled={isLocked || isExcelImport}
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
                          disabled={isLocked || isExcelImport}
                          onChange={(e) => {
                            field.onChange(
                              e.target.value.replace(/\D/g, "").slice(0, 8),
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
                          disabled={isLocked || isExcelImport}
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
                          disabled={isLocked || isExcelImport}
                          onChange={(e) => {
                            field.onChange(
                              e.target.value.replace(/\D/g, "").slice(0, 8),
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

              {allowance?.in_or_out === "in" && (
                <FormField
                  control={form.control}
                  name="deductionCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>扣抵類別</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value || ""}
                          onValueChange={(value) => {
                            field.onChange(value || undefined);
                            clearConfidence("deductionCode");
                          }}
                        >
                          <SelectTrigger
                            className={getConfidenceStyle("deductionCode")}
                          >
                            <SelectValue placeholder="選擇扣抵類別" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">進貨費用</SelectItem>
                            <SelectItem value="2">固定資產</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>摘要</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="品項說明"
                        className={getConfidenceStyle("summary")}
                        disabled={isLocked || isExcelImport}
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
            </form>
          </Form>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex-1">
                  <Button
                    variant="outline"
                    onClick={form.handleSubmit((data) =>
                      handleSave(data, "processed"),
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
                  <p>此折讓目前已被鎖定，無法修改</p>
                </TooltipContent>
              )}
            </Tooltip>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex-1">
                  <Button
                    onClick={form.handleSubmit((data) =>
                      handleSave(data, "confirmed"),
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
