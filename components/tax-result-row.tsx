export function TaxResultRow({
  label,
  value,
  sub,
  bold,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  bold?: boolean;
  muted?: boolean;
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
