"use client";

import { createClient } from "@/lib/supabase/client";

type SignedPreviewCacheEntry = {
  signedUrl: string;
  expiresAtMs: number;
};

// Mirrors TransformOptions from @supabase/storage-js (transitive dep, not safe to import directly)
type ImageTransformOptions = {
  width?: number;
  height?: number;
  resize?: "cover" | "contain" | "fill";
  quality?: number;
  format?: "origin";
};

type GetSignedPreviewUrlOptions = {
  bucketName: string;
  storagePath: string;
  expiresInSeconds: number;
  refreshBufferSeconds?: number;
  transform?: ImageTransformOptions;
};

const DEFAULT_REFRESH_BUFFER_SECONDS = 90;

const supabase = createClient();
export const THUMBNAIL_TRANSFORM: ImageTransformOptions = {
  width: 128,
  height: 96,
  resize: "cover",
} as const;

export const QUEUE_PREVIEW_TRANSFORM: ImageTransformOptions = {
  width: 400,
  height: 400,
  resize: "contain",
} as const;

const signedPreviewCache = new Map<string, SignedPreviewCacheEntry>();
const inflightSignedPreviewRequests = new Map<
  string,
  Promise<string | null>
>();

const buildSignedPreviewKey = (
  bucketName: string,
  storagePath: string,
  transform?: ImageTransformOptions,
): string => {
  const base = `${bucketName}:${storagePath}`;
  if (!transform) return base;
  return `${base}:${JSON.stringify(transform, Object.keys(transform).sort())}`;
};

const isEntryValid = (
  entry: SignedPreviewCacheEntry | undefined,
  refreshBufferSeconds: number,
) => {
  if (!entry) return false;
  return entry.expiresAtMs > Date.now() + refreshBufferSeconds * 1000;
};

const evictExpiredEntries = () => {
  const now = Date.now();
  for (const [key, entry] of signedPreviewCache) {
    if (entry.expiresAtMs <= now) {
      signedPreviewCache.delete(key);
    }
  }
};

export async function getSignedPreviewUrl({
  bucketName,
  storagePath,
  expiresInSeconds,
  refreshBufferSeconds = DEFAULT_REFRESH_BUFFER_SECONDS,
  transform,
}: GetSignedPreviewUrlOptions): Promise<string | null> {
  const key = buildSignedPreviewKey(bucketName, storagePath, transform);
  const cachedEntry = signedPreviewCache.get(key);

  if (cachedEntry && isEntryValid(cachedEntry, refreshBufferSeconds)) {
    return cachedEntry.signedUrl;
  }

  const inflightRequest = inflightSignedPreviewRequests.get(key);
  if (inflightRequest) {
    return inflightRequest;
  }

  const request = (async () => {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(
        storagePath,
        expiresInSeconds,
        transform ? { transform } : undefined,
      );

    if (error || !data?.signedUrl) {
      return null;
    }

    evictExpiredEntries();

    signedPreviewCache.set(key, {
      signedUrl: data.signedUrl,
      expiresAtMs: Date.now() + expiresInSeconds * 1000,
    });

    return data.signedUrl;
  })();

  inflightSignedPreviewRequests.set(key, request);

  try {
    return await request;
  } finally {
    inflightSignedPreviewRequests.delete(key);
  }
}
