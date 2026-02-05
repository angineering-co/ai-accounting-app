"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
} from "lucide-react";
import {
  extractedAllowanceDataSchema,
  type ExtractedAllowanceData,
  type Allowance,
} from "@/lib/domain/models";
import { updateAllowance } from "@/lib/services/allowance";
import { toast } from "sonner";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
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
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const [previewLoading, setPreviewLoading] = useState(false);
  const supabase = createClient();

  const form = useForm<ExtractedAllowanceData>({
    resolver: zodResolver(extractedAllowanceDataSchema),
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

  const amount = form.watch("amount");
  const originalInvoiceSerialCode = form.watch("originalInvoiceSerialCode");
  const dateValue = form.watch("date");

  const hasUnlinkedWarning = useMemo(() => {
    return (
      allowance?.original_invoice_serial_code && !allowance?.original_invoice_id
    );
  }, [allowance]);

  const isConfirmDisabled = useMemo(() => {
    return (
      allowance?.status === "confirmed" ||
      !originalInvoiceSerialCode ||
      !dateValue ||
      !amount
    );
  }, [
    allowance?.status,
    originalInvoiceSerialCode,
    dateValue,
    amount,
  ]);

  const confirmDisabledReason = useMemo(() => {
    if (isLocked) return "此折讓目前已被鎖定，無法修改";
    if (allowance?.status === "confirmed") return "此折讓已確認";
    if (!originalInvoiceSerialCode) return "請輸入原發票號碼";
    if (!dateValue) return "請輸入折讓日期";
    if (!amount) return "請輸入折讓金額";
    return null;
  }, [
    isLocked,
    allowance?.status,
    originalInvoiceSerialCode,
    dateValue,
    amount,
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
        date: extractedData.date || "",
        sellerName: extractedData.sellerName || "",
        sellerTaxId: extractedData.sellerTaxId || "",
        buyerName: extractedData.buyerName || "",
        buyerTaxId: extractedData.buyerTaxId || "",
        summary: extractedData.summary || "",
        deductionCode: extractedData.deductionCode,
        ...extractedData,
      });

      // Load Excel preview if source is import-excel
      const loadPreview = async () => {
        const isExcelImport = extractedData.source === "import-excel";
        if (!isExcelImport || !allowance.storage_path) {
          setExcelData(null);
          return;
        }

        setPreviewLoading(true);
        try {
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
            }
          }
        } catch (e) {
          console.error("Error previewing excel:", e);
        } finally {
          setPreviewLoading(false);
        }
      };
      loadPreview();
    } else {
      setExcelData(null);
    }
  }, [allowance, isOpen, form, supabase.storage]);

  const handleSave = useCallback(
    async (
      data: ExtractedAllowanceData,
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
  }, [isOpen, onNext, onPrevious, form, handleSave]);

  const allowanceCode = allowance?.allowance_serial_code;

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
          <div className="border rounded-lg bg-muted flex items-center justify-center min-h-[300px] overflow-hidden relative">
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
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center">
                <p>此折讓來自電子發票匯入</p>
                <p className="text-sm">無文件預覽</p>
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
                        <Input
                          {...field}
                          placeholder="YYYY/MM/DD"
                          className={getConfidenceStyle("date")}
                          onChange={(e) => {
                            field.onChange(e);
                            clearConfidence("date");
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
                        onChange={(e) => {
                          field.onChange(e);
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
                          type="number"
                          value={field.value ?? ""}
                          className={cn(
                            getConfidenceStyle("amount"),
                          )}
                          onChange={(e) => {
                            field.onChange(
                              e.target.value
                                ? parseFloat(e.target.value)
                                : undefined,
                            );
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
                          type="number"
                          value={field.value ?? ""}
                          className={cn(
                            getConfidenceStyle("taxAmount"),
                          )}
                          onChange={(e) => {
                            field.onChange(
                              e.target.value
                                ? parseFloat(e.target.value)
                                : undefined,
                            );
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
