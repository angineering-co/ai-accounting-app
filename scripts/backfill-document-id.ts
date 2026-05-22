#!/usr/bin/env npx tsx
/**
 * Phase 6a — backfill a `documents` parent row for every legacy invoice /
 * allowance created before Phase 5.5 (those rows have `document_id IS NULL`).
 *
 * Idempotent at two levels. A clean re-run only sees rows still missing a
 * document (`document_id IS NULL`). And each document's id is derived
 * deterministically from its source row id, so a crash between inserting the
 * document and writing the link back is fully recoverable: the retry computes
 * the same id, its insert conflicts on the primary key (no duplicate), and the
 * link is rewritten. No orphan `documents` rows.
 *
 * Usage:
 *   npx tsx scripts/backfill-document-id.ts --dry-run   # report only
 *   npx tsx scripts/backfill-document-id.ts             # perform backfill
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * To run against production, point those env vars at the prod project.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import type { Database } from "@/supabase/database.types";

dotenv.config({ path: ".env.local" });

const PAGE_SIZE = 500;

// Fixed namespace for the UUIDv5 that derives a document id from its source row
// id. Stable forever — changing it would break crash-recovery idempotency.
const BACKFILL_NAMESPACE = "5f6b8d2e-1a3c-4e7f-9b0d-2c4a6e8f0b1d";

/** RFC 4122 UUIDv5 (SHA-1, name-based). */
function uuidv5(name: string, namespace: string): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const bytes = createHash("sha1")
    .update(nsBytes)
    .update(Buffer.from(name, "utf8"))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The `documents` id for a source row, derived from the row's own id. Stable
 * across retries — a crashed run's re-insert conflicts on the PK instead of
 * creating an orphan.
 */
function deterministicDocumentId(sourceRowId: string): string {
  return uuidv5(sourceRowId, BACKFILL_NAMESPACE);
}

type Client = SupabaseClient<Database>;
type SourceTable = "invoices" | "allowances";
type DocType = "invoice" | "allowance";

interface SourceRow {
  id: string;
  firm_id: string;
  client_id: string | null;
  storage_path: string | null;
  status: string | null;
  extracted_data: unknown;
  created_at: string | null;
  uploaded_by: string | null;
}

export interface BackfillResult {
  /** Source rows that got a `documents` parent + `document_id` link. */
  done: number;
  /** Source rows that could not be backfilled (see `failures`). */
  failed: number;
  /** Source rows still `document_id IS NULL` after the run (verification). */
  remaining: number;
  failures: { table: SourceTable; rowId: string; reason: string }[];
}

const SELECT_COLS =
  "id, firm_id, client_id, storage_path, status, extracted_data, created_at, uploaded_by";

/** Map an invoice/allowance status onto the document OCR lifecycle. */
function deriveOcrStatus(status: string | null): "done" | "pending" | "failed" {
  if (status === "processed" || status === "confirmed") return "done";
  if (status === "failed") return "failed";
  return "pending";
}

/**
 * `extracted_data.date` is "YYYY/MM/DD". Convert to a valid "YYYY-MM-DD"; on a
 * missing or malformed value, fall back to the date part of `created_at`.
 */
