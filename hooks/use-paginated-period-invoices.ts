"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { Invoice } from "@/lib/domain/models";

const DEFAULT_PAGE_SIZE = 50;

// Only the fields invoice-table.tsx renders. The review dialog re-fetches the
// full row on open, so we can leave the heavy `extracted_data` JSONB out of
// list responses entirely.
const LIST_SELECT = `
  id, firm_id, client_id, tax_filing_period_id,
  storage_path, filename, in_or_out, status,
  invoice_serial_code, year_month, uploaded_by, created_at,
  extracted_data->invoiceType,
  extracted_data->totalSales,
  extracted_data->tax,
  extracted_data->date
` as const;

type ListRow = {
  id: string;
  firm_id: string;
  client_id: string | null;
  tax_filing_period_id: string | null;
  storage_path: string;
  filename: string;
  in_or_out: "in" | "out";
  status: Invoice["status"];
  invoice_serial_code: string | null;
  year_month: string | null;
  uploaded_by: string;
  created_at: string;
  invoiceType: string | null;
  totalSales: number | null;
  tax: number | null;
  date: string | null;
};

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
        .select(LIST_SELECT, { count: "exact" })
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
      // component reads invoice.extracted_data?.date as before.
      const items = ((rows ?? []) as unknown as ListRow[]).map((row) => {
        const { invoiceType, totalSales, tax, date, ...rest } = row;
        return {
          ...rest,
          extracted_data: { invoiceType, totalSales, tax, date },
        };
      }) as unknown as Invoice[];

      return { items, count: count ?? 0 };
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
