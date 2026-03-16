"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { Invoice } from "@/lib/domain/models";

const DEFAULT_PAGE_SIZE = 50;

interface UsePaginatedPeriodInvoicesProps {
  periodId: string | null;
  statusFilter?: string;
  page?: number;
  pageSize?: number;
}

export function usePaginatedPeriodInvoices({
  periodId,
  statusFilter = "all",
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: UsePaginatedPeriodInvoicesProps) {
  const supabase = createClient();
  const start = page * pageSize;
  const end = start + pageSize - 1;

  const { data, isLoading, mutate } = useSWR(
    periodId
      ? ["period-invoices", periodId, statusFilter, page, pageSize]
      : null,
    async () => {
      if (!periodId) return { items: [], count: 0 };

      let query = supabase
        .from("invoices")
        .select("*", { count: "exact" })
        .eq("tax_filing_period_id", periodId)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      query = query.range(start, end);

      const { data: rows, count, error } = await query;
      if (error) throw error;

      return {
        items: (rows || []) as unknown as Invoice[],
        count: count ?? 0,
      };
    },
    { keepPreviousData: true },
  );

  return {
    invoices: (data?.items ?? []) as Invoice[],
    totalCount: data?.count ?? 0,
    isLoading,
    mutate,
  };
}
