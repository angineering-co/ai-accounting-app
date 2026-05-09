"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RocPeriod } from "@/lib/domain/roc-period";
import {
  getSignedPreviewUrl,
  THUMBNAIL_TRANSFORM,
} from "@/lib/supabase/signed-preview-url-cache";
import type { Allowance, Invoice } from "@/lib/domain/models";

const SIGNED_URL_EXPIRATION_SECONDS = 60 * 30;

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "heic",
  "heif",
]);

const isImageFilename = (filename: string | null | undefined) => {
  if (!filename) return false;
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
};

export type AllowanceLinkStatus = "linked" | "pending-link" | "mismatched";

export type JoinedInvoice = Invoice & {
  client?: { id: string; name: string } | null;
};

export type JoinedAllowance = Allowance & {
  client?: { id: string; name: string } | null;
};

export type ClientGroup = {
  key: string;
  clientId: string | null;
  client: { id: string; name: string } | null;
  invoice?: JoinedInvoice;
  allowances: Array<{ row: JoinedAllowance; linkStatus: AllowanceLinkStatus }>;
};

interface InvoiceSearchResultRowProps {
  group: ClientGroup;
  expanded: boolean;
  onToggle: () => void;
  onReviewInvoice: (invoice: JoinedInvoice, previewUrl?: string) => void;
  onReviewAllowance: (allowance: JoinedAllowance) => void;
  onExtractAI: (invoiceId: string) => void;
  onDelete: (
    target:
      | { kind: "invoice"; row: JoinedInvoice }
      | { kind: "allowance"; row: JoinedAllowance },
  ) => void;
  firmId: string;
  isExtracting: boolean;
}

