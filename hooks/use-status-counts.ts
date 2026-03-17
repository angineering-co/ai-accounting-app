"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";

const STATUSES = [
  "uploaded",
  "processing",
  "processed",
  "confirmed",
  "failed",
] as const;

interface UseStatusCountsProps {
  table: "invoices" | "allowances";
  periodId: string | null;
  clientId?: string;
}

export function useStatusCounts({
  table,
  periodId,
  clientId,
}: UseStatusCountsProps) {
  const supabase = createClient();

  const { data: counts, isLoading, mutate } = useSWR(
    periodId ? ["status-counts", table, periodId, clientId] : null,
    async () => {
      if (!periodId) return null;

      const results = await Promise.all(
        STATUSES.map(async (status) => {
          let query = supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("tax_filing_period_id", periodId)
            .eq("status", status);

          if (table === "allowances" && clientId) {
            query = query.eq("client_id", clientId);
          }

          const { count } = await query;
          return [status, count ?? 0] as const;
        }),
      );

      const statusCounts: Record<string, number> = Object.fromEntries(results);
      statusCounts.all = Object.values(statusCounts).reduce((a, b) => a + b, 0);

      return statusCounts;
    },
    { keepPreviousData: true },
  );

  return { counts: counts ?? undefined, isLoading, mutate };
}
