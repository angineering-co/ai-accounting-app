import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateToYYYYMMDD } from "@/lib/utils";
import { type TaxFilingPeriod, type TaxPeriodStatus } from "@/lib/domain/models";

interface PeriodStatusBadgeProps {
  period: TaxFilingPeriod;
  className?: string;
  showIcon?: boolean;
  showFiledDate?: boolean;
}

const STATUS_STYLES: Record<TaxPeriodStatus, string> = {
  filed: "border-indigo-200 bg-indigo-50 text-indigo-700",
  locked: "border-slate-200 bg-slate-50 text-slate-700",
  open: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const STATUS_LABELS: Record<TaxPeriodStatus, string> = {
  filed: "已申報",
  locked: "已鎖定",
  open: "進行中",
};

const STATUS_ICONS: Record<TaxPeriodStatus, typeof CheckCircle2> = {
  filed: CheckCircle2,
  locked: Lock,
  open: Unlock,
};

export function PeriodStatusBadge({
  period,
  className,
  showIcon = true,
  showFiledDate = false,
}: PeriodStatusBadgeProps) {
  const Icon = STATUS_ICONS[period.status];
  const label = STATUS_LABELS[period.status];
  const filedSuffix =
    showFiledDate && period.status === "filed" && period.filing.filed_at
      ? ` · ${formatDateToYYYYMMDD(new Date(period.filing.filed_at))}`
      : "";

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1",
        STATUS_STYLES[period.status],
        className,
      )}
    >
      <span className="flex items-center gap-1">
        {showIcon && <Icon className="h-3 w-3" />}
        {label}
        {filedSuffix}
      </span>
    </Badge>
  );
}
