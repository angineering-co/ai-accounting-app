"use client";

import { useEffect, useMemo, useState, use } from "react";
import useSWR from "swr";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteInvoice,
  extractInvoiceDataAction,
} from "@/lib/services/invoice";
import { deleteAllowance } from "@/lib/services/allowance";
import { InvoiceReviewDialog } from "@/components/invoice-review-dialog";
import { AllowanceReviewDialog } from "@/components/allowance-review-dialog";
import {
  InvoiceSearchResultRow,
  type AllowanceLinkStatus,
  type ClientGroup,
  type JoinedAllowance,
  type JoinedInvoice,
} from "@/components/invoice-search-result-row";

const SERIAL_CODE_PATTERN = /^[A-Z]{2}\d{8}$/;

type DeleteTarget =
  | { kind: "invoice"; row: JoinedInvoice }
  | { kind: "allowance"; row: JoinedAllowance };

type SearchPayload = {
  invoices: JoinedInvoice[];
  allowances: JoinedAllowance[];
};

export default function InvoicePage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = use(params);
  const supabase = createSupabaseClient();

  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [reviewingInvoice, setReviewingInvoice] =
    useState<JoinedInvoice | null>(null);
  const [reviewingAllowance, setReviewingAllowance] =
    useState<JoinedAllowance | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());

  const fetcher = async (): Promise<SearchPayload> => {
    if (!submittedQuery) return { invoices: [], allowances: [] };

    const [invoicesRes, allowancesRes] = await Promise.all([
      supabase
        .from("invoices")
        .select(`*, client:clients(id, name)`)
        .eq("firm_id", firmId)
        .eq("invoice_serial_code", submittedQuery),
      supabase
        .from("allowances")
        .select(`*, client:clients(id, name)`)
        .eq("firm_id", firmId)
        .eq("original_invoice_serial_code", submittedQuery),
    ]);

    if (invoicesRes.error) throw invoicesRes.error;
    if (allowancesRes.error) throw allowancesRes.error;

    return {
      invoices: (invoicesRes.data ?? []) as unknown as JoinedInvoice[],
      allowances: (allowancesRes.data ?? []) as unknown as JoinedAllowance[],
    };
  };

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<SearchPayload>(
    submittedQuery ? ["invoice-search", firmId, submittedQuery] : null,
    fetcher,
  );

  useEffect(() => {
    if (error) {
      console.error("Error searching invoices:", error);
      toast.error("搜尋失敗，請重試。");
    }
  }, [error]);

  const groups = useMemo<ClientGroup[]>(() => {
    if (!data) return [];
    return groupByClient(data.invoices, data.allowances);
  }, [data]);

  const totalInvoices = data?.invoices.length ?? 0;
  const totalAllowances = data?.allowances.length ?? 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = query.replace(/\s+/g, "").toUpperCase();
    if (!normalized) return;
    if (!SERIAL_CODE_PATTERN.test(normalized)) {
      toast.error("字軌號碼格式錯誤，請使用 2 碼英文 + 8 碼數字");
      return;
    }
    setQuery(normalized);
    setSubmittedQuery(normalized);
    setExpandedKey(null);
  };

  const handleExtractAI = async (invoiceId: string) => {
    setExtractingIds((prev) => new Set(prev).add(invoiceId));
    try {
      toast.info("AI 正在處理中...");
      await extractInvoiceDataAction(invoiceId);
      toast.success("AI 處理完成，請進行確認");
      void mutate();
    } catch (err) {
      console.error("Error extracting invoice data:", err);
      toast.error(err instanceof Error ? err.message : "AI 提取失敗");
    } finally {
      setExtractingIds((prev) => {
        const next = new Set(prev);
        next.delete(invoiceId);
        return next;
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.kind === "invoice") {
        await deleteInvoice(deleteTarget.row.id);
        toast.success("刪除發票成功。");
      } else {
        await deleteAllowance(deleteTarget.row.id);
        toast.success("刪除折讓單成功。");
      }
      setDeleteTarget(null);
      // If we deleted the row whose group was expanded and that group becomes empty,
      // collapse it.
      void mutate().then((next) => {
        if (!next) return;
        const remaining = groupByClient(next.invoices, next.allowances);
        if (!remaining.some((g) => g.key === expandedKey)) {
          setExpandedKey(null);
        }
      });
    } catch (err) {
      console.error("Error deleting record:", err);
      toast.error(
        deleteTarget.kind === "invoice" ? "刪除發票失敗。" : "刪除折讓單失敗。",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">發票管理</h1>
        <p className="text-muted-foreground">
          輸入完整字軌號碼以搜尋發票及相關折讓單。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例如：AB12345678"
          className="font-mono"
          maxLength={32}
          autoFocus
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          搜尋
        </Button>
      </form>

      <ResultsArea
        submittedQuery={submittedQuery}
        isLoading={isLoading}
        groups={groups}
        totalInvoices={totalInvoices}
        totalAllowances={totalAllowances}
        expandedKey={expandedKey}
        onToggle={(key) => setExpandedKey((prev) => (prev === key ? null : key))}
        onReviewInvoice={(invoice) => setReviewingInvoice(invoice)}
        onReviewAllowance={(allowance) => setReviewingAllowance(allowance)}
        onExtractAI={handleExtractAI}
        onDelete={(target) => setDeleteTarget(target)}
        firmId={firmId}
        extractingIds={extractingIds}
      />

      <InvoiceReviewDialog
        invoice={reviewingInvoice}
        isOpen={!!reviewingInvoice}
        onOpenChange={(open) => !open && setReviewingInvoice(null)}
        onSuccess={() => void mutate()}
      />

      <AllowanceReviewDialog
        allowance={reviewingAllowance}
        isOpen={!!reviewingAllowance}
        onOpenChange={(open) => !open && setReviewingAllowance(null)}
        onSuccess={() => void mutate()}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">確認刪除</DialogTitle>
            <DialogDescription>
              {deleteTarget?.kind === "invoice"
                ? `您確定要刪除發票「${deleteTarget.row.filename}」嗎？此操作無法復原。`
                : deleteTarget?.kind === "allowance"
                  ? `您確定要刪除折讓單「${deleteTarget.row.allowance_serial_code ?? deleteTarget.row.filename ?? "未命名"}」嗎？此操作無法復原。`
                  : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              保留資料
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultsArea({
  submittedQuery,
  isLoading,
  groups,
  totalInvoices,
  totalAllowances,
  expandedKey,
  onToggle,
  onReviewInvoice,
  onReviewAllowance,
  onExtractAI,
  onDelete,
  firmId,
  extractingIds,
}: {
  submittedQuery: string | null;
  isLoading: boolean;
  groups: ClientGroup[];
  totalInvoices: number;
  totalAllowances: number;
  expandedKey: string | null;
  onToggle: (key: string) => void;
  onReviewInvoice: (invoice: JoinedInvoice) => void;
  onReviewAllowance: (allowance: JoinedAllowance) => void;
  onExtractAI: (invoiceId: string) => void;
  onDelete: (
    target:
      | { kind: "invoice"; row: JoinedInvoice }
      | { kind: "allowance"; row: JoinedAllowance },
  ) => void;
  firmId: string;
  extractingIds: Set<string>;
}) {
  if (submittedQuery === null) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-base text-muted-foreground">
        輸入完整字軌號碼以開始搜尋
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-md border p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-base text-muted-foreground">
        找不到任何記錄（字軌：
        <span className="font-mono">{submittedQuery}</span>）
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        找到 {totalInvoices} 張發票、{totalAllowances} 張折讓單
      </div>
      {groups.map((group) => (
        <InvoiceSearchResultRow
          key={group.key}
          group={group}
          expanded={expandedKey === group.key}
          onToggle={() => onToggle(group.key)}
          onReviewInvoice={onReviewInvoice}
          onReviewAllowance={onReviewAllowance}
          onExtractAI={onExtractAI}
          onDelete={onDelete}
          firmId={firmId}
          isExtracting={
            !!group.invoice && extractingIds.has(group.invoice.id)
          }
        />
      ))}
    </div>
  );
}

function groupByClient(
  invoices: JoinedInvoice[],
  allowances: JoinedAllowance[],
): ClientGroup[] {
  const groupMap = new Map<string, ClientGroup>();

  const keyFor = (clientId: string | null | undefined) =>
    clientId ?? "__no_client__";

  for (const invoice of invoices) {
    const key = keyFor(invoice.client_id);
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        clientId: invoice.client_id ?? null,
        client: invoice.client ?? null,
        invoice,
        allowances: [],
      });
    } else {
      // Same serial under same client should be unique by DB constraint, but
      // be defensive: keep the first invoice.
      const existing = groupMap.get(key)!;
      if (!existing.invoice) existing.invoice = invoice;
      if (!existing.client) existing.client = invoice.client ?? null;
    }
  }

  for (const allowance of allowances) {
    const key = keyFor(allowance.client_id);
    let group = groupMap.get(key);
    if (!group) {
      group = {
        key,
        clientId: allowance.client_id ?? null,
        client: allowance.client ?? null,
        invoice: undefined,
        allowances: [],
      };
      groupMap.set(key, group);
    }
    if (!group.client) group.client = allowance.client ?? null;

    let linkStatus: AllowanceLinkStatus;
    if (group.invoice && allowance.original_invoice_id === group.invoice.id) {
      linkStatus = "linked";
    } else if (
      allowance.original_invoice_id === null ||
      allowance.original_invoice_id === undefined
    ) {
      linkStatus = "pending-link";
    } else {
      linkStatus = "mismatched";
    }
    group.allowances.push({ row: allowance, linkStatus });
  }

  return Array.from(groupMap.values()).sort((a, b) => {
    const aName = a.client?.name ?? "";
    const bName = b.client?.name ?? "";
    return aName.localeCompare(bName, "zh-Hant");
  });
}
