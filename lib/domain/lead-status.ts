/**
 * Lead sales-pipeline statuses, in flow order. The values match the existing
 * `leads_status_check` DB constraint (`new`/`contacted`/`converted`) so no
 * migration is needed; only the display labels are pipeline-oriented.
 */
export const LEAD_STATUSES = ["new", "contacted", "converted"] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "新進",
  contacted: "進行中",
  converted: "已簽約",
};

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}
