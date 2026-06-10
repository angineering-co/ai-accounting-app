"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/supabase/database.types";

export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

const DEFAULT_PAGE_SIZE = 24;

interface UseOtherDocumentsProps {
  clientId: string | null;
  page?: number;
  pageSize?: number;
}

// Lists active `doc_type='other'` documents for a client, newest first. Mirrors
// the `usePaginatedPeriodInvoices` SWR shape. RLS confines rows to the caller's
// firm; the explicit client_id filter + the proxy's portal guard scope it further.
export function useOtherDocuments({
  clientId,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseOtherDocumentsProps) {
  const supabase = createClient();
  const start = page * pageSize;
  const end = start + pageSize - 1;

  const { data, isLoading, mutate } = useSWR(
    clientId ? ["other-documents", clientId, page, pageSize] : null,
    async () => {
      if (!clientId) return { items: [], count: 0 };

      const { data: rows, count, error } = await supabase
        .from("documents")
        .select("*", { count: "exact" })
        .eq("client_id", clientId)
        .eq("doc_type", "other")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(start, end);

      if (error) throw error;

      return { items: (rows ?? []) as DocumentRow[], count: count ?? 0 };
    },
    { keepPreviousData: true },
  );

  return {
    documents: data?.items ?? [],
    totalCount: data?.count ?? 0,
    isLoading,
    mutate,
  };
}
