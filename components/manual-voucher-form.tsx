"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Info } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { VOUCHER_TYPE, type VoucherType } from "@/lib/domain/journal-entry";
import {
  createManualEntryAction,
  createOpeningEntryAction,
} from "@/lib/services/voucher";

// The five buckets the accountant transcribes from the 資產負債表 (資產/負債/權益)
// and 損益表 (收入/成本費用). Grouping mirrors the two source statements so data
// entry follows them top-to-bottom.
const GROUPS = [
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

type GroupKey = (typeof GROUPS)[number]["key"];

const ALL_OPTIONS = ACCOUNT_LIST.map((s) => {
  const code = s.split(" ")[0];
  return { code, label: s };
});

// 3440 本期損益 is synthesised by the balance sheet from the P&L accounts and any
// stored 3440 balance is dropped (financial-statements.ts) — so the opening entry
// must never write it. Prior-years retained earnings go to 3432 累積盈虧 instead.
const RESERVED_OPENING_CODES = new Set(["3440"]);

function optionsForGroup(key: GroupKey) {
  const g = GROUPS.find((x) => x.key === key)!;
  return ALL_OPTIONS.filter(
    (o) => g.test(o.code) && !RESERVED_OPENING_CODES.has(o.code),
  );
}

type LineField = {
  group: GroupKey | "";
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

function emptyLine(group: GroupKey | ""): LineField {
  return { group, account_code: "", debit: 0, credit: 0, description: "" };
}

interface ManualVoucherFormProps {
  firmId: string;
  clientId: string;
  mode: "general" | "opening";
}

export function ManualVoucherForm({
  firmId,
  clientId,
  mode,
}: ManualVoucherFormProps) {
  const router = useRouter();
  const isOpening = mode === "opening";

  const defaultValues: FormValues = useMemo(
    () => ({
      voucher_type: isOpening ? "轉帳" : "轉帳",
      entry_date: format(new Date(), "yyyy-MM-dd"),
      description: "",
      // opening: one blank row per group so the structure is visible; general: two
      // blank rows (the minimum a balanced entry needs).
      lines: isOpening
        ? GROUPS.map((g) => emptyLine(g.key))
        : [emptyLine(""), emptyLine("")],
    }),
    [isOpening],
  );

  const form = useForm<FormValues>({ defaultValues });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

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
    // Drop fully-empty rows (an unfilled section placeholder), then validate what's
    // left. The server re-validates (parse + balance + min 2), so this is just for
    // friendly inline errors.
    const lines = values.lines
      .filter((l) => l.account_code && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0))
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
      const { entryId } = isOpening
        ? await createOpeningEntryAction(clientId, {
            entry_date: values.entry_date,
            lines,
          })
        : await createManualEntryAction(clientId, {
            voucher_type: values.voucher_type,
            entry_date: values.entry_date,
            description: values.description ? values.description : null,
            lines,
          });
      toast.success(isOpening ? "期初開帳草稿已建立" : "傳票草稿已建立");
      router.push(`/firm/${firmId}/client/${clientId}/voucher/${entryId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "建立失敗");
    }
  };

  const renderLineRow = (idx: number, options: { code: string; label: string }[]) => (
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
            {options.map((opt) => (
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
          disabled={!isOpening && fields.length <= 2}
        >
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );

  const indexedFields = fields.map((f, idx) => ({ f, idx }));

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {isOpening && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-base text-sky-900 flex gap-2 items-start">
          <Info className="size-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-medium">依客戶的資產負債表與損益表逐項輸入期初餘額</div>
            <ul className="text-sm list-disc pl-5 space-y-0.5">
              <li>期中開帳：請一併輸入損益科目（收入、成本費用）的本年度累計數。</li>
              <li>期初保留盈餘請記入 3432 累積盈虧；系統保留 3440 本期損益 由報表自動計算。</li>
              <li>累積留抵稅額請記入 1145 留抵稅額。</li>
              <li>開帳日請選在營業稅申報期間起點。</li>
            </ul>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isOpening ? "期初開帳" : "傳票資訊"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {!isOpening && (
              <div className="flex flex-col gap-1">
                <Label>傳票類型</Label>
                <Select
                  value={form.watch("voucher_type")}
                  onValueChange={(v) =>
                    form.setValue("voucher_type", v as VoucherType)
                  }
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
            )}

            <div className="flex flex-col gap-1">
              <Label>{isOpening ? "開帳日" : "記帳日期"}</Label>
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

            {!isOpening && (
              <div className="flex flex-col gap-1">
                <Label>摘要</Label>
                <Input
                  placeholder="（選填）"
                  value={form.watch("description")}
                  onChange={(e) => form.setValue("description", e.target.value)}
                />
              </div>
            )}
          </div>
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
        <CardContent className="space-y-6">
          {isOpening ? (
            GROUPS.map((g) => {
              const rows = indexedFields.filter(({ f }) => f.group === g.key);
              const options = optionsForGroup(g.key);
              return (
                <div key={g.key}>
                  <div className="text-base font-medium mb-2">{g.label}</div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>科目</TableHead>
                          <TableHead className="w-36 text-right">借方</TableHead>
                          <TableHead className="w-36 text-right">貸方</TableHead>
                          <TableHead>備註</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-center text-sm text-muted-foreground py-3"
                            >
                              尚無分錄
                            </TableCell>
                          </TableRow>
                        ) : (
                          rows.map(({ idx }) => renderLineRow(idx, options))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => append(emptyLine(g.key))}
                  >
                    <Plus className="size-4 mr-1" />
                    新增{g.label}科目
                  </Button>
                </div>
              );
            })
          ) : (
            <div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>科目</TableHead>
                      <TableHead className="w-36 text-right">借方</TableHead>
                      <TableHead className="w-36 text-right">貸方</TableHead>
                      <TableHead>備註</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {indexedFields.map(({ idx }) => renderLineRow(idx, ALL_OPTIONS))}
                  </TableBody>
                </Table>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => append(emptyLine(""))}
              >
                <Plus className="size-4 mr-1" />
                新增一行
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          取消
        </Button>
        <Button type="submit" disabled={!isBalanced || form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? "建立中…"
            : isOpening
              ? "建立期初開帳草稿"
              : "建立草稿"}
        </Button>
      </div>
    </form>
  );
}
