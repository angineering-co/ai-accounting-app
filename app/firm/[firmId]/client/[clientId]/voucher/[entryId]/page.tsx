"use client";

import { use, useState } from "react";
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
import useSWR from "swr";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatNTD } from "@/lib/utils";

import { accountLabel } from "@/lib/data/accounts";
import {
  deleteDraftEntryAction,
  getVoucherDetail,
} from "@/lib/services/voucher";
import { RecordStateCard } from "@/components/record-state-card";
import { VoucherBatchPostDialog } from "@/components/voucher-batch-post-dialog";
import { VoucherEditDialog } from "@/components/voucher-edit-dialog";
import { VoucherAuditHistory } from "@/components/voucher-audit-history";
import { FilePreview } from "@/components/file-preview";

const DOC_TYPE_LABEL: Record<string, string> = {
  invoice: "發票",
  allowance: "折讓",
  receipt: "收據",
  payroll: "薪資單",
  insurance: "保險費",
  manual: "手動建單",
};

// Read-only release: post / edit / reverse mutations and the audit trail land in
// later phases (their RPCs don't exist yet), so these buttons stay disabled with a
// tooltip naming the upcoming phase rather than being wired to anything.
function DisabledAction({
  icon,
  label,
  reason,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  reason: string;
  variant?: "default" | "outline" | "destructive";
}) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <div>
            <Button variant={variant} disabled>
              {icon}
              {label}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{reason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function VoucherDetailPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string; entryId: string }>;
}) {
  const { firmId, clientId, entryId } = use(params);
  const router = useRouter();
  const [postOpen, setPostOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { data: detail, isLoading, error, mutate } = useSWR(
    ["voucher-detail", clientId, entryId],
    () => getVoucherDetail(clientId, entryId),
  );

  if (isLoading) {
    return <RecordStateCard title="傳票詳情" message="載入中…" />;
  }

  if (error) {
    return (
      <RecordStateCard
        title="傳票詳情"
        message="載入傳票時發生錯誤，請稍後再試。"
        tone="error"
      />
    );
  }

  if (!detail) {
    return (
      <RecordStateCard
        title="傳票詳情"
        message={`找不到傳票（id=${entryId.slice(0, 8)}…）`}
      />
    );
  }

  const { entry, lines, document, reverserEntry, reversedTarget } = detail;
  const debitTotal = lines.reduce((s, l) => s + l.debit, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit, 0);

  const isDraft = entry.status === "draft";
  const isPosted = entry.status === "posted";
  const isReversed = entry.status === "reversed";
  const isReversalVoucher = entry.reverses_entry_id != null;
  const hasPreview = !!document?.file_url;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDraftEntryAction(clientId, entry.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "刪除失敗");
      setIsDeleting(false);
      return;
    }
    toast.success("草稿已刪除");
    router.push(`/firm/${firmId}/client/${clientId}/voucher`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">傳票詳情</h1>
      </div>

      <div
        className={cn(
          "grid grid-cols-1 gap-4 items-start",
          hasPreview && "lg:grid-cols-2",
        )}
      >
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
                <Button onClick={() => setPostOpen(true)}>
                  <Send className="size-4 mr-1" />
                  過帳
                </Button>
                <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-4 mr-1" />
                  刪除草稿
                </Button>
              </>
            )}
            {isPosted && (
              <>
                <Button onClick={() => setEditOpen(true)}>
                  <Edit className="size-4 mr-1" />
                  編輯
                </Button>
                {!isReversalVoucher && (
                  <DisabledAction
                    variant="destructive"
                    icon={<RotateCcw className="size-4 mr-1" />}
                    label="沖銷"
                    reason="沖銷功能將於 Phase 10 開放"
                  />
                )}
              </>
            )}
            {!isDraft && (
              <Button variant="outline" onClick={() => setAuditOpen(true)}>
                <History className="size-4 mr-1" />
                審計歷史
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {hasPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">原始文件</CardTitle>
            <CardDescription className="text-sm">
              對照分錄與原始憑證內容是否相符。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FilePreview
              storagePath={document?.file_url}
              bucketName="documents"
              className="h-[70vh] min-h-[500px]"
            />
          </CardContent>
        </Card>
      )}
      </div>

      <VoucherBatchPostDialog
        clientId={clientId}
        entries={[
          {
            id: entry.id,
            entry_date: entry.entry_date,
            voucher_type: entry.voucher_type,
            description: entry.description ?? null,
            debit: debitTotal,
            credit: creditTotal,
          },
        ]}
        open={postOpen}
        onOpenChange={setPostOpen}
        onPosted={() => void mutate()}
      />

      <VoucherEditDialog
        clientId={clientId}
        entry={entry}
        lines={lines}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => void mutate()}
      />

      <VoucherAuditHistory
        clientId={clientId}
        entryId={entry.id}
        open={auditOpen}
        onOpenChange={setAuditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這張草稿傳票？</AlertDialogTitle>
            <AlertDialogDescription>
              此草稿尚未過帳，刪除後將一併移除其所有分錄，且無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>保留草稿</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? "刪除中…" : "刪除草稿"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
