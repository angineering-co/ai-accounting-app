"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  Edit,
  History,
  RotateCcw,
  Send,
  Trash2,
  ArrowRight,
  ArrowLeftCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, formatNTD } from "@/lib/utils";

import {
  seedVoucherDemoFor,
  useVoucherDemoStore,
} from "@/lib/dev/use-voucher-demo-store";
import { accountLabel } from "@/lib/data/accounts";
import { VoucherEditDialog } from "@/components/voucher-edit-dialog";
import { VoucherReverseDialog } from "@/components/voucher-reverse-dialog";
import { VoucherAuditHistory } from "@/components/voucher-audit-history";
import { VoucherBatchPostDialog } from "@/components/voucher-batch-post-dialog";

const DOC_TYPE_LABEL: Record<string, string> = {
  invoice: "發票",
  allowance: "折讓",
  receipt: "收據",
  payroll: "薪資單",
  insurance: "保險費",
  manual: "手動建單",
};

export default function VoucherDetailPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string; entryId: string }>;
}) {
  const { firmId, clientId, entryId } = use(params);
  const router = useRouter();
  const store = useVoucherDemoStore();

  useEffect(() => {
    seedVoucherDemoFor(firmId, clientId);
  }, [firmId, clientId]);

  const [editOpen, setEditOpen] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const entry = useMemo(
    () => store.entries.find((e) => e.id === entryId),
    [store.entries, entryId],
  );

  const lines = useMemo(
    () =>
      [...store.lines.filter((l) => l.journal_entry_id === entryId)].sort(
        (a, b) => a.line_number - b.line_number,
      ),
    [store.lines, entryId],
  );

  const debitTotal = lines.reduce((s, l) => s + l.debit, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit, 0);

  const reverserEntry = useMemo(() => {
    if (entry?.status !== "reversed") return null;
    return store.entries.find((e) => e.reverses_entry_id === entryId) ?? null;
  }, [entry?.status, store.entries, entryId]);

  const reversedTarget = useMemo(() => {
    if (!entry?.reverses_entry_id) return null;
    return store.entries.find((e) => e.id === entry.reverses_entry_id) ?? null;
  }, [entry?.reverses_entry_id, store.entries]);

  const document = useMemo(() => {
    if (!entry?.document_id) return null;
    return store.documents.find((d) => d.id === entry.document_id) ?? null;
  }, [entry?.document_id, store.documents]);

  if (!entry) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">傳票詳情</h1>
        </div>
        <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground text-base">
          找不到傳票（id={entryId.slice(0, 8)}…）
        </div>
      </div>
    );
  }

  const isDraft = entry.status === "draft";
  const isPosted = entry.status === "posted";
  const isReversed = entry.status === "reversed";

  const handleDeleteDraft = () => {
    store.deleteDraftEntry(entry.id);
    toast.success("草稿已刪除");
    setDeleteOpen(false);
    router.push(`/firm/${firmId}/client/${clientId}/voucher`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">傳票詳情</h1>
        <Badge variant="outline" className="text-sm">
          示範資料（Phase 2）
        </Badge>
      </div>

      <Card
        className={cn(
          isDraft && "border-dashed bg-muted/30",
          isReversed && "opacity-70",
        )}
      >
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div>
              <CardTitle className="text-2xl font-mono">
                {entry.voucher_no ?? "（草稿，尚未賦號）"}
              </CardTitle>
              <CardDescription className="text-base mt-1">
                {entry.entry_date}・{entry.voucher_type}
                {entry.description && (
                  <span className="ml-2">・{entry.description}</span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isDraft && (
                <Badge variant="outline" className="border-dashed">
                  草稿
                </Badge>
              )}
              {isPosted && (
                <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                  ✓ 已過帳
                </Badge>
              )}
              {isReversed && (
                <Badge
                  variant="outline"
                  className="border-destructive/50 text-destructive line-through"
                >
                  已沖銷
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {(reverserEntry || reversedTarget) && (
            <div className="rounded-md border bg-muted/40 p-3 text-base flex items-center gap-2">
              {reverserEntry && (
                <>
                  <ArrowRight className="size-4 text-muted-foreground" />
                  <span>此傳票已被沖銷，沖銷分錄為</span>
                  <Link
                    href={`/firm/${firmId}/client/${clientId}/voucher/${reverserEntry.id}`}
                    className="font-mono font-medium hover:underline"
                  >
                    {reverserEntry.voucher_no}
                  </Link>
                </>
              )}
              {reversedTarget && (
                <>
                  <ArrowLeftCircle className="size-4 text-muted-foreground" />
                  <span>此為反向分錄，沖銷的原傳票為</span>
                  <Link
                    href={`/firm/${firmId}/client/${clientId}/voucher/${reversedTarget.id}`}
                    className="font-mono font-medium hover:underline"
                  >
                    {reversedTarget.voucher_no}
                  </Link>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-base">
            <div>
              <div className="text-sm text-muted-foreground">原始憑證</div>
              <div className="mt-1">
                {document ? (
                  <span>
                    {DOC_TYPE_LABEL[document.doc_type] ?? document.doc_type}
                    ・{document.doc_date}
                    {document.amount != null && (
                      <span className="ml-2 font-mono">
                        {formatNTD(document.amount)}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">（無原始憑證 / 系統分錄）</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">過帳時間 / 人</div>
              <div className="mt-1 font-mono">
                {entry.posted_at ? (
                  <>
                    {format(entry.posted_at, "yyyy-MM-dd HH:mm")}
                    <span className="ml-2 text-sm text-muted-foreground">
                      {entry.posted_by ? entry.posted_by.slice(0, 8) + "…" : "系統"}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground font-sans">尚未過帳</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">建立 / 最近更新</div>
              <div className="mt-1 font-mono">
                {format(entry.created_at, "yyyy-MM-dd HH:mm")} /{" "}
                {format(entry.updated_at, "yyyy-MM-dd HH:mm")}
              </div>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">
                      {l.line_number}
                    </TableCell>
                    <TableCell className="font-mono text-base">
                      {accountLabel(l.account_code)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {l.debit > 0 ? formatNTD(l.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {l.credit > 0 ? formatNTD(l.credit) : "—"}
                    </TableCell>
                    <TableCell className="text-base">
                      {l.description ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-medium">
                  <TableCell colSpan={2} className="text-right">合計</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNTD(debitTotal)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNTD(creditTotal)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {isDraft && (
              <>
                <Button onClick={() => setEditOpen(true)}>
                  <Edit className="size-4 mr-1" />
                  編輯
                </Button>
                <Button onClick={() => setPostOpen(true)} variant="default">
                  <Send className="size-4 mr-1" />
                  過帳
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4 mr-1" />
                  刪除草稿
                </Button>
              </>
            )}
            {isPosted && (
              <>
                <Button onClick={() => setEditOpen(true)}>
                  <Edit className="size-4 mr-1" />
                  編輯（in-place）
                </Button>
                <Button variant="destructive" onClick={() => setReverseOpen(true)}>
                  <RotateCcw className="size-4 mr-1" />
                  沖銷
                </Button>
              </>
            )}
            {!isDraft && (
              <Button variant="outline" onClick={() => setHistoryOpen(true)}>
                <History className="size-4 mr-1" />
                審計歷史
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <VoucherEditDialog
        entry={entry}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      {reverseOpen && (
        <VoucherReverseDialog
          entry={entry}
          open={reverseOpen}
          onOpenChange={setReverseOpen}
        />
      )}
      {historyOpen && (
        <VoucherAuditHistory
          entryId={entry.id}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        />
      )}
      {postOpen && (
        <VoucherBatchPostDialog
          entries={[entry]}
          open={postOpen}
          onOpenChange={setPostOpen}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除草稿？</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              草稿尚未進入帳本，刪除後將無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留草稿</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDraft}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
