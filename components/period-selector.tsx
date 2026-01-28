import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RocPeriod } from "@/lib/domain/roc-period";

interface PeriodSelectorProps {
  value: RocPeriod;
  onChange: (value: RocPeriod) => void;
  disabled?: boolean;
}

const PERIODS = [
  { label: "01-02月", value: "01" },
  { label: "03-04月", value: "03" },
  { label: "05-06月", value: "05" },
  { label: "07-08月", value: "07" },
  { label: "09-10月", value: "09" },
  { label: "11-12月", value: "11" },
];

export function PeriodSelector({ value, onChange, disabled }: PeriodSelectorProps) {
  const handleYearChange = (newYear: string) => {
    onChange(new RocPeriod(parseInt(newYear, 10), value.startMonth));
  };

  const handlePeriodChange = (newMonth: string) => {
    onChange(new RocPeriod(value.rocYear, parseInt(newMonth, 10)));
  };

  // Generate a range of years (e.g., current year +/- 2 years)
  const currentROCYear = RocPeriod.now().rocYear;
  const years = Array.from({ length: 5 }, (_, i) =>
    (currentROCYear - 2 + i).toString()
  );

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Select value={value.rocYear.toString()} onValueChange={handleYearChange} disabled={disabled}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="年份" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                民國 {y} 年
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Select value={value.startMonth.toString().padStart(2, "0")} onValueChange={handlePeriodChange} disabled={disabled}>
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="期別" />
        </SelectTrigger>
        <SelectContent>
          {PERIODS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
