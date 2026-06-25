"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Info } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  OPENING_ENTRY_DESCRIPTION,
  VOUCHER_TYPE,
  type VoucherType,
} from "@/lib/domain/journal-entry";
import { createManualEntryAction } from "@/lib/services/voucher";

// The five buckets the opening trial balance is read from — 資產/負債/權益 off the
// 資產負債表, 收入/成本費用 off the 損益表. In 期初開帳 mode the lines render
// grouped this way (live, by the chosen account's leading digit).
const BUCKETS = [
  { key: "asset", label: "資產", test: (c: string) => c[0] === "1" },
  { key: "liability", label: "負債", test: (c: string) => c[0] === "2" },
  { key: "equity", label: "權益", test: (c: string) => c[0] === "3" },
  { key: "revenue", label: "收入", test: (c: string) => c[0] === "4" || c[0] === "7" },
  {
    key: "expense",
    label: "成本費用",
    test: (c: string) => ["5", "6", "8", "9"].includes(c[0]),
  },
] as const;

function bucketOf(code: string): string | null {
  if (!code) return null;
  return BUCKETS.find((b) => b.test(code))?.key ?? null;
}

// 3440 本期損益 is synthesised by the balance sheet from the P&L accounts and any
// stored 3440 balance is dropped (financial-statements.ts) — so never let a manual
// entry write it. Prior-years retained earnings go to 3432 累積盈虧 instead.
const ACCOUNT_OPTIONS = ACCOUNT_LIST.map((s) => {
  const code = s.split(" ")[0];
  return { code, label: s };
}).filter((o) => o.code !== "3440");

type LineField = {
  account_code: string;
  debit: number;
  credit: number;
  description: string;
};

type FormValues = {
  voucher_type: VoucherType;
  entry_date: string;
  description: string;
  lines: LineField[];
};

function emptyLine(): LineField {
  return { account_code: "", debit: 0, credit: 0, description: "" };
}

interface ManualVoucherFormProps {
  firmId: string;
  clientId: string;
}

