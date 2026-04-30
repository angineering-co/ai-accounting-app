"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatNTD } from "@/lib/utils";

import type { JournalEntry } from "@/lib/domain/journal-entry";
import { useVoucherDemoStore } from "@/lib/dev/use-voucher-demo-store";

interface VoucherBatchPostDialogProps {
  entries: JournalEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPosted?: () => void;
}

interface PostResult {
  entry_id: string;
  voucher_no: string | null;
  error: string | null;
}

function summarizeEntry(
  entry: JournalEntry,
  allLines: { journal_entry_id: string; debit: number; credit: number }[],
): { debit: number; credit: number; balanced: boolean } {
  const ls = allLines.filter((l) => l.journal_entry_id === entry.id);
  const debit = ls.reduce((s, l) => s + l.debit, 0);
  const credit = ls.reduce((s, l) => s + l.credit, 0);
  return { debit, credit, balanced: debit === credit && debit > 0 };
}

export function VoucherBatchPostDialog({
  entries,
  open,
  onOpenChange,
  onPosted,
}: VoucherBatchPostDialogProps) {
  const store = useVoucherDemoStore();
  const [reviewed, setReviewed] = useState(false);
  const [results, setResults] = useState<PostResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const drafts = entries.filter((e) => e.status === "draft");
  const summaries = drafts.map((e) => ({
    entry: e,
    ...summarizeEntry(e, store.lines),
  }));
  const balancedCount = summaries.filter((s) => s.balanced).length;

  const handleSubmit = () => {
    if (!reviewed || drafts.length === 0) return;
    setSubmitting(true);
    const ids = drafts.map((e) => e.id);
    const res = store.postEntries(ids, store.userId);
    setResults(res);
    const successCount = res.filter((r) => !r.error).length;
    const failCount = res.length - successCount;
    if (failCount === 0) {
      toast.success(`成功過帳 ${successCount} 筆`);
    } else {
      toast.warning(`成功 ${successCount} 筆、失敗 ${failCount} 筆`);
    }
    setSubmitting(false);
    onPosted?.();
  };

  const handleClose = () => {
    setReviewed(false);
    setResults(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : handleClose())}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>批次過帳</DialogTitle>
          <DialogDescription className="text-base">
            {results
              ? "過帳結果如下，請逐筆確認。"
              : `將為以下 ${drafts.length} 筆草稿賦予傳票編號並進入帳本。過帳後不可直接刪除，當年度未關帳前可 in-place edit（需填修改原因）；跨年度後不可改。`}
          </DialogDescription>
        </DialogHeader>

        {!results && drafts.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-base text-amber-900 flex gap-2 items-start">
            <AlertCircle className="size-5 shrink-0 mt-0.5" />
            <div>
              其中 <strong>{balancedCount}</strong> 筆借貸平衡可成功過帳；
              <strong>{drafts.length - balancedCount}</strong> 筆不平衡將被略過（不消耗傳票編號）。
            </div>
          </div>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>類型</TableHead>
                <TableHead>摘要</TableHead>
                <TableHead className="text-right">借 / 貸</TableHead>
                <TableHead className="w-32">結果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((s) => {
                const r = results?.find((x) => x.entry_id === s.entry.id);
                return (
                  <TableRow key={s.entry.id}>
                    <TableCell className="font-mono text-base">
                      {s.entry.entry_date}
                    </TableCell>
                    <TableCell className="text-base">
                      {s.entry.voucher_type}
                    </TableCell>
                    <TableCell className="text-base max-w-[280px] truncate">
                      {s.entry.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-base">
                      {formatNTD(s.debit)} / {formatNTD(s.credit)}
                    </TableCell>
                    <TableCell>
                      {r ? (
                        r.error ? (
                          <span className="inline-flex items-center gap-1 text-destructive text-base">
                            <XCircle className="size-4" />
                            {r.error}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-base font-mono">
                            <CheckCircle2 className="size-4" />
                            {r.voucher_no}
                          </span>
                        )
                      ) : (
                        <span
                          className={cn(
                            "text-sm",
                            s.balanced ? "text-emerald-700" : "text-destructive",
                          )}
                        >
                          {s.balanced ? "可過帳" : "不平衡"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {!results && (
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={reviewed}
              onCheckedChange={(v) => setReviewed(Boolean(v))}
              className="mt-0.5"
            />
            <span className="text-base">
              我已逐筆檢查過所有選取的傳票（科目、金額、日期皆正確）。
            </span>
          </label>
        )}

        <DialogFooter>
          {results ? (
            <Button onClick={handleClose}>關閉</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                取消
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!reviewed || drafts.length === 0 || submitting}
              >
                確認過帳
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
