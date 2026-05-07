"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { Allowance } from "@/lib/domain/models";

const DEFAULT_PAGE_SIZE = 50;

// Only the fields allowance-table.tsx renders. The review dialog re-fetches
// the full row on open, so list responses can omit the bulk of extracted_data.
const LIST_SELECT = `
  id, firm_id, client_id, tax_filing_period_id,
  storage_path, filename, in_or_out, status,
  allowance_serial_code, original_invoice_serial_code, original_invoice_id,
  uploaded_by, created_at,
  extracted_data->allowanceType,
  extracted_data->amount,
  extracted_data->taxAmount,
  extracted_data->date,
  extracted_data->source
` as const;

type ListRow = {
  id: string;
  firm_id: string;
  client_id: string | null;
  tax_filing_period_id: string | null;
  storage_path: string | null;
  filename: string | null;
  in_or_out: string;
  status: Allowance["status"];
  allowance_serial_code: string | null;
  original_invoice_serial_code: string | null;
  original_invoice_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  allowanceType: string | null;
  amount: number | null;
  taxAmount: number | null;
  date: string | null;
  source: string | null;
};

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
        .select(LIST_SELECT, { count: "exact" })
        .eq("client_id", clientId)
        .eq("tax_filing_period_id", periodId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (inOrOut) {
        query = query.eq("in_or_out", inOrOut);
      }

      query = query.range(start, end);

      const { data: rows, count, error } = await query;
      if (error) throw error;

      // Reshape projected JSONB keys back under extracted_data so the table
      // component reads allowance.extracted_data?.amount as before.
      const items = ((rows ?? []) as unknown as ListRow[]).map((row) => {
        const { allowanceType, amount, taxAmount, date, source, ...rest } = row;
        return {
          ...rest,
          extracted_data: { allowanceType, amount, taxAmount, date, source },
        };
      }) as unknown as Allowance[];

      return { items, count: count ?? 0 };
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
