"use server";

import { createClient } from "@/lib/supabase/server";
import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database, type Json } from "@/supabase/database.types";
import {
  type CreateTaxFilingPeriodInput,
  type TaxFilingPeriod,
  type TaxFilingSummary,
  taxFilingPeriodSchema,
  TaxPeriodStatus,
} from "@/lib/domain/models";
import { RocPeriod } from "@/lib/domain/roc-period";
import { sendLineMessage } from "@/lib/services/line";
import { sanitizeFilenameForStorage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

const VAT_TAX_FILINGS_BUCKET = "vat-tax-filings";
const SIGNED_URL_TTL_SECONDS = 60;

// This is for testing purposes only
interface TaxPeriodServiceTestOptions {
  supabaseClient: SupabaseClient<Database>;
}

/**
 * Get a tax filing period for a client and year-month.
 */
export async function getTaxPeriodByYYYMM(
  clientId: string,
  yearMonth: string,
  options?: TaxPeriodServiceTestOptions
): Promise<TaxFilingPeriod | null> {
  const supabase = options ? options.supabaseClient : await createClient();
  const { data: existingPeriod, error: fetchError } = await supabase
    .from("tax_filing_periods")
    .select("*")
    .eq("client_id", clientId)
    .eq("year_month", yearMonth)
    .single();

  // don't throw error if period not found
  if (fetchError) {
    if (fetchError.code !== "PGRST116") {
      throw fetchError;
    }
    return null;
  }

  return taxFilingPeriodSchema.parse(existingPeriod);
}

/**
 * Creates a new tax period explicitly.
 */
export async function createTaxPeriod(
    clientId: string,
    yearMonth: string
): Promise<TaxFilingPeriod> {
    const supabase = await createClient();

    // Get firmId from client to ensure consistency
    const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("firm_id")
        .eq("id", clientId)
        .single();

    if (clientError || !client) {
        throw new Error("Client not found");
    }

    if (!client.firm_id) {
        throw new Error("Client is not associated with a firm");
    }

    const newInput: CreateTaxFilingPeriodInput = {
        firm_id: client.firm_id,
        client_id: clientId,
        year_month: yearMonth,
        status: "open",
    };

    const { data: newPeriod, error: createError } = await supabase
        .from("tax_filing_periods")
        .insert(newInput)
        .select()
        .single();

    if (createError) throw createError;
    return taxFilingPeriodSchema.parse(newPeriod);
}

export async function getTaxPeriods(clientId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tax_filing_periods")
    .select("*")
    .eq("client_id", clientId)
    .order("year_month", { ascending: false });

  if (error) throw error;
  return taxFilingPeriodSchema.array().parse(data);
}

export async function updateTaxPeriodStatus(
  periodId: string,
  status: TaxPeriodStatus
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tax_filing_periods")
    .update({ status })
    .eq("id", periodId)
    .select()
    .single();

  if (error) throw error;
  return taxFilingPeriodSchema.parse(data);
}

// TODO: use period_id instead of clientId + yearMonth to check period lock
export async function ensurePeriodEditable(
  clientId: string,
  yearMonth: string,
  errorMessage?: string
) {
  const period = await getTaxPeriodByYYYMM(clientId, yearMonth);
  if (period && (period.status === "locked" || period.status === "filed")) {
    throw new Error(errorMessage || "此期別已鎖定，無法進行變更。");
  }
}

// ===================================================================
// Filing closure: snapshots + attachments + filed status transitions.
// ===================================================================

function snapshotStorageKey(
  firmId: string,
  yearMonth: string,
  clientId: string,
  taxId: string,
  kind: "txt" | "tet_u",
): string {
  const ext = kind === "txt" ? "TXT" : "TET_U";
  const safeTaxId = sanitizeFilenameForStorage(taxId);
  return `${firmId}/${yearMonth}/${clientId}/${safeTaxId}.${ext}`;
}

function attachmentsFolder(
  firmId: string,
  yearMonth: string,
  clientId: string,
): string {
  return `${firmId}/${yearMonth}/${clientId}/attachments`;
}

function deriveAttachmentStorageKey(
  firmId: string,
  yearMonth: string,
  clientId: string,
  filename: string,
): string {
  // Always prefix with a fresh uuid so storage keys are unique even when two
  // different Unicode filenames sanitize to the same ASCII form. Dedup of
  // re-uploads of the SAME filename is handled by addFilingAttachment looking
  // up the existing entry by `filename` and reusing its path.
  const folder = attachmentsFolder(firmId, yearMonth, clientId);
  return `${folder}/${crypto.randomUUID()}_${sanitizeFilenameForStorage(filename)}`;
}

async function getClientTaxId(
  clientId: string,
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const { data, error } = await supabase
    .from("clients")
    .select("tax_id")
    .eq("id", clientId)
    .single();
  if (error || !data) throw new Error("找不到客戶");
  return data.tax_id;
}

async function getPeriodOrThrow(
  periodId: string,
  supabase: SupabaseClient<Database>,
): Promise<TaxFilingPeriod> {
  const { data, error } = await supabase
    .from("tax_filing_periods")
    .select("*")
    .eq("id", periodId)
    .single();
  if (error || !data) throw new Error("找不到此期別");
  return taxFilingPeriodSchema.parse(data);
}

async function updateFiling(
  periodId: string,
  filing: object,
  supabase: SupabaseClient<Database>,
  options?: { status?: TaxPeriodStatus },
): Promise<TaxFilingPeriod> {
  // JSON.parse(JSON.stringify(...)) normalizes Date → ISO string so the value
  // satisfies the Json column type (Date is not a JSON primitive).
  const update: { filing: Json; status?: TaxPeriodStatus } = {
    filing: JSON.parse(JSON.stringify(filing)) as Json,
  };
  if (options?.status) update.status = options.status;
  const { data, error } = await supabase
    .from("tax_filing_periods")
    .update(update)
    .eq("id", periodId)
    .select()
    .single();
  if (error) throw error;
  return taxFilingPeriodSchema.parse(data);
}

/**
 * Persists the latest .TXT / .TET_U content as a snapshot, overwriting the
 * previous file in storage and stamping filing.snapshots[kind].generated_at.
 * Called from report-generation actions on every successful generation so the
 * latest stored copy always matches what the admin downloaded last.
 */
interface SaveReportSnapshotOptions {
  supabaseClient?: SupabaseClient<Database>;
  period?: TaxFilingPeriod;
  // Headline figures from the .TET_U report; persisted alongside the snapshot
  // when kind === "tet_u" so the client portal can show a filed summary.
  summary?: TaxFilingSummary;
}

export async function saveReportSnapshot(
  clientId: string,
  yearMonth: string,
  taxId: string,
  kind: "txt" | "tet_u",
  content: string,
  options?: SaveReportSnapshotOptions,
): Promise<{ path: string; generatedAt: Date }> {
  const supabase = options?.supabaseClient ?? (await createClient());

  let period = options?.period ?? null;
  if (!period) {
    period = await getTaxPeriodByYYYMM(
      clientId,
      yearMonth,
      options?.supabaseClient ? { supabaseClient: options.supabaseClient } : undefined,
    );
  }
  if (!period) {
    period = await createTaxPeriod(clientId, yearMonth);
  }

  const path = snapshotStorageKey(
    period.firm_id,
    yearMonth,
    clientId,
    taxId,
    kind,
  );
  const { error: uploadError } = await supabase.storage
    .from(VAT_TAX_FILINGS_BUCKET)
    .upload(path, Buffer.from(content, "utf-8"), {
      contentType: "text/plain; charset=utf-8",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const generatedAt = new Date();
  const nextFiling = {
    ...period.filing,
    snapshots: {
      ...period.filing.snapshots,
      [kind]: { path, generated_at: generatedAt.toISOString() },
    },
    ...(kind === "tet_u" ? { summary: options?.summary } : {}),
  };

  await updateFiling(period.id, nextFiling, supabase);
  return { path, generatedAt };
}

/**
 * Uploads one or more PDF attachments and registers them under filing.attachments.
 * Dedup is keyed by filename — re-uploading the same filename overwrites the
 * existing storage object and updates that entry's uploaded_at in place.
 * Storage uploads happen in parallel; the row is updated once at the end.
 * Throws if the period is already 'filed'.
 *
 * formData must contain one or more entries with key "file".
 */
export async function addFilingAttachments(
  periodId: string,
  formData: FormData,
): Promise<TaxFilingPeriod> {
  const supabase = await createClient();
  const files = formData
    .getAll("file")
    .filter((v): v is File => v instanceof File);
  if (files.length === 0) throw new Error("缺少檔案");

  const period = await getPeriodOrThrow(periodId, supabase);
  if (period.status === "filed") {
    throw new Error("此期別已申報，請先取消申報再修改附件");
  }

  const existing = period.filing.attachments;
  const byFilename = new Map(existing.map((a) => [a.filename, a]));

  const uploads = files.map(async (file) => {
    const path =
      byFilename.get(file.name)?.path ??
      deriveAttachmentStorageKey(
        period.firm_id,
        period.year_month,
        period.client_id,
        file.name,
      );
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await supabase.storage
      .from(VAT_TAX_FILINGS_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/pdf",
        upsert: true,
      });
    if (error) throw error;
    return { path, filename: file.name };
  });

  const uploaded = await Promise.all(uploads);
  const uploadedAt = new Date().toISOString();

  // Merge: existing entries keep position; same-name re-uploads bump uploaded_at; new
  // entries append in upload order.
  const updated = new Map(byFilename);
  const appended: typeof existing = [];
  for (const u of uploaded) {
    if (updated.has(u.filename)) {
      const prev = updated.get(u.filename)!;
      updated.set(u.filename, { ...prev, uploaded_at: new Date(uploadedAt) });
    } else {
      appended.push({
        path: u.path,
        filename: u.filename,
        uploaded_at: new Date(uploadedAt),
      });
    }
  }
  const nextAttachments = [
    ...existing.map((a) => updated.get(a.filename) ?? a),
    ...appended,
  ];

  return await updateFiling(
    periodId,
    { ...period.filing, attachments: nextAttachments },
    supabase,
  );
}

/**
 * Removes an attachment by filename (deletes the storage object too).
 * Throws if the period is already 'filed'.
 */
export async function removeFilingAttachment(
  periodId: string,
  filename: string,
): Promise<TaxFilingPeriod> {
  const supabase = await createClient();
  const period = await getPeriodOrThrow(periodId, supabase);
  if (period.status === "filed") {
    throw new Error("此期別已申報，請先取消申報再修改附件");
  }

  const target = period.filing.attachments.find((a) => a.filename === filename);
  if (!target) return period;

  const { error: removeError } = await supabase.storage
    .from(VAT_TAX_FILINGS_BUCKET)
    .remove([target.path]);
  if (removeError) throw removeError;

  return await updateFiling(
    periodId,
    {
      ...period.filing,
      attachments: period.filing.attachments.filter(
        (a) => a.filename !== filename,
      ),
    },
    supabase,
  );
}

/**
 * Transitions a period to 'filed'. Both snapshots and at least one attachment
 * must be present. Sets filing.filed_at = now().
 */
export async function markPeriodAsFiled(
  periodId: string,
): Promise<TaxFilingPeriod> {
  const supabase = await createClient();
  const period = await getPeriodOrThrow(periodId, supabase);

  const filing = period.filing;
  if (!filing.snapshots.txt?.path || !filing.snapshots.tet_u?.path) {
    throw new Error("請先產生 .TXT 與 .TET_U 申報檔");
  }
  if (filing.attachments.length === 0) {
    throw new Error("請至少上傳一份國稅局申報附件");
  }

  const nextFiling = {
    ...filing,
    filed_at: new Date().toISOString(),
  };
  return await updateFiling(periodId, nextFiling, supabase, {
    status: "filed",
  });
}

/**
 * Reverses 'filed' to 'open'. Keeps snapshots + attachments so the audit trail
 * survives an unfile/refile cycle.
 */
export async function unfilePeriod(
  periodId: string,
): Promise<TaxFilingPeriod> {
  const supabase = await createClient();
  const period = await getPeriodOrThrow(periodId, supabase);
  if (period.status !== "filed") return period;

  const nextFiling = { ...period.filing };
  delete nextFiling.filed_at;

  return await updateFiling(periodId, nextFiling, supabase, {
    status: "open",
  });
}

/**
 * Short-lived signed URL for downloading an attachment by filename.
 */
export async function getFilingAttachmentSignedUrl(
  periodId: string,
  filename: string,
): Promise<string | null> {
  const supabase = await createClient();
  const period = await getPeriodOrThrow(periodId, supabase);
  const target = period.filing.attachments.find((a) => a.filename === filename);
  if (!target) return null;
  const { data, error } = await supabase.storage
    .from(VAT_TAX_FILINGS_BUCKET)
    .createSignedUrl(target.path, SIGNED_URL_TTL_SECONDS, {
      download: filename,
    });
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Idempotent: re-calling after the timestamp is set is a no-op (no re-ping).
 */
export async function markClientReady(
  periodId: string,
): Promise<TaxFilingPeriod> {
  const supabase = await createClient();
  const period = await getPeriodOrThrow(periodId, supabase);

  if (period.status === "locked" || period.status === "filed") {
    throw new Error("此期別已鎖定，無法通知。");
  }

  const rocPeriod = RocPeriod.fromYYYMM(period.year_month);
  if (Date.now() <= rocPeriod.endDate.getTime()) {
    throw new Error("本期尚未結束，請於期別結束後再通知事務所。");
  }

  if (period.client_ready_at) {
    return period;
  }

  const { data, error } = await supabase
    .from("tax_filing_periods")
    .update({ client_ready_at: new Date().toISOString() })
    .eq("id", periodId)
    .select()
    .single();
  if (error) throw error;
  const updated = taxFilingPeriodSchema.parse(data);

  after(async () => {
    try {
      const result = await sendLineMessage(
        period.client_id,
        `客戶已通知完成上傳 ${rocPeriod.format()} 申報期的發票與折讓單，事務所可開始審核。`,
      );
      if (!result.success) {
        console.warn("LINE notification failed:", result.error);
      }
    } catch (err) {
      console.warn("LINE notification threw:", err);
    }
  });

  revalidatePath(`/firm/${period.firm_id}/client/${period.client_id}`);
  revalidatePath(`/firm/${period.firm_id}/dashboard`);

  return updated;
}

export interface PeriodReadyForReview {
  period_id: string;
  client_id: string;
  client_name: string;
  year_month: string;
  client_ready_at: Date;
}

export async function listPeriodsReadyForReview(
  firmId: string,
): Promise<PeriodReadyForReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_filing_periods")
    .select("id, client_id, year_month, client_ready_at, client:clients!inner(name)")
    .eq("firm_id", firmId)
    .eq("status", "open")
    .not("client_ready_at", "is", null)
    .order("client_ready_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    period_id: row.id,
    client_id: row.client_id,
    client_name: row.client.name,
    year_month: row.year_month,
    client_ready_at: new Date(row.client_ready_at!),
  }));
}

/**
 * Short-lived signed URL for downloading a snapshot. The browser-facing
 * filename is the client's tax_id (e.g. "12345678.TXT") to match the format
 * the admin originally downloaded and uploaded to the IRS.
 */
export async function getSnapshotSignedUrl(
  periodId: string,
  kind: "txt" | "tet_u",
): Promise<string | null> {
  const supabase = await createClient();
  const period = await getPeriodOrThrow(periodId, supabase);
  const snapshot = period.filing.snapshots[kind];
  if (!snapshot) return null;
  const taxId = await getClientTaxId(period.client_id, supabase);
  const downloadName = `${taxId}.${kind === "txt" ? "TXT" : "TET_U"}`;
  const { data, error } = await supabase.storage
    .from(VAT_TAX_FILINGS_BUCKET)
    .createSignedUrl(snapshot.path, SIGNED_URL_TTL_SECONDS, {
      download: downloadName,
    });
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
