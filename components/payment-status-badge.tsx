import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ECPAY_PAYMENT_STATUSES,
  type EcpayPaymentStatus,
} from "@/lib/domain/models";

const STATUS_STYLES: Record<EcpayPaymentStatus, string> = {
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  expired: "border-slate-200 bg-slate-50 text-slate-600",
  refunded: "border-slate-200 bg-slate-50 text-slate-600",
};

const STATUS_LABELS: Record<EcpayPaymentStatus, string> = {
  paid: "已付款",
  pending: "待付款",
  failed: "付款失敗",
  expired: "已過期",
  refunded: "已退款",
};

function isStatus(value: string): value is EcpayPaymentStatus {
  return (ECPAY_PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key: EcpayPaymentStatus = isStatus(status) ? status : "pending";
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-3 py-1", STATUS_STYLES[key], className)}
    >
      {STATUS_LABELS[key]}
    </Badge>
  );
}
