"use client";

import { useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatNTD } from "@/lib/utils";

import { ACCOUNT_LIST } from "@/lib/data/accounts";
import {
  VOUCHER_TYPE,
  type JournalEntry,
  type JournalEntryLine,
} from "@/lib/domain/journal-entry";
import { useVoucherDemoStore } from "@/lib/dev/use-voucher-demo-store";

interface VoucherEditDialogProps {
  entry: JournalEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const lineFormSchema = z
  .object({
    account_code: z.string().regex(/^\d{4}$/, "請選擇科目"),
    debit: z.number().int().nonnegative(),
    credit: z.number().int().nonnegative(),
    description: z.string().optional(),
  })
  .refine((l) => (l.debit > 0) !== (l.credit > 0), {
    message: "借方與貸方只能擇一為正",
    path: ["debit"],
  });

function buildEditFormSchema(mode: "draft" | "posted") {
  const reasonSchema =
    mode === "posted"
      ? z.string().trim().min(1, "修改原因必填")
      : z.string().optional();

  return z
    .object({
      voucher_type: z.enum(VOUCHER_TYPE),
      entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式錯誤"),
      description: z.string().optional(),
      lines: z.array(lineFormSchema).min(2, "至少 2 行"),
      reason: reasonSchema,
    })
    .refine(
      (data) => {
        const debit = data.lines.reduce((s, l) => s + (l.debit || 0), 0);
        const credit = data.lines.reduce((s, l) => s + (l.credit || 0), 0);
        return debit === credit && debit > 0;
      },
      { message: "借貸不平衡", path: ["lines"] },
    );
}

type EditFormValues = z.infer<ReturnType<typeof buildEditFormSchema>>;

const ACCOUNT_OPTIONS = ACCOUNT_LIST.map((s) => {
  const code = s.split(" ")[0];
  return { code, label: s };
});

export function VoucherEditDialog({
  entry,
  open,
  onOpenChange,
  onSaved,
}: VoucherEditDialogProps) {
  const store = useVoucherDemoStore();
  const mode: "draft" | "posted" = entry.status === "posted" ? "posted" : "draft";
  const schema = useMemo(() => buildEditFormSchema(mode), [mode]);

  const initialLines: JournalEntryLine[] = useMemo(
    () =>
      [...store.lines.filter((l) => l.journal_entry_id === entry.id)].sort(
        (a, b) => a.line_number - b.line_number,
      ),
    [store.lines, entry.id],
  );

  const form = useForm<EditFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      voucher_type: entry.voucher_type,
      entry_date: entry.entry_date,
      description: entry.description ?? "",
      lines: initialLines.map((l) => ({
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        description: l.description ?? "",
      })),
      reason: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const watchedLines = form.watch("lines");
  const debitTotal = watchedLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const creditTotal = watchedLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = debitTotal === creditTotal && debitTotal > 0;

  // Reset only when the dialog opens or switches entries — avoid clobbering in-progress edits when the store updates while open.
  useEffect(() => {
    if (!open) return;
    form.reset({
      voucher_type: entry.voucher_type,
      entry_date: entry.entry_date,
      description: entry.description ?? "",
      lines: initialLines.map((l) => ({
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        description: l.description ?? "",
      })),
      reason: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry.id]);

  const onSubmit = (values: EditFormValues) => {
    const newLines = values.lines.map((l, i) => ({
      line_number: i + 1,
      account_code: l.account_code,
      debit: l.debit,
      credit: l.credit,
      description: l.description ? l.description : null,
    }));

    if (mode === "draft") {
      store.saveDraftEntry(
        entry.id,
        {
          voucher_type: values.voucher_type,
          entry_date: values.entry_date,
          description: values.description ? values.description : null,
        },
        newLines,
      );
      toast.success("草稿已儲存");
    } else {
      store.editPostedEntry(
        entry.id,
        {
          voucher_type: values.voucher_type,
          entry_date: values.entry_date,
          description: values.description ? values.description : null,
        },
        newLines,
        values.reason ?? "",
        store.userId,
      );
      toast.success("已更新並寫入審計軌跡");
    }
    onOpenChange(false);
    onSaved?.();
  };

  const entryDateAsDate = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.getValues("entry_date"));
    if (!m) return undefined;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "posted" ? "編輯已過帳傳票" : "編輯草稿"}
          </DialogTitle>
          <DialogDescription>
            {mode === "posted" ? (
              <span className="text-base">
                傳票編號 <span className="font-mono font-bold">{entry.voucher_no}</span>
                ；傳票編號與過帳資訊不可改。
              </span>
            ) : (
              <span className="text-base">草稿可自由編輯，過帳前不會佔用傳票編號。</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {mode === "posted" && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-base text-amber-900 flex gap-2 items-start">
            <AlertTriangle className="size-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">已過帳，編輯將寫入審計軌跡</div>
              <div className="text-sm mt-1">
                修改原因將永久記錄，由稽核人員可調閱。
                若年度已關帳則無法編輯——請建立沖銷分錄並於當年度認列「前期損益調整」。
              </div>
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="voucher_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>傳票類型</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="請選擇" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {VOUCHER_TYPE.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="entry_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>記帳日期</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value || "請選日期"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={entryDateAsDate}
                          onSelect={(d) => {
                            if (!d) return;
                            field.onChange(format(d, "yyyy-MM-dd"));
                          }}
                          autoFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>摘要</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="（選填）" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-base font-medium">分錄</div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "text-base",
                      isBalanced ? "text-emerald-700" : "text-destructive",
                    )}
                  >
                    {isBalanced ? "✓ 借貸平衡" : "✗ 借貸不平衡"}
                    <span className="ml-2 font-mono">
                      {formatNTD(debitTotal)} / {formatNTD(creditTotal)}
                    </span>
                  </span>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>科目</TableHead>
                      <TableHead className="w-32 text-right">借方</TableHead>
                      <TableHead className="w-32 text-right">貸方</TableHead>
                      <TableHead>備註</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, idx) => (
                      <TableRow key={field.id}>
                        <TableCell className="text-base text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${idx}.account_code`}
                            render={({ field: af }) => (
                              <FormItem>
                                <Select value={af.value} onValueChange={af.onChange}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="選擇科目" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="max-h-72">
                                    {ACCOUNT_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.code} value={opt.code}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${idx}.debit`}
                            render={({ field: af }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    className="text-right font-mono"
                                    value={af.value === 0 ? "" : af.value}
                                    onChange={(e) =>
                                      af.onChange(
                                        e.target.value === "" ? 0 : Number(e.target.value),
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${idx}.credit`}
                            render={({ field: af }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    className="text-right font-mono"
                                    value={af.value === 0 ? "" : af.value}
                                    onChange={(e) =>
                                      af.onChange(
                                        e.target.value === "" ? 0 : Number(e.target.value),
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${idx}.description`}
                            render={({ field: af }) => (
                              <FormItem>
                                <FormControl>
                                  <Input {...af} placeholder="（選填）" />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(idx)}
                            disabled={fields.length <= 2}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() =>
                  append({
                    account_code: "",
                    debit: 0,
                    credit: 0,
                    description: "",
                  })
                }
              >
                <Plus className="size-4 mr-1" />
                新增一行
              </Button>

              {form.formState.errors.lines?.message && (
                <p className="text-sm text-destructive mt-2">
                  {form.formState.errors.lines.message}
                </p>
              )}
            </div>

            {mode === "posted" && (
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      修改原因 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="例：OCR 將旅費誤判為文具用品費，依實際發票內容修正"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={!isBalanced}>
                {mode === "posted" ? "儲存修改並寫入審計軌跡" : "儲存草稿"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

