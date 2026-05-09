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
import { IN_OR_OUT_LABELS, type Allowance } from "@/lib/domain/models";
import { formatNTD } from "@/lib/utils";

interface ImportedAllowancePreviewProps {
  allowance: Allowance;
  downloadUrl: string | null;
}

const MISSING = "—";

const fmtAmount = (n?: number | null) =>
  typeof n === "number" ? formatNTD(n) : MISSING;

const fmtText = (s?: string | null) => (s && s.trim() ? s : MISSING);

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

export function ImportedAllowancePreview({
  allowance,
  downloadUrl,
}: ImportedAllowancePreviewProps) {
  const data = allowance.extracted_data ?? {};
  const items = data.items ?? [];

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
        <Row label="折讓單號碼">{fmtText(allowance.allowance_serial_code)}</Row>
        <Row label="折讓單日期">{fmtText(data.date)}</Row>
        <Row label="進銷項">{IN_OR_OUT_LABELS[allowance.in_or_out]}</Row>
        <Row label="折讓類型">{fmtText(data.allowanceType)}</Row>
        <Row label="原始發票號碼">
          {fmtText(data.originalInvoiceSerialCode)}
        </Row>
        <Row label="賣方統編">{fmtText(data.sellerTaxId)}</Row>
        <Row label="賣方名稱">{fmtText(data.sellerName)}</Row>
        <Row label="買方統編">{fmtText(data.buyerTaxId)}</Row>
        <Row label="買方名稱">{fmtText(data.buyerName)}</Row>
        <Row label="折讓金額(不含稅)">{fmtAmount(data.amount)}</Row>
        <Row label="折讓稅額">{fmtAmount(data.taxAmount)}</Row>
      </div>

      {items.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">
            品項明細
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>品名</TableHead>
                <TableHead className="text-right w-32">折讓金額</TableHead>
                <TableHead className="text-right w-32">折讓稅額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{fmtText(item.description)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtAmount(item.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtAmount(item.taxAmount)}
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
