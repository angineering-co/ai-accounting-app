"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { Invoice } from "@/lib/domain/models";

const DEFAULT_PAGE_SIZE = 50;

interface UsePaginatedPeriodInvoicesProps {
  periodId: string | null;
  statusFilter?: string;
  inOrOut?: "in" | "out";
  page?: number;
  pageSize?: number;
}

export function usePaginatedPeriodInvoices({
  periodId,
  statusFilter = "all",
  inOrOut,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: UsePaginatedPeriodInvoicesProps) {
  const supabase = createClient();
  const start = page * pageSize;
  const end = start + pageSize - 1;

  const { data, isLoading, mutate } = useSWR(
    periodId
      ? ["period-invoices", periodId, statusFilter, inOrOut ?? "all", page, pageSize]
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
