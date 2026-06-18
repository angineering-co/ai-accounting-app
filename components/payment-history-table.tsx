import { formatNTD, formatIsoDateTimeZhTW } from "@/lib/utils";
import {
  PAYMENT_LINK_TYPE_LABELS,
  type PaymentLinkType,
} from "@/lib/domain/models";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { CopyLinkButton } from "@/components/copy-link-button";
import { RefundPaymentButton } from "@/components/refund-payment-button";
import type { FirmPaymentRow } from "@/lib/services/payment-link";

function typeLabel(type: string): string {
  return PAYMENT_LINK_TYPE_LABELS[type as PaymentLinkType] ?? type;
}

export function PaymentHistoryTable({
  rows,
  baseUrl,
  firmId,
}: {
  rows: FirmPaymentRow[];
  baseUrl: string;
  firmId: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-base text-muted-foreground">
        尚無收款紀錄。點右上角「產生收款連結」開立第一筆。
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>客戶</TableHead>
            <TableHead>品項</TableHead>
            <TableHead>類型</TableHead>
            <TableHead className="text-right">金額</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead>建立時間</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-base">
                {row.client_name ?? "—"}
              </TableCell>
              <TableCell className="text-base">{row.description}</TableCell>
              <TableCell className="text-base">{typeLabel(row.type)}</TableCell>
              <TableCell className="text-right text-base tabular-nums">
                NT${formatNTD(row.amount)}
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <PaymentStatusBadge status={row.status} />
                  {row.status === "refunded" && row.refunded_at && (
                    <span className="text-sm text-muted-foreground">
                      退款於 {formatIsoDateTimeZhTW(row.refunded_at)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-base text-muted-foreground">
                {formatIsoDateTimeZhTW(row.created_at)}
              </TableCell>
              <TableCell className="text-right">
                {row.status === "pending" ? (
                  <CopyLinkButton url={`${baseUrl}/pay/${row.checkout_token}`} />
                ) : row.status === "paid" ? (
                  <RefundPaymentButton
                    firmId={firmId}
                    paymentId={row.id}
                    amount={row.amount}
                    description={row.description}
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
