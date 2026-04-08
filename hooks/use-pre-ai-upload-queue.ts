"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  type SupabaseQueryHandler,
} from "@/hooks/use-infinite-query";
import {
  getSignedPreviewUrl,
  QUEUE_PREVIEW_TRANSFORM,
} from "@/lib/supabase/signed-preview-url-cache";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import type { Database } from "@/supabase/database.types";

type UploadQueueType = "invoice" | "allowance";
type UploadQueueTableName = "invoices" | "allowances";
type QueueRow = Database["public"]["Tables"]["invoices"]["Row"] &
  Database["public"]["Tables"]["allowances"]["Row"];

const PRE_AI_STATUSES = ["uploaded", "processing"] as const;
const PREVIEW_SIGNING_CONCURRENCY = 6;

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
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef(previewUrls);
  previewUrlsRef.current = previewUrls;

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
        !previewUrlsRef.current[row.id],
    );

    if (missingPreviewRows.length === 0) {
      return;
    }

    let mounted = true;

    const loadPreviews = async () => {
      const results = await mapWithConcurrency(
        missingPreviewRows,
        PREVIEW_SIGNING_CONCURRENCY,
        async (row) => {
          const signedUrl = await getSignedPreviewUrl({
            bucketName: "invoices",
            storagePath: row.storage_path!,
            expiresInSeconds: 60 * 30,
            transform: QUEUE_PREVIEW_TRANSFORM,
          });

          return { id: row.id, url: signedUrl };
        },
      );

      if (!mounted) return;

      setPreviewUrls((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const result of results) {
          if (result.url && !next[result.id]) {
            next[result.id] = result.url;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    void loadPreviews();

    return () => {
      mounted = false;
    };
  }, [queueRows]);

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
