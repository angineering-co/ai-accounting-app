"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { Allowance } from "@/lib/domain/models";

const DEFAULT_PAGE_SIZE = 50;

interface UsePaginatedPeriodAllowancesProps {
  periodId: string | null;
  clientId: string;
  statusFilter?: string;
  inOrOut?: "in" | "out";
  page?: number;
  pageSize?: number;
}

export function usePaginatedPeriodAllowances({
  periodId,
  clientId,
  statusFilter = "all",
  inOrOut,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: UsePaginatedPeriodAllowancesProps) {
  const supabase = createClient();
  const start = page * pageSize;
  const end = start + pageSize - 1;

  const { data, isLoading, mutate } = useSWR(
    periodId
      ? ["period-allowances", periodId, clientId, statusFilter, inOrOut ?? "all", page, pageSize]
      : null,
    async () => {
      if (!periodId) return { items: [], count: 0 };

      let query = supabase
        .from("allowances")
        .select("*", { count: "exact" })
        .eq("client_id", clientId)
        .eq("tax_filing_period_id", periodId)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (inOrOut) {
        query = query.eq("in_or_out", inOrOut);
      }

      query = query.range(start, end);

      const { data: rows, count, error } = await query;
      if (error) throw error;

      return {
        // Skip strict Zod validation — extracted_data may contain invalid AI-generated
        // values (e.g., hallucinated account names). Strict .parse() would throw and
        // break the table view, preventing users from correcting data in the review dialog.
        items: (rows || []) as unknown as Allowance[],
        count: count ?? 0,
      };
    },
    { keepPreviousData: true },
  );

  return {
    allowances: (data?.items ?? []) as Allowance[],
    totalCount: data?.count ?? 0,
    isLoading,
    mutate,
  };
}
