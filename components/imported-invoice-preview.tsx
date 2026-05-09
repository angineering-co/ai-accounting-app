"use client";

import { Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Invoice } from "@/lib/domain/models";
import { formatNTD } from "@/lib/utils";

interface ImportedInvoicePreviewProps {
  invoice: Invoice;
  downloadUrl: string | null;
}

const MISSING = "—";

const fmtAmount = (n?: number | null) =>
  typeof n === "number" ? formatNTD(n) : MISSING;

const fmtText = (s?: string | null) => (s && s.trim() ? s : MISSING);

interface ParsedItem {
  description: string;
  quantity: string;
  amount: string;
}

// Invoices store items as a multi-line summary string in the format
// `品名：x, 數量：n, 金額：m` (one item per line). Parse back into structured
// rows for display; fall back to raw text if any line doesn't match.
function parseInvoiceItems(summary?: string | null): ParsedItem[] | null {
  if (!summary) return null;
  const lines = summary.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const pattern = /^品名：(.*?), *數量：(.*?), *金額：(.*)$/;
  const items: ParsedItem[] = [];
  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) return null;
    items.push({
      description: match[1].trim(),
      quantity: match[2].trim(),
      amount: match[3].trim(),
    });
  }
  return items;
}

function formatItemAmount(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return MISSING;
  const num = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(num) ? formatNTD(num) : trimmed;
}

interface RowProps {
  label: string;
  children: React.ReactNode;
}

function Row({ label, children }: RowProps) {
  return (
    <>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-base">{children}</div>
    </>
  );
}

export function ImportedInvoicePreview({
  invoice,
  downloadUrl,
}: ImportedInvoicePreviewProps) {
  const data = invoice.extracted_data ?? {};
  const items = parseInvoiceItems(data.summary);

  return (
    <div className="w-full h-full overflow-auto bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">原始匯入資料</h3>
        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            <Download className="h-4 w-4" />
            下載原始 Excel
          </a>
        )}
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-6">
        <Row label="發票號碼">{fmtText(data.invoiceSerialCode)}</Row>
        <Row label="發票日期">{fmtText(data.date)}</Row>
        <Row label="進銷項">{fmtText(data.inOrOut)}</Row>
        <Row label="發票類型">{fmtText(data.invoiceType)}</Row>
        <Row label="課稅別">{fmtText(data.taxType)}</Row>
        <Row label="賣方統編">{fmtText(data.sellerTaxId)}</Row>
        <Row label="賣方名稱">{fmtText(data.sellerName)}</Row>
        <Row label="買方統編">{fmtText(data.buyerTaxId)}</Row>
        <Row label="買方名稱">{fmtText(data.buyerName)}</Row>
        <Row label="應稅銷售額">{fmtAmount(data.totalSales)}</Row>
        <Row label="營業稅">{fmtAmount(data.tax)}</Row>
        <Row label="總計">{fmtAmount(data.totalAmount)}</Row>
      </div>

      {items && items.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">
            品項明細
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>品名</TableHead>
                <TableHead className="text-right w-24">數量</TableHead>
                <TableHead className="text-right w-32">金額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.description || MISSING}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.quantity || MISSING}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatItemAmount(item.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : data.summary ? (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">
            品項明細
          </h4>
          <pre className="whitespace-pre-wrap text-sm text-foreground bg-muted/50 p-3 rounded">
            {data.summary}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