function parseDocDate(raw: unknown, createdAt: string | null): string {
  if (typeof raw === "string") {
    const m = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (m) {
      const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      // Parse as local midnight and validate with local getters — appending
      // T00:00:00 keeps parse and read on the same timezone basis, so a
      // rollover (e.g. 2026/02/30) is reliably rejected.
      const parsed = new Date(`${iso}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        const yy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, "0");
        const dd = String(parsed.getDate()).padStart(2, "0");
        if (`${yy}-${mm}-${dd}` === iso) return iso;
      }
    }
  }
  return (createdAt ?? new Date().toISOString()).slice(0, 10);
}

/** Document `amount`: invoice total, or allowance net + tax. Null when absent. */
function computeAmount(
  docType: DocType,
  ed: Record<string, unknown>,
): number | null {
  if (docType === "invoice") {
    return typeof ed.totalAmount === "number" ? Math.round(ed.totalAmount) : null;
  }
  const net = typeof ed.amount === "number" ? ed.amount : undefined;
  const tax = typeof ed.taxAmount === "number" ? ed.taxAmount : undefined;
  if (net === undefined && tax === undefined) return null;
  return Math.round((net ?? 0) + (tax ?? 0));
}

/** Earliest-created profile of a firm — fallback creator for NULL uploaded_by. */
async function firmEarliestProfile(
  supabase: Client,
  firmId: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const cached = cache.get(firmId);
  if (cached !== undefined) return cached;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("firm_id", firmId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const id = data?.id ?? null;
  cache.set(firmId, id);
  return id;
}

async function buildDocumentPayload(
  supabase: Client,
  docType: DocType,
  row: SourceRow,
  cache: Map<string, string | null>,
): Promise<Database["public"]["Tables"]["documents"]["Insert"]> {
  if (!row.client_id) {
    throw new Error("source row has no client_id — cannot create a document");
  }

  const createdBy =
    row.uploaded_by ?? (await firmEarliestProfile(supabase, row.firm_id, cache));
  if (!createdBy) {
    throw new Error(
      "no uploaded_by and the firm has no profile to use as created_by",
    );
  }

  const ed = (row.extracted_data ?? {}) as Record<string, unknown>;

  return {
    firm_id: row.firm_id,
    client_id: row.client_id,
    doc_date: parseDocDate(ed.date, row.created_at),
    type: "VAT",
    doc_type: docType,
    file_url: row.storage_path ?? null,
    ocr_status: deriveOcrStatus(row.status),
    amount: computeAmount(docType, ed),
    status: "active",
    created_by: createdBy,
    created_at: row.created_at ?? undefined,
  };
}

async function backfillRow(
  supabase: Client,
  table: SourceTable,
  docType: DocType,
  row: SourceRow,
  cache: Map<string, string | null>,
  dryRun: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const docId = deterministicDocumentId(row.id);
    const payload = await buildDocumentPayload(supabase, docType, row, cache);
    if (dryRun) return { ok: true };

    // ON CONFLICT (id) DO NOTHING — a re-run after a crash hits the same id and
    // is a no-op rather than creating a duplicate.
    const { error: upsertError } = await supabase
      .from("documents")
      .upsert({ ...payload, id: docId }, { onConflict: "id", ignoreDuplicates: true });
    if (upsertError) throw upsertError;

    const { error: linkError } = await supabase
      .from(table)
      .update({ document_id: docId })
      .eq("id", row.id);
    if (linkError) throw linkError;

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function countNullDocumentId(
  supabase: Client,
  table: SourceTable,
  clientId: string | undefined,
): Promise<number> {
  const base = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .is("document_id", null);
  const { count, error } = await (clientId
    ? base.eq("client_id", clientId)
    : base);
  if (error) throw error;
  return count ?? 0;
}

async function backfillTable(
  supabase: Client,
  table: SourceTable,
  docType: DocType,
  result: BackfillResult,
  cache: Map<string, string | null>,
  dryRun: boolean,
  clientId: string | undefined,
  log: (msg: string) => void,
): Promise<void> {
  let offset = 0;
  let tableDone = 0;
  let tableFailures = 0;

  for (;;) {
    const base = supabase
      .from(table)
      .select(SELECT_COLS)
      .is("document_id", null);
    const { data, error } = await (clientId
      ? base.eq("client_id", clientId)
      : base
    )
      // `id` tiebreaker keeps pagination deterministic — `created_at` alone is
      // non-unique, which can skip or repeat rows across page boundaries.
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as SourceRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const outcome = await backfillRow(supabase, table, docType, row, cache, dryRun);
      if (outcome.ok) {
        result.done++;
        tableDone++;
      } else {
        result.failed++;
        tableFailures++;
        result.failures.push({ table, rowId: row.id, reason: outcome.reason });
      }
      if ((tableDone + tableFailures) % 100 === 0) {
        log(`[backfill] ${table}: ${tableDone} done, ${tableFailures} failed so far`);
      }
    }

    log(`[backfill] ${table}: ${tableDone} done, ${tableFailures} failed so far`);

    if (rows.length < PAGE_SIZE) break;

    // A real run drops succeeded rows out of the `document_id IS NULL` set, so
    // the next page starts after the failed rows that stay at the front. A dry
    // run mutates nothing, so it must advance by the full page instead.
    offset = dryRun ? offset + rows.length : tableFailures;
  }
}

export async function backfillDocumentIds(
  supabase: Client,
  opts: {
    dryRun?: boolean;
    /** Limit the scan to one client. Unscoped (global) when omitted. */
    clientId?: string;
    log?: (msg: string) => void;
  } = {},
): Promise<BackfillResult> {
  const dryRun = opts.dryRun ?? false;
  const clientId = opts.clientId;
  const log = opts.log ?? (() => {});
  const result: BackfillResult = { done: 0, failed: 0, remaining: 0, failures: [] };
  const profileCache = new Map<string, string | null>();

  await backfillTable(supabase, "invoices", "invoice", result, profileCache, dryRun, clientId, log);
  await backfillTable(supabase, "allowances", "allowance", result, profileCache, dryRun, clientId, log);

  result.remaining =
    (await countNullDocumentId(supabase, "invoices", clientId)) +
    (await countNullDocumentId(supabase, "allowances", clientId));

  return result;
}

async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes("--dry-run");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`[backfill] mode: ${dryRun ? "DRY RUN" : "BACKFILL"}`);

  const result = await backfillDocumentIds(supabase, {
    dryRun,
    log: (msg) => console.log(msg),
  });

  console.log(
    `[backfill] ${dryRun ? "would backfill" : "backfilled"}: ${result.done}, ` +
      `failed: ${result.failed}, remaining NULL document_id: ${result.remaining}`,
  );
  for (const f of result.failures) {
    console.error(`  FAILED ${f.table} ${f.rowId}: ${f.reason}`);
  }

  if (result.failed > 0 || (!dryRun && result.remaining > 0)) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[backfill] fatal:", err);
    process.exit(1);
  });
}
