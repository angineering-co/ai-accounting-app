"use server";

import { createClient } from "@/lib/supabase/server";
import { taxFilingPeriodSchema, type TaxFilingPeriod } from "@/lib/domain/models";

const STUCK_PROCESSING_THRESHOLD_MS = 10 * 60 * 1000;

export interface StuckOrFailedExtraction {
  kind: "invoice" | "allowance";
  id: string;
  client_id: string;
  client_name: string;
  year_month: string;
  filename: string;
  status: "failed" | "processing";
  created_at: Date;
}

type StuckOrFailedRow = {
  id: string;
  client_id: string | null;
  filename: string | null;
  status: string | null;
  created_at: string | null;
  client: { name: string };
  period: { year_month: string };
};

function toStuckOrFailed(
  rows: StuckOrFailedRow[],
  kind: "invoice" | "allowance",
): StuckOrFailedExtraction[] {
  return rows.flatMap((row) => {
    if (!row.client_id || !row.filename || !row.created_at || !row.status) return [];
    return [
      {
        kind,
        id: row.id,
        client_id: row.client_id,
        client_name: row.client.name,
        year_month: row.period.year_month,
        filename: row.filename,
        status: row.status as "failed" | "processing",
        created_at: new Date(row.created_at),
      },
    ];
  });
}

export async function listStuckOrFailedExtractions(
  firmId: string,
  opts: { stuckThresholdMs?: number } = {},
): Promise<StuckOrFailedExtraction[]> {
  const threshold = new Date(
    Date.now() - (opts.stuckThresholdMs ?? STUCK_PROCESSING_THRESHOLD_MS),
  ).toISOString();
  const orFilter = `status.eq.failed,and(status.eq.processing,created_at.lt.${threshold})`;

  const supabase = await createClient();
  const select =
    "id, client_id, filename, status, created_at, client:clients!inner(name), period:tax_filing_periods!inner(year_month)";

  const [invoicesRes, allowancesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(select)
      .eq("firm_id", firmId)
      .or(orFilter)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("allowances")
      .select(select)
      .eq("firm_id", firmId)
      .or(orFilter)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (invoicesRes.error) throw invoicesRes.error;
  if (allowancesRes.error) throw allowancesRes.error;

  return [
    ...toStuckOrFailed((invoicesRes.data ?? []) as StuckOrFailedRow[], "invoice"),
    ...toStuckOrFailed((allowancesRes.data ?? []) as StuckOrFailedRow[], "allowance"),
  ]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, 50);
}

export interface ClientPeriodUploadCounts {
  client_id: string;
  client_name: string;
  period: TaxFilingPeriod;
  invoice_count: number;
  allowance_count: number;
}

export async function getCurrentPeriodUploadCounts(
  firmId: string,
  currentYYYMM: string,
): Promise<ClientPeriodUploadCounts[]> {
  const supabase = await createClient();

  const periodsRes = await supabase
    .from("tax_filing_periods")
    .select("*, client:clients!inner(name)")
    .eq("firm_id", firmId)
    .eq("year_month", currentYYYMM);
  if (periodsRes.error) throw periodsRes.error;

  const periodRows = periodsRes.data ?? [];
  if (periodRows.length === 0) return [];
  const periodIds = periodRows.map((p) => p.id);

  const [invoicesRes, allowancesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("tax_filing_period_id")
      .in("tax_filing_period_id", periodIds),
    supabase
      .from("allowances")
      .select("tax_filing_period_id")
      .in("tax_filing_period_id", periodIds),
  ]);
  if (invoicesRes.error) throw invoicesRes.error;
  if (allowancesRes.error) throw allowancesRes.error;

  const counts = new Map<string, { i: number; a: number }>();
  for (const row of invoicesRes.data ?? []) {
    if (!row.tax_filing_period_id) continue;
    const entry = counts.get(row.tax_filing_period_id) ?? { i: 0, a: 0 };
    entry.i += 1;
    counts.set(row.tax_filing_period_id, entry);
  }
  for (const row of allowancesRes.data ?? []) {
    if (!row.tax_filing_period_id) continue;
    const entry = counts.get(row.tax_filing_period_id) ?? { i: 0, a: 0 };
    entry.a += 1;
    counts.set(row.tax_filing_period_id, entry);
  }

  return periodRows
    .map<ClientPeriodUploadCounts>((row) => {
      const c = counts.get(row.id) ?? { i: 0, a: 0 };
      return {
        client_id: row.client_id,
        client_name: row.client.name,
        period: taxFilingPeriodSchema.parse(row),
        invoice_count: c.i,
        allowance_count: c.a,
      };
    })
    .sort((a, b) => a.client_name.localeCompare(b.client_name, "zh-Hant"));
}
