import { createClient } from "@/lib/supabase/client";

type SignedPreviewKey = `${string}:${string}`;

type SignedPreviewCacheEntry = {
  signedUrl: string;
  expiresAtMs: number;
};

type GetSignedPreviewUrlOptions = {
  bucketName: string;
  storagePath: string;
  expiresInSeconds: number;
  refreshBufferSeconds?: number;
};

const DEFAULT_REFRESH_BUFFER_SECONDS = 90;

const supabase = createClient();
const signedPreviewCache = new Map<SignedPreviewKey, SignedPreviewCacheEntry>();
const inflightSignedPreviewRequests = new Map<
  SignedPreviewKey,
  Promise<string | null>
>();

const buildSignedPreviewKey = (
  bucketName: string,
  storagePath: string,
): SignedPreviewKey => `${bucketName}:${storagePath}`;

const isEntryValid = (
  entry: SignedPreviewCacheEntry | undefined,
  refreshBufferSeconds: number,
) => {
  if (!entry) return false;
  return entry.expiresAtMs > Date.now() + refreshBufferSeconds * 1000;
};

export async function getSignedPreviewUrl({
  bucketName,
  storagePath,
  expiresInSeconds,
  refreshBufferSeconds = DEFAULT_REFRESH_BUFFER_SECONDS,
}: GetSignedPreviewUrlOptions): Promise<string | null> {
  const key = buildSignedPreviewKey(bucketName, storagePath);
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
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return null;
    }

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