export function ManualVoucherForm({ firmId, clientId }: ManualVoucherFormProps) {
  const router = useRouter();

  // 期初開帳 is just a preset on the one form: it pins 傳票類型=轉帳, locks the
  // 摘要 to the marker text (read-only, so a human reviewer can spot the opening
  // entry in the list), switches the lines to the grouped view, and shows the
  // opening guidance. Submission is the same createManualEntry path either way.
  const [opening, setOpening] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      voucher_type: "轉帳",
      entry_date: format(new Date(), "yyyy-MM-dd"),
      description: "",
      lines: [emptyLine(), emptyLine()],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const toggleOpening = (next: boolean) => {
    setOpening(next);
    if (next) {
      form.setValue("voucher_type", "轉帳");
      form.setValue("description", OPENING_ENTRY_DESCRIPTION);
    } else {
      form.setValue("description", "");
    }
  };

  const watchedLines = form.watch("lines");
  const { debitTotal, creditTotal } = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const l of watchedLines) {
      d += Number(l.debit) || 0;
      c += Number(l.credit) || 0;
    }
    return { debitTotal: d, creditTotal: c };
  }, [watchedLines]);
  const diff = debitTotal - creditTotal;
  const isBalanced = diff === 0 && debitTotal > 0;

  const entryDateAsDate = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.watch("entry_date"));
    if (!m) return undefined;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  })();

  const onSubmit = async (values: FormValues) => {
    // Drop fully-empty rows, then validate what's left. The server re-validates
    // (parse + XOR + balance + min 2), so this is just for friendly inline errors.
    const lines = values.lines
      .filter(
        (l) =>
          l.account_code &&
          ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0),
      )
      .map((l) => ({
        account_code: l.account_code,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description ? l.description : null,
      }));

    if (lines.length < 2) {
      toast.error("至少需要兩筆有金額的分錄");
      return;
    }
    if (lines.some((l) => (l.debit > 0) === (l.credit > 0))) {
      toast.error("每一列只能填借方或貸方其中一邊");
      return;
    }
    if (!isBalanced) {
      toast.error(`借貸不平衡，差額 ${formatNTD(Math.abs(diff))}`);
      return;
    }

    try {
      const { entryId } = await createManualEntryAction(clientId, {
        voucher_type: values.voucher_type,
        entry_date: values.entry_date,
        description: values.description ? values.description : null,
        lines,
      });
      toast.success(opening ? "期初開帳草稿已建立" : "傳票草稿已建立");
      router.push(`/firm/${firmId}/client/${clientId}/voucher/${entryId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "建立失敗");
    }
  };

  const renderLineRow = (idx: number) => (
    <TableRow key={fields[idx].id}>
      <TableCell>
        <Select
          value={watchedLines[idx]?.account_code ?? ""}
          onValueChange={(v) => form.setValue(`lines.${idx}.account_code`, v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="選擇科目" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {ACCOUNT_OPTIONS.map((opt) => (
              <SelectItem key={opt.code} value={opt.code}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          inputMode="numeric"
          className="text-right font-mono"
          value={watchedLines[idx]?.debit === 0 ? "" : watchedLines[idx]?.debit}
          onChange={(e) =>
            form.setValue(
              `lines.${idx}.debit`,
              e.target.value === "" ? 0 : Number(e.target.value),
            )
          }
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          inputMode="numeric"
          className="text-right font-mono"
          value={watchedLines[idx]?.credit === 0 ? "" : watchedLines[idx]?.credit}
          onChange={(e) =>
            form.setValue(
              `lines.${idx}.credit`,
              e.target.value === "" ? 0 : Number(e.target.value),
            )
          }
        />
      </TableCell>
      <TableCell>
        <Input
          placeholder="（選填）"
          value={watchedLines[idx]?.description ?? ""}
          onChange={(e) => form.setValue(`lines.${idx}.description`, e.target.value)}
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
  );

  const lineHeader = (
    <TableHeader>
      <TableRow>
        <TableHead>科目</TableHead>
        <TableHead className="w-36 text-right">借方</TableHead>
        <TableHead className="w-36 text-right">貸方</TableHead>
        <TableHead>備註</TableHead>
        <TableHead className="w-12" />
      </TableRow>
    </TableHeader>
  );

  // Grouped (opening) view: bucket every row live by the chosen account's class.
  // Rows without an account yet collect in a trailing 未選擇科目 section so they
  // stay editable until a code is picked, then jump to their category.
  const groupedRender = () => {
    const byBucket = new Map<string, number[]>();
    for (const b of BUCKETS) byBucket.set(b.key, []);
    const unassigned: number[] = [];
    watchedLines.forEach((l, idx) => {
      const k = bucketOf(l.account_code);
      if (k) byBucket.get(k)!.push(idx);
      else unassigned.push(idx);
    });

    return (
      <div className="space-y-6">
        {BUCKETS.map((b) => {
          const idxs = byBucket.get(b.key)!;
          let d = 0;
          let c = 0;
          for (const i of idxs) {
            d += Number(watchedLines[i]?.debit) || 0;
            c += Number(watchedLines[i]?.credit) || 0;
          }
          return (
            <div key={b.key}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-base font-medium">{b.label}</span>
                <span className="text-sm font-mono text-muted-foreground">
                  {formatNTD(d)} / {formatNTD(c)}
                </span>
              </div>
              <div className="rounded-md border">
                <Table>
                  {lineHeader}
                  <TableBody>
                    {idxs.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-sm text-muted-foreground py-3"
                        >
                          尚無分錄
                        </TableCell>
                      </TableRow>
                    ) : (
                      idxs.map((idx) => renderLineRow(idx))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}

        {unassigned.length > 0 && (
          <div>
            <div className="text-base font-medium mb-2 text-muted-foreground">
              尚未選擇科目
            </div>
            <div className="rounded-md border">
              <Table>
                {lineHeader}
                <TableBody>{unassigned.map((idx) => renderLineRow(idx))}</TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">傳票資訊</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-base cursor-pointer">
            <Checkbox
              checked={opening}
              onCheckedChange={(v) => toggleOpening(v === true)}
            />
            此為期初開帳（鎖定摘要為「{OPENING_ENTRY_DESCRIPTION}」、依科目分類輸入）
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <Label>傳票類型</Label>
              <Select
                value={form.watch("voucher_type")}
                onValueChange={(v) =>
                  form.setValue("voucher_type", v as VoucherType)
                }
                disabled={opening}
              >
                <SelectTrigger>
                  <SelectValue placeholder="請選擇" />
                </SelectTrigger>
                <SelectContent>
                  {VOUCHER_TYPE.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label>{opening ? "開帳日" : "記帳日期"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !form.watch("entry_date") && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch("entry_date") || "請選日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={entryDateAsDate}
                    onSelect={(d) => {
                      if (!d) return;
                      form.setValue("entry_date", format(d, "yyyy-MM-dd"));
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1">
              <Label>摘要</Label>
              <Input
                placeholder="（選填）"
                value={form.watch("description")}
                onChange={(e) => form.setValue("description", e.target.value)}
                readOnly={opening}
                className={cn(opening && "bg-muted text-muted-foreground")}
              />
            </div>
          </div>

          {opening && (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 flex gap-2 items-start">
              <Info className="size-5 shrink-0 mt-0.5" />
              <ul className="list-disc pl-5 space-y-0.5">
                <li>依客戶的資產負債表與損益表逐項輸入期初餘額。</li>
                <li>期中開帳：請一併輸入損益科目（收入、成本費用）的本年度累計數。</li>
                <li>期初保留盈餘記入 3432 累積盈虧；3440 本期損益 由報表自動計算（已從選單移除）。</li>
                <li>累積留抵稅額記入 1145 留抵稅額；開帳日請選在營業稅申報期間起點。</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">分錄</CardTitle>
          <span
            className={cn(
              "text-base",
              isBalanced ? "text-emerald-700" : "text-destructive",
            )}
          >
            {isBalanced ? "✓ 借貸平衡" : `✗ 差額 ${formatNTD(Math.abs(diff))}`}
            <span className="ml-2 font-mono">
              {formatNTD(debitTotal)} / {formatNTD(creditTotal)}
            </span>
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {opening ? (
            groupedRender()
          ) : (
            <div className="rounded-md border">
              <Table>
                {lineHeader}
                <TableBody>{fields.map((_, idx) => renderLineRow(idx))}</TableBody>
              </Table>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append(emptyLine())}
          >
            <Plus className="size-4 mr-1" />
            新增一行
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          取消
        </Button>
        <Button type="submit" disabled={!isBalanced || form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "建立中…" : "建立草稿"}
        </Button>
      </div>
    </form>
  );
}
