"use client";

import { endOfMonth, subMonths } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatDateToISO } from "@/lib/utils";
import { RocPeriod } from "@/lib/domain/roc-period";

// Demo fixture span — reviewers default to today (2026) which is outside the fake data
// range, so a one-click jump to the demo window is needed to see numbers populate.
const DEMO_FROM = "2026-01-01";
const DEMO_TO = "2026-03-31";

function todayISO(): string {
  return formatDateToISO(new Date());
}

function endOfPrevMonthISO(): string {
  return formatDateToISO(endOfMonth(subMonths(new Date(), 1)));
}

function endOfYearISO(year: number): string {
  return `${year}-12-31`;
}

function rangeForPeriod(p: RocPeriod): { from: string; to: string } {
  return {
    from: formatDateToISO(p.startDate),
    to: formatDateToISO(p.endDate),
  };
}

interface BaseProps {
  className?: string;
}

interface RangeProps extends BaseProps {
  mode: "range";
  fromDate: string;
  toDate: string;
  onChange: (next: { fromDate: string; toDate: string }) => void;
}

interface AsOfProps extends BaseProps {
  mode: "asOf";
  asOfDate: string;
  onChange: (next: { asOfDate: string }) => void;
}

export type ReportPeriodSelectorProps = RangeProps | AsOfProps;

export function ReportPeriodSelector(props: ReportPeriodSelectorProps) {
  if (props.mode === "range") return <RangeSelector {...props} />;
  return <AsOfSelector {...props} />;
}

function RangeSelector({ fromDate, toDate, onChange, className }: RangeProps) {
  const current = RocPeriod.getCurrentUnclosedPeriod();
  const prev = current.previousPeriod();
  const thisYear = new Date().getFullYear();
  const rocYear = thisYear - 1911;
  const rocPeriods = RocPeriod.getPeriodsForYear(rocYear);

  const setPeriod = (p: RocPeriod) => {
    const { from, to } = rangeForPeriod(p);
    onChange({ fromDate: from, toDate: to });
  };

  const setThisYear = () => {
    onChange({ fromDate: `${thisYear}-01-01`, toDate: todayISO() });
  };

  const setDemoRange = () => {
    onChange({ fromDate: DEMO_FROM, toDate: DEMO_TO });
  };

  const periodValue =
    rocPeriods.find((p) => {
      const r = rangeForPeriod(p);
      return r.from === fromDate && r.to === toDate;
    })?.toString() ?? "";

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-sm text-muted-foreground">起始日</label>
          <DatePickerInput
            value={fromDate}
            onChange={(v) => onChange({ fromDate: v, toDate })}
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">截止日</label>
          <DatePickerInput
            value={toDate}
            onChange={(v) => onChange({ fromDate, toDate: v })}
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">
            民國 {rocYear} 年雙月期快捷
          </label>
          <Select
            value={periodValue}
            onValueChange={(v) => {
              const p = rocPeriods.find((x) => x.toString() === v);
              if (p) setPeriod(p);
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="選擇期別" />
            </SelectTrigger>
            <SelectContent>
              {rocPeriods.map((p) => (
                <SelectItem key={p.toString()} value={p.toString()}>
                  {p.format()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setPeriod(current)}>
          本期({current.format()})
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPeriod(prev)}>
          上期({prev.format()})
        </Button>
        <Button size="sm" variant="outline" onClick={setThisYear}>
          本年度
        </Button>
        <Button size="sm" variant="link" onClick={setDemoRange}>
          套用示範資料期間(2026-01-01 至 2026-03-31)
        </Button>
      </div>
    </div>
  );
}

function AsOfSelector({ asOfDate, onChange, className }: AsOfProps) {
  const thisYear = new Date().getFullYear();
  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-muted-foreground">截止日</label>
          <DatePickerInput
            value={asOfDate}
            onChange={(v) => onChange({ asOfDate: v })}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ asOfDate: todayISO() })}
        >
          今日
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ asOfDate: endOfPrevMonthISO() })}
        >
          上月底
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ asOfDate: endOfYearISO(thisYear) })}
        >
          本年度底
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ asOfDate: endOfYearISO(thisYear - 1) })}
        >
          上年度底
        </Button>
        <Button
          size="sm"
          variant="link"
          onClick={() => onChange({ asOfDate: DEMO_TO })}
        >
          套用示範資料截止日(2026-03-31)
        </Button>
      </div>
    </div>
  );
}

function DatePickerInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start font-normal mt-1",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value || "（未選擇）"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? new Date(value) : undefined}
          onSelect={(d) => {
            if (d) onChange(formatDateToISO(d));
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
