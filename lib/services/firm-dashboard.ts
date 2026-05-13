"use server";

import { createClient } from "@/lib/supabase/server";

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
  invoice_count: number;
  allowance_count: number;
}

export async function getCurrentPeriodUploadCounts(
  firmId: string,
  currentYYYMM: string,
): Promise<ClientPeriodUploadCounts[]> {
  const supabase = await createClient();

  const [clientsRes, invoicesRes, allowancesRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("firm_id", firmId)
      .order("name", { ascending: true }),
    supabase
      .from("invoices")
      .select("client_id, period:tax_filing_periods!inner(year_month)")
      .eq("firm_id", firmId)
      .eq("tax_filing_periods.year_month", currentYYYMM),
    supabase
      .from("allowances")
      .select("client_id, period:tax_filing_periods!inner(year_month)")
      .eq("firm_id", firmId)
      .eq("tax_filing_periods.year_month", currentYYYMM),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (invoicesRes.error) throw invoicesRes.error;
  if (allowancesRes.error) throw allowancesRes.error;

  const counts = new Map<string, ClientPeriodUploadCounts>();
  for (const c of clientsRes.data ?? []) {
    counts.set(c.id, {
      client_id: c.id,
      client_name: c.name,
      invoice_count: 0,
      allowance_count: 0,
    });
  }

  for (const row of invoicesRes.data ?? []) {
    if (!row.client_id) continue;
    const entry = counts.get(row.client_id);
    if (entry) entry.invoice_count += 1;
  }

  for (const row of allowancesRes.data ?? []) {
    if (!row.client_id) continue;
    const entry = counts.get(row.client_id);
    if (entry) entry.allowance_count += 1;
  }

  return Array.from(counts.values());
}
