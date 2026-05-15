import { cn, formatNTD } from "@/lib/utils";

interface AmountCellProps {
  amount: number;
  className?: string;
}

export function AmountCell({ amount, className }: AmountCellProps) {
  const isNegative = amount < 0;
  const display = isNegative
    ? `(${formatNTD(Math.abs(amount))})`
    : formatNTD(amount);
  return (
    <span
      className={cn(
        "font-mono text-base",
        isNegative && "text-destructive",
        className,
      )}
    >
      {display}
    </span>
  );
}