export function InvoiceSearchResultRow({
  group,
  expanded,
  onToggle,
  onReviewInvoice,
  onReviewAllowance,
  onExtractAI,
  onDelete,
  firmId,
  isExtracting,
}: InvoiceSearchResultRowProps) {
  const { invoice, allowances, client } = group;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (
      !invoice?.storage_path ||
      !isImageFilename(invoice.filename) ||
      previewUrl
    ) {
      return;
    }

    let mounted = true;
    void (async () => {
      const url = await getSignedPreviewUrl({
        bucketName: "invoices",
        storagePath: invoice.storage_path,
        expiresInSeconds: SIGNED_URL_EXPIRATION_SECONDS,
        transform: THUMBNAIL_TRANSFORM,
      });
      if (mounted && url) setPreviewUrl(url);
    })();

    return () => {
      mounted = false;
    };
  }, [invoice?.storage_path, invoice?.filename, previewUrl]);

  const allowanceTotal = allowances.reduce(
    (sum, a) => sum + (a.row.extracted_data?.amount ?? 0),
    0,
  );

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/60"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
        />
        <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/20">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt={invoice?.filename ?? ""}
              className="h-full w-full object-cover"
              width={80}
              height={56}
              loading="lazy"
              unoptimized
            />
          ) : (
            <FileText className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          {invoice ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-base font-medium">
                  {invoice.invoice_serial_code ?? "—"}
                </span>
                <StatusBadge status={invoice.status} />
                <TypeChip inOrOut={invoice.in_or_out} />
                {allowances.length > 0 && (
                  <Badge variant="secondary" className="text-base">
                    折讓 ×{allowances.length}
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {client?.name ?? "未指定客戶"}
                {invoice.year_month ? (
                  <>
                    <span className="mx-1">·</span>
                    {RocPeriod.fromYYYMM(invoice.year_month).format()}
                  </>
                ) : null}
                {invoice.extracted_data?.date ? (
                  <>
                    <span className="mx-1">·</span>
                    {invoice.extracted_data.date}
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-medium">
                  折讓單（尚無對應發票）
                </span>
                <Badge variant="secondary" className="text-base">
                  折讓 ×{allowances.length}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {client?.name ?? "未指定客戶"}
              </div>
            </>
          )}
        </div>
        <div className="shrink-0 text-right tabular-nums">
          {invoice ? (
            <>
              <div className="text-base font-medium">
                {formatMoney(invoice.extracted_data?.totalAmount)}
              </div>
              <div className="text-sm text-muted-foreground">
                稅 {formatMoney(invoice.extracted_data?.tax)}
              </div>
            </>
          ) : (
            <div className="text-base font-medium text-muted-foreground">
              折讓 -{formatMoney(allowanceTotal)}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <CardContent className="border-t bg-muted/20 px-4 py-4 space-y-6">
          {invoice && (
            <InvoiceDetails
              invoice={invoice}
              firmId={firmId}
              onReview={() => onReviewInvoice(invoice, previewUrl ?? undefined)}
              onExtractAI={() => onExtractAI(invoice.id)}
              onDelete={() => onDelete({ kind: "invoice", row: invoice })}
              isExtracting={isExtracting}
            />
          )}
          {allowances.length > 0 && (
            <div className="space-y-3">
              <div className="text-base font-medium">
                相關折讓單 ({allowances.length})
              </div>
              <div className="space-y-3">
                {allowances.map(({ row, linkStatus }) => (
                  <AllowanceCard
                    key={row.id}
                    allowance={row}
                    linkStatus={linkStatus}
                    onReview={() => onReviewAllowance(row)}
                    onDelete={() =>
                      onDelete({ kind: "allowance", row })
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function InvoiceDetails({
  invoice,
  firmId,
  onReview,
  onExtractAI,
  onDelete,
  isExtracting,
}: {
  invoice: JoinedInvoice;
  firmId: string;
  onReview: () => void;
  onExtractAI: () => void;
  onDelete: () => void;
  isExtracting: boolean;
}) {
  const data = invoice.extracted_data ?? {};
  const periodHref = invoice.client && invoice.year_month
    ? `/firm/${firmId}/client/${invoice.client.id}/period/${invoice.year_month}?invoiceId=${invoice.id}`
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-base font-medium">發票詳情</div>
        {periodHref && (
          <Link
            href={periodHref}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            於期別頁開啟
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 rounded-md border bg-background p-4">
        <Field label="發票字軌號碼" value={invoice.invoice_serial_code ?? data.invoiceSerialCode} mono />
        <Field label="發票日期" value={data.date} />
        <Field label="發票類型" value={data.invoiceType} />
        <Field label="進銷項" value={invoice.in_or_out === "in" ? "進項" : "銷項"} />
        <Field label="銷售額" value={formatMoney(data.totalSales)} mono />
        <Field label="稅額" value={formatMoney(data.tax)} mono />
        <Field label="總計" value={formatMoney(data.totalAmount)} mono />
        <Field label="課稅別" value={data.taxType} />
        <Field label="賣方名稱" value={data.sellerName} />
        <Field label="賣方統編" value={data.sellerTaxId} mono />
        <Field label="買方名稱" value={data.buyerName} />
        <Field label="買方統編" value={data.buyerTaxId} mono />
        <Field label="會計科目" value={data.account || undefined} />
        <Field label="可扣抵" value={data.deductible === undefined ? undefined : data.deductible ? "是" : "否"} />
        <Field label="摘要" value={data.summary} colSpan2 />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onReview}>
          <Pencil className="mr-1.5 h-4 w-4" />
          檢視 / 編輯
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onExtractAI}
          disabled={isExtracting || invoice.status === "processing"}
        >
          {isExtracting || invoice.status === "processing" ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          AI 重新提取
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="mr-1.5 h-4 w-4" />
          刪除
        </Button>
      </div>
    </div>
  );
}

function AllowanceCard({
  allowance,
  linkStatus,
  onReview,
  onDelete,
}: {
  allowance: JoinedAllowance;
  linkStatus: AllowanceLinkStatus;
  onReview: () => void;
  onDelete: () => void;
}) {
  const data = allowance.extracted_data ?? {};

  return (
    <div className="rounded-md border bg-background p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-base font-medium">
          {allowance.allowance_serial_code ?? "—"}
        </span>
        <StatusBadge status={allowance.status} />
        <TypeChip inOrOut={allowance.in_or_out} kind="allowance" />
        <LinkStatusChip status={linkStatus} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        <Field label="折讓類型" value={data.allowanceType} />
        <Field label="折讓日期" value={data.date} />
        <Field label="對應發票字軌" value={allowance.original_invoice_serial_code ?? data.originalInvoiceSerialCode} mono />
        <Field label="折讓金額" value={formatMoney(data.amount)} mono />
        <Field label="折讓稅額" value={formatMoney(data.taxAmount)} mono />
        <Field label="賣方名稱" value={data.sellerName} />
        <Field label="賣方統編" value={data.sellerTaxId} mono />
        <Field label="買方名稱" value={data.buyerName} />
        <Field label="買方統編" value={data.buyerTaxId} mono />
        <Field label="摘要" value={data.summary} colSpan2 />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onReview}>
          <Pencil className="mr-1.5 h-4 w-4" />
          檢視 / 編輯
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="mr-1.5 h-4 w-4" />
          刪除
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
  colSpan2 = false,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
  colSpan2?: boolean;
}) {
  const display =
    value === null || value === undefined || value === ""
      ? "—"
      : String(value);
  return (
    <div className={cn("flex flex-col gap-0.5", colSpan2 && "sm:col-span-2")}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-base", mono && "font-mono tabular-nums")}>
        {display}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<
    string,
    { label: string; badgeClass: string; dotClass: string }
  > = {
    uploaded: {
      label: "已上傳",
      badgeClass:
        "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300",
      dotClass: "bg-slate-500",
    },
    processing: {
      label: "處理中",
      badgeClass:
        "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
      dotClass: "bg-blue-500 animate-pulse",
    },
    processed: {
      label: "待確認",
      badgeClass:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      dotClass: "bg-amber-500",
    },
    confirmed: {
      label: "已確認",
      badgeClass:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
      dotClass: "bg-emerald-500",
    },
    failed: {
      label: "失敗",
      badgeClass:
        "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
      dotClass: "bg-rose-500",
    },
  };

  const config = statusConfig[status] || statusConfig.uploaded;

  return (
    <Badge
      variant="outline"
      className={cn("min-w-[72px] justify-center gap-1.5", config.badgeClass)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dotClass)} />
      {config.label}
    </Badge>
  );
}

function TypeChip({
  inOrOut,
  kind = "invoice",
}: {
  inOrOut: "in" | "out";
  kind?: "invoice" | "allowance";
}) {
  const label =
    kind === "allowance"
      ? inOrOut === "in"
        ? "進項折讓"
        : "銷項折讓"
      : inOrOut === "in"
        ? "進項"
        : "銷項";
  const barClass = inOrOut === "in" ? "bg-sky-500" : "bg-orange-500";
  return (
    <span className="inline-flex items-center gap-1.5 text-base text-muted-foreground">
      <span className={cn("h-4 w-0.5 rounded-full", barClass)} />
      {label}
    </span>
  );
}

function LinkStatusChip({ status }: { status: AllowanceLinkStatus }) {
  if (status === "linked") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        已連結
      </Badge>
    );
  }
  if (status === "pending-link") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        title="儲存折讓單時將自動連結至對應發票"
      >
        待連結
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
      title="此折讓已連結至其他發票"
    >
      <AlertTriangle className="h-3 w-3" />
      連結至其他發票
    </Badge>
  );
}

function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return amount.toLocaleString("zh-TW");
}
