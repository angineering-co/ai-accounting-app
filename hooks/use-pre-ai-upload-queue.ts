"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  useInfiniteQuery,
  type SupabaseQueryHandler,
} from "@/hooks/use-infinite-query";
import type { Database } from "@/supabase/database.types";

type UploadQueueType = "invoice" | "allowance";
type UploadQueueTableName = "invoices" | "allowances";
type QueueRow = Database["public"]["Tables"]["invoices"]["Row"] &
  Database["public"]["Tables"]["allowances"]["Row"];

const PRE_AI_STATUSES = ["uploaded", "processing"] as const;

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "heic",
  "heif",
]);

const isImageFilename = (filename: string | null | undefined) => {
  if (!filename) return false;
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
};

const getTableName = (type: UploadQueueType) =>
  type === "invoice" ? "invoices" : "allowances";

export type PreAiQueueItem = {
  id: string;
  filename: string;
  storagePath: string;
  status: "uploaded" | "processing";
  createdAt: string;
  previewUrl: string | null;
};

type UsePreAiUploadQueueOptions = {
  periodId: string;
  inOrOut: "in" | "out";
  type: UploadQueueType;
  pageSize?: number;
};

export function usePreAiUploadQueue({
  periodId,
  inOrOut,
  type,
  pageSize = 12,
}: UsePreAiUploadQueueOptions) {
  const supabase = createSupabaseClient();
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const tableName = getTableName(type) as UploadQueueTableName;

  const trailingQuery = useCallback<SupabaseQueryHandler<UploadQueueTableName>>(
    (query) =>
      query
        .eq("tax_filing_period_id", periodId)
        .eq("in_or_out", inOrOut)
        .in("status", PRE_AI_STATUSES)
        .order("created_at", { ascending: false }),
    [periodId, inOrOut],
  );

  const {
    data,
    error,
    hasMore,
    isLoading,
    isFetching,
    fetchNextPage,
    refresh,
  } = useInfiniteQuery<QueueRow, UploadQueueTableName>({
    tableName,
    columns: "id, filename, storage_path, status, created_at, in_or_out, tax_filing_period_id",
    pageSize,
    trailingQuery,
  });

  const queueRows = useMemo(
    () =>
      data.filter(
        (row) =>
          !!row.id &&
          !!row.filename &&
          !!row.storage_path &&
          !!row.created_at &&
          (row.status === "uploaded" || row.status === "processing"),
      ),
    [data],
  );

  useEffect(() => {
    const missingPreviewRows = queueRows.filter(
      (row) =>
        !!row.id &&
        !!row.filename &&
        !!row.storage_path &&
        isImageFilename(row.filename) &&
        !previewUrls[row.id],
    );

    if (missingPreviewRows.length === 0) {
      return;
    }

    let mounted = true;

    const loadPreviews = async () => {
      const results = await Promise.all(
        missingPreviewRows.map(async (row) => {
          const { data: signedData, error: signedError } = await supabase.storage
            .from("invoices")
            .createSignedUrl(row.storage_path!, 60 * 30);

          if (signedError || !signedData?.signedUrl) {
            return { id: row.id, url: null as string | null };
          }

          return { id: row.id, url: signedData.signedUrl };
        }),
      );

      if (!mounted) return;

      setPreviewUrls((prev) => {
        const next = { ...prev };
        for (const result of results) {
          if (result.url) {
            next[result.id] = result.url;
          }
        }
        return next;
      });
    };

    void loadPreviews();

    return () => {
      mounted = false;
    };
  }, [queueRows, previewUrls, supabase]);

  const items = useMemo(
    () =>
      queueRows.map((row) => ({
        id: row.id,
        filename: row.filename!,
        storagePath: row.storage_path!,
        status: row.status as "uploaded" | "processing",
        createdAt: row.created_at!,
        previewUrl: previewUrls[row.id] ?? null,
      })),
    [queueRows, previewUrls],
  );

  return {
    items,
    pageSize,
    hasMore,
    error,
    isLoading,
    isLoadingMore: isFetching,
    fetchNextPage,
    refresh,
  };
}
