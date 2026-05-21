#!/usr/bin/env npx tsx
/**
 * Phase 5.6 — copy every object from the `invoices` storage bucket into the
 * `documents` bucket, reordering keys to {firmId}/{clientId}/{periodYYYMM}/{file}.
 *
 * SAFETY: this script is purely additive. It NEVER deletes or mutates anything
 * in the `invoices` bucket — that bucket is retained as a complete fallback.
 * It is idempotent: objects already present in `documents` are skipped, so it
 * is safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/migrate-storage-to-documents.ts --dry-run   # list only
 *   npx tsx scripts/migrate-storage-to-documents.ts             # perform copy
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * To run against production, point those env vars at the prod project.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { toDocumentsKey } from "@/lib/storage/documents-key";

dotenv.config({ path: ".env.local" });

const SOURCE_BUCKET = "invoices";
const DEST_BUCKET = "documents";
const LIST_PAGE_SIZE = 1000;

const dryRun = process.argv.slice(2).includes("--dry-run");

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Recursively list every object key in a bucket. Folders have `id === null`. */
async function listAllObjects(
  supabase: SupabaseClient,
  bucket: string,
  prefix = "",
): Promise<string[]> {
  const keys: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset });
    if (error) {
      throw new Error(`list ${bucket}/${prefix} failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const entry of data) {
      // Supabase creates a hidden placeholder object for empty folders; it is
      // not a real upload and has no valid {firm}/{period}/{client}/{file} shape.
      if (entry.name === ".emptyFolderPlaceholder") continue;

      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        keys.push(...(await listAllObjects(supabase, bucket, fullPath)));
      } else {
        keys.push(fullPath);
      }
    }

    if (data.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return keys;
}

/** Copy one object across buckets, preserving content type. */
async function copyObject(
  supabase: SupabaseClient,
  srcKey: string,
  destKey: string,
): Promise<void> {
  const { error: copyError } = await supabase.storage
    .from(SOURCE_BUCKET)
    .copy(srcKey, destKey, { destinationBucket: DEST_BUCKET });
  if (!copyError) return;

  // Fallback: download from source, upload to destination.
  const { data: blob, error: dlError } = await supabase.storage
    .from(SOURCE_BUCKET)
    .download(srcKey);
  if (dlError || !blob) {
    throw new Error(
      `copy + download both failed for ${srcKey}: ${copyError.message}`,
    );
  }
  const { error: upError } = await supabase.storage
    .from(DEST_BUCKET)
    .upload(destKey, blob, {
      contentType: blob.type || undefined,
      upsert: false,
    });
  if (upError) {
    throw new Error(`upload fallback failed for ${destKey}: ${upError.message}`);
  }
}

async function main(): Promise<void> {
  const supabase = getClient();

  console.log(
    `[migrate-storage] mode: ${dryRun ? "DRY RUN" : "COPY"} — ${SOURCE_BUCKET} -> ${DEST_BUCKET}`,
  );

  const srcKeys = await listAllObjects(supabase, SOURCE_BUCKET);
  const existingDest = new Set(await listAllObjects(supabase, DEST_BUCKET));
  console.log(
    `[migrate-storage] ${srcKeys.length} object(s) in ${SOURCE_BUCKET}, ` +
      `${existingDest.size} already in ${DEST_BUCKET}`,
  );

  let copied = 0;
  let skipped = 0;
  const failures: { srcKey: string; reason: string }[] = [];

  for (const [index, srcKey] of srcKeys.entries()) {
    if (!dryRun && index > 0 && index % 100 === 0) {
      console.log(
        `[migrate-storage] progress: ${index}/${srcKeys.length} ` +
          `(copied ${copied}, skipped ${skipped}, failed ${failures.length})`,
      );
    }

    let destKey: string;
    try {
      destKey = toDocumentsKey(srcKey);
    } catch (err) {
      failures.push({ srcKey, reason: (err as Error).message });
      continue;
    }

    if (existingDest.has(destKey)) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  would copy: ${srcKey}  ->  ${destKey}`);
      copied++;
      continue;
    }

    try {
      await copyObject(supabase, srcKey, destKey);
      existingDest.add(destKey);
      copied++;
    } catch (err) {
      failures.push({ srcKey, reason: (err as Error).message });
    }
  }

  console.log(
    `[migrate-storage] ${dryRun ? "would copy" : "copied"}: ${copied}, ` +
      `skipped (already present): ${skipped}, failed: ${failures.length}`,
  );
  for (const f of failures) {
    console.error(`  FAILED ${f.srcKey}: ${f.reason}`);
  }

  if (dryRun) {
    if (failures.length > 0) process.exit(1);
    return;
  }

  // Verification pass: every source object must have a counterpart in `documents`.
  console.log("[migrate-storage] verifying parity...");
  const finalDest = new Set(await listAllObjects(supabase, DEST_BUCKET));
  const missing: string[] = [];
  for (const srcKey of srcKeys) {
    let destKey: string;
    try {
      destKey = toDocumentsKey(srcKey);
    } catch {
      missing.push(srcKey);
      continue;
    }
    if (!finalDest.has(destKey)) missing.push(srcKey);
  }

  if (missing.length > 0 || failures.length > 0) {
    console.error(
      `[migrate-storage] VERIFICATION FAILED — ${missing.length} object(s) ` +
        `missing in ${DEST_BUCKET}:`,
    );
    for (const key of missing) console.error(`  missing: ${key}`);
    process.exit(1);
  }

  console.log(
    `[migrate-storage] OK — all ${srcKeys.length} object(s) present in ${DEST_BUCKET}.`,
  );
}

main().catch((err) => {
  console.error("[migrate-storage] fatal:", err);
  process.exit(1);
});
