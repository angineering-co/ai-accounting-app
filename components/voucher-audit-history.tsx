"use client";

import { History } from "lucide-react";
import { format } from "date-fns";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useVoucherDemoStore } from "@/lib/dev/use-voucher-demo-store";
import type { AuditAction } from "@/lib/domain/audit-trail";
import { accountLabel } from "@/lib/data/accounts";
import { formatNTD } from "@/lib/utils";

interface VoucherAuditHistoryProps {
  entryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACTION_LABEL: Record<AuditAction, string> = {
  created: "建立",
  updated: "編輯",
  deleted: "刪除",
  posted: "過帳",
  voided: "作廢",
  marked_duplicate: "標記重複",
  reversed: "被沖銷",
};

interface BeforeSnapshot {
  entry?: {
    voucher_type?: string;
    entry_date?: string;
    description?: string | null;
  };
  lines?: {
    line_number: number;
    account_code: string;
    debit: number;
    credit: number;
    description?: string | null;
  }[];
}

function isBeforeSnapshot(value: unknown): value is BeforeSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    ("entry" in value || "lines" in value)
  );
}

export function VoucherAuditHistory({
  entryId,
  open,
  onOpenChange,
}: VoucherAuditHistoryProps) {
  const store = useVoucherDemoStore();
  const trails = [...store.auditTrails]
    .filter((t) => t.entity_table === "journal_entries" && t.entity_id === entryId)
    .sort((a, b) => b.actor_at.getTime() - a.actor_at.getTime());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5" />
            審計歷史
          </DialogTitle>
          <DialogDescription className="text-base">
            此傳票的所有變更紀錄（最新在上）。
          </DialogDescription>
        </DialogHeader>

        {trails.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-base text-muted-foreground">
            目前沒有審計紀錄。
          </div>
        ) : (
          <div className="space-y-4">
            {trails.map((t) => (
              <div key={t.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between text-base">
                  <div className="font-medium">
                    {ACTION_LABEL[t.action] ?? t.action}
                  </div>
                  <div className="text-sm text-muted-foreground font-mono">
                    {format(t.actor_at, "yyyy-MM-dd HH:mm:ss")}
                  </div>
                </div>
                {t.reason && (
                  <div className="text-base">
                    <span className="text-muted-foreground">原因：</span>
                    {t.reason}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  操作者：
                  {t.actor_id ? (
                    <span className="font-mono">{t.actor_id.slice(0, 8)}…</span>
                  ) : (
                    "系統"
                  )}
                </div>
                {isBeforeSnapshot(t.before) && t.before.lines && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">
                      變更前的分錄：
                    </div>
                    <div className="rounded border bg-muted/30">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>科目</TableHead>
                            <TableHead className="text-right">借方</TableHead>
                            <TableHead className="text-right">貸方</TableHead>
                            <TableHead>備註</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {t.before.lines.map((l) => (
                            <TableRow key={l.line_number}>
                              <TableCell>{l.line_number}</TableCell>
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
                        </TableBody>
                      </Table>
                    </div>
                    {t.before.entry?.description && (
                      <div className="text-sm text-muted-foreground mt-1">
                        變更前摘要：{t.before.entry.description}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            關閉
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
