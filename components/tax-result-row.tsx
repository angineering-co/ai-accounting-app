import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function TaxResultRow({
  label,
  value,
  sub,
  bold,
  muted,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  bold?: boolean;
  muted?: boolean;
  tooltip?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span
        className={
          bold
            ? "text-lg font-semibold text-slate-900"
            : muted
              ? "text-base text-slate-400"
              : "text-base text-slate-600"
        }
      >
        {label}
        {tooltip && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <CircleHelp className="ml-1.5 inline h-4 w-4 text-slate-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-sm leading-relaxed">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {sub && (
          <span className="ml-1.5 text-sm text-slate-400">({sub})</span>
        )}
      </span>
      <span
        className={
          bold
            ? "text-2xl font-bold text-emerald-600 font-mono"
            : muted
              ? "text-lg text-slate-400 font-mono"
              : "text-lg text-slate-700 font-mono"
        }
      >
        {value}
      </span>
    </div>
  );
}
