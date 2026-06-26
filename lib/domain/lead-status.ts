/**
 * Lead sales-pipeline statuses, in flow order. The DB `status` column is a
 * plain `text` column (no CHECK constraint), so adding a new status here is the
 * only change needed — values are validated at the app write site via
 * `isLeadStatus`.
 */
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "converted",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "新進",
  contacted: "進行中",
  converted: "已簽約",
  lost: "未成交",
};

/**
 * Tailwind classes used to colour-code the status in admin views, so the
 * pipeline stage is readable at a glance.
 */
export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-700",
  contacted: "border-amber-200 bg-amber-50 text-amber-700",
  converted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  lost: "border-rose-200 bg-rose-50 text-rose-700",
};

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}
