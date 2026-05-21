/**
 * Maps a stored `storage_path` to its physical key in the `documents` bucket.
 *
 * Phase 5.6 moved files from the `invoices` bucket (key layout
 * `{firmId}/{periodYYYMM}/{clientId}/{file}`) to the `documents` bucket with the
 * key layout `{firmId}/{clientId}/{periodYYYMM}/{file}`. The DB `storage_path`
 * column is intentionally NOT rewritten during Phase 5.6, so old rows still hold
 * the old layout. This helper bridges the gap at read time.
 *
 * It is idempotent: a path already in the new layout maps to itself, because the
 * period segment is the 5-digit numeric one and the clientId segment is a UUID,
 * so the two are always distinguishable regardless of input order.
 */

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
