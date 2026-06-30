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

// The server action rejects batches over MAX_POST_BATCH (1000). "全部過帳" can hand us
// every draft a client has, so chunk well under that cap and post the chunks
// sequentially — each call locks the voucher_sequences row, so running them in
// parallel would just contend on that lock.
const POST_CHUNK_SIZE = 500;

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
  // Only the rows that need the reviewer's eyes get listed; the rest collapse into
  // a count. Pre-post that's the unbalanced drafts (which will be skipped); post-run
  // it's the entries the server rejected, paired back to their snapshot for context.
  const unbalanced = useMemo(
    () => summaries.filter((s) => !s.balanced),
    [summaries],
  );
  const failed = useMemo(() => {
    if (!results) return [];
    const byId = new Map((posted ?? []).map((e) => [e.id, e]));
    return results
      .filter((r) => r.error)
      .map((r) => ({ result: r, entry: byId.get(r.entry_id) ?? null }));
  }, [results, posted]);
  const successCount = results ? results.length - failed.length : 0;

  const handleSubmit = async () => {
    if (!reviewed || entries.length === 0 || submitting) return;
    setSubmitting(true);
    const snapshot = entries;
    setPosted(snapshot);
    try {
      const ids = snapshot.map((e) => e.id);
      const res: PostResult[] = [];
      // Post the chunks sequentially. A chunk that throws (network drop / db timeout)
      // aborts the remaining chunks, but the ones that already committed must still be
      // honoured — surface them in the results view and report them up so their rows
      // leave the draft selection. The un-sent entries simply stay selected for retry.
      let abortError: string | null = null;
      for (let i = 0; i < ids.length; i += POST_CHUNK_SIZE) {
        try {
          const chunk = await postJournalEntriesAction(
            clientId,
            ids.slice(i, i + POST_CHUNK_SIZE),
          );
          res.push(...chunk);
        } catch (err) {
          abortError = err instanceof Error ? err.message : String(err);
          break;
        }
      }
      // Failed before anything committed — treat as a clean failure (roll the snapshot
      // back via the outer catch, no half-rendered results view).
      if (abortError && res.length === 0) throw new Error(abortError);

      setResults(res);
      const successCount = res.filter((r) => !r.error).length;
      const failCount = res.length - successCount;
      if (abortError) {
        toast.error(
          `已過帳 ${successCount} 筆後中斷：${abortError}（其餘尚未送出，請重試）`,
        );
      } else if (failCount === 0) {
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
              ? "過帳結果如下。"
              : `將為這 ${entries.length} 筆草稿賦予傳票編號並進入帳本。過帳後不可直接刪除，當年度未關帳前可更新（需填修改原因）；跨年度後不可改。`}
          </DialogDescription>
        </DialogHeader>

        {/* Pre-post: a one-line tally, then only the unbalanced drafts spelled out
            so the reviewer can go fix them — balanced rows stay collapsed. */}
        {!results && entries.length > 0 && (
          <div
            className={cn(
              "rounded-md border p-3 text-base flex gap-2 items-start",
              unbalanced.length > 0
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-emerald-300 bg-emerald-50 text-emerald-900",
            )}
          >
            {unbalanced.length > 0 ? (
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
            )}
            <div>
              共 <strong>{entries.length}</strong> 筆草稿，
              <strong>{balancedCount}</strong> 筆借貸平衡可過帳
              {unbalanced.length > 0 && (
                <>
                  ，<strong>{unbalanced.length}</strong>{" "}
                  筆不平衡將被略過（不消耗傳票編號）
                </>
              )}
              。
            </div>
          </div>
        )}

        {!results && unbalanced.length > 0 && (
          <div className="space-y-2">
            <p className="text-base font-medium text-destructive">
              以下 {unbalanced.length} 筆借貸不平衡，將被略過：
            </p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>類型</TableHead>
                    <TableHead>摘要</TableHead>
                    <TableHead className="text-right">借 / 貸</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unbalanced.map((s) => (
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Post-run: same shape — a tally, then only the failures listed. The
            successfully-posted entries collapse into the success count. */}
        {results && (
          <div
            className={cn(
              "rounded-md border p-3 text-base flex gap-2 items-start",
              failed.length > 0
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-emerald-300 bg-emerald-50 text-emerald-900",
            )}
          >
            {failed.length > 0 ? (
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
            )}
            <div>
              成功過帳 <strong>{successCount}</strong> 筆
              {failed.length > 0 && (
                <>
                  ，<strong>{failed.length}</strong> 筆失敗（如下，未消耗傳票編號）
                </>
              )}
              。
            </div>
          </div>
        )}

        {results && failed.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>類型</TableHead>
                  <TableHead>摘要</TableHead>
                  <TableHead className="w-40">原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failed.map(({ result, entry }) => (
                  <TableRow key={result.entry_id}>
                    <TableCell className="font-mono text-base">
                      {entry?.entry_date ?? "—"}
                    </TableCell>
                    <TableCell className="text-base">
                      {entry?.voucher_type ?? "—"}
                    </TableCell>
                    <TableCell className="text-base max-w-[360px]">
                      <div className="line-clamp-2">
                        {entry?.description ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-destructive text-base">
                        <XCircle className="size-4 shrink-0" />
                        {result.error}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

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
