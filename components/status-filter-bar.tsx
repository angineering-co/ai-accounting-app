"use client";

import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  {
    value: "all",
    label: "全部",
    activeClass: "border-slate-400 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
    dotClass: "",
  },
  {
    value: "uploaded",
    label: "已上傳",
    activeClass: "border-slate-400 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
    dotClass: "bg-slate-500",
  },
  {
    value: "processing",
    label: "處理中",
    activeClass: "border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-100",
    dotClass: "bg-blue-500",
  },
  {
    value: "processed",
    label: "待確認",
    activeClass: "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100",
    dotClass: "bg-amber-500",
  },
  {
    value: "confirmed",
    label: "已確認",
    activeClass: "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-100",
    dotClass: "bg-emerald-500",
  },
  {
    value: "failed",
    label: "失敗",
    activeClass: "border-rose-400 bg-rose-50 text-rose-900 dark:border-rose-600 dark:bg-rose-950 dark:text-rose-100",
    dotClass: "bg-rose-500",
  },
] as const;

interface StatusFilterBarProps {
  activeStatus: string;
  onStatusChange: (status: string) => void;
  counts?: Record<string, number>;
}

export function StatusFilterBar({
  activeStatus,
  onStatusChange,
  counts,
}: StatusFilterBarProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {STATUS_OPTIONS.map((option) => {
        const isActive = activeStatus === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onStatusChange(option.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              isActive
                ? option.activeClass
                : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option.dotClass && (
              <span className={cn("h-1.5 w-1.5 rounded-full", option.dotClass)} />
            )}
            {option.label}
            {counts?.[option.value] != null && (
              <span className="ml-0.5 tabular-nums opacity-70">
                ({counts[option.value]})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
