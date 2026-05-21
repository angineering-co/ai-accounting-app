// Deno copy of lib/storage/documents-key.ts — the edge function cannot import
// from the Next.js `lib/` tree. Keep the two in sync. See that file for details.

const PERIOD_SEGMENT = /^\d{5}$/;

export function toDocumentsKey(storagePath: string): string {
  const segments = storagePath.split("/");
  if (segments.length !== 4) {
    throw new Error(
      `Unexpected storage_path shape (expected 4 segments): "${storagePath}"`,
    );
  }

  const [firmId, second, third, filename] = segments;
  const secondIsPeriod = PERIOD_SEGMENT.test(second);
  const thirdIsPeriod = PERIOD_SEGMENT.test(third);

  if (secondIsPeriod === thirdIsPeriod) {
    throw new Error(
      `Cannot identify the period segment in storage_path: "${storagePath}"`,
    );
  }

  const periodYYYMM = secondIsPeriod ? second : third;
  const clientId = secondIsPeriod ? third : second;

  return `${firmId}/${clientId}/${periodYYYMM}/${filename}`;
}
