"use client";

import { useMemo, useState } from "react";
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

import { postJournalEntriesAction } from "@/lib/services/voucher-posting";
import type { PostResult } from "@/lib/services/journal-entry";

// The minimal shape the dialog needs to render + post an entry. Both the list's
// `VoucherListRow` and the single entry the detail page builds satisfy it (the
// debit/credit are per-entry line sums, so balance can be shown pre-post).
export interface PostableEntry {
  id: string;
  entry_date: string;
  voucher_type: string;
  description: string | null;
  debit: number;
  credit: number;
}

interface VoucherBatchPostDialogProps {
  clientId: string;
  entries: PostableEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Receives the per-entry results so a caller can deselect only the entries that
  // actually posted (error === null), leaving failures selected for retry.
  onPosted?: (results: PostResult[]) => void;
}

export function VoucherBatchPostDialog({
  clientId,
  entries,
  open,
  onOpenChange,
  onPosted,
}: VoucherBatchPostDialogProps) {
  const [reviewed, setReviewed] = useState(false);
  const [results, setResults] = useState<PostResult[] | null>(null);
  // The entries actually posted, snapshotted at submit. `onPosted` revalidates the
  // parent's data (the posted rows flip out of its draft selection), so the live
  // `entries` prop can go empty while this dialog still shows results — render the
  // results table against the snapshot, not the live prop.
  const [posted, setPosted] = useState<PostableEntry[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const displayEntries = posted ?? entries;
  const summaries = useMemo(
    () =>
      displayEntries.map((entry) => ({
        entry,
        balanced: entry.debit === entry.credit && entry.debit > 0,
      })),
    [displayEntries],
  );

  const balancedCount = summaries.filter((s) => s.balanced).length;

  const handleSubmit = async () => {
    if (!reviewed || entries.length === 0 || submitting) return;
    setSubmitting(true);
    const snapshot = entries;
    setPosted(snapshot);
    try {
      const res = await postJournalEntriesAction(
        clientId,
        snapshot.map((e) => e.id),
      );
      setResults(res);
      const successCount = res.filter((r) => !r.error).length;
      const failCount = res.length - successCount;
      if (failCount === 0) {
        toast.success(`成功過帳 ${successCount} 筆`);
      } else {
        toast.warning(`成功 ${successCount} 筆、失敗 ${failCount} 筆`);
      }
      onPosted?.(res);
    } catch (err) {
      setPosted(null);
      toast.error(
        "過帳失敗：" + (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setReviewed(false);
    setResults(null);
    setPosted(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) onOpenChange(v);
        // Block close (取消 / Esc / overlay) while a post is in flight — otherwise
        // the resolving request would write results onto a closed dialog and wedge
        // the next open on a stale results view.
        else if (!submitting) handleClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>批次過帳</DialogTitle>
          <DialogDescription className="text-base">
            {results
              ? "過帳結果如下，請逐筆確認。"
              : `將為以下 ${entries.length} 筆草稿賦予傳票編號並進入帳本。過帳後不可直接刪除，當年度未關帳前可更新（需填修改原因）；跨年度後不可改。`}
          </DialogDescription>
        </DialogHeader>

        {!results && entries.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-base text-amber-900 flex gap-2 items-start">
            <AlertCircle className="size-5 shrink-0 mt-0.5" />
            <div>
              其中 <strong>{balancedCount}</strong> 筆借貸平衡可成功過帳；
              <strong>{entries.length - balancedCount}</strong> 筆不平衡將被略過（不消耗傳票編號）。
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
                    <TableCell className="text-base max-w-[360px]">
                      <div className="line-clamp-2">
                        {s.entry.description ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-base">
                      {formatNTD(s.entry.debit)} / {formatNTD(s.entry.credit)}
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
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={submitting}
              >
                取消
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!reviewed || entries.length === 0 || submitting}
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
