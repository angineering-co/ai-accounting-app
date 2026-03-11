'use server';

import { createClient } from "@/lib/supabase/server";

interface BulkEnqueueResult {
  enqueuedCount: number;
}

interface BulkExtractionProgress {
  total: number;
  uploaded: number;
  processing: number;
  processed: number;
  confirmed: number;
  failed: number;
}

/**
 * Bulk enqueue all unprocessed invoices and allowances in a filing period for AI extraction.
 *
 * Idempotency: Sets eligible entities to 'processing' before enqueuing.
 * Re-clicking only picks up newly uploaded or newly failed items.
 */
export async function bulkEnqueueExtractionAction(
  periodId: string,
): Promise<BulkEnqueueResult> {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch period to validate it's editable
  const { data: period, error: periodError } = await supabase
    .from("tax_filing_periods")
    .select("id, firm_id, client_id, status")
    .eq("id", periodId)
    .single();

  if (periodError) throw periodError;
  if (!period) throw new Error("Period not found");

  if (period.status === "locked" || period.status === "filed") {
    throw new Error("此期別已鎖定，無法進行 AI 提取。");
  }

  // Find eligible invoices (uploaded or failed)
  const { data: eligibleInvoices, error: invoiceError } = await supabase
    .from("invoices")
    .select("id")
    .eq("tax_filing_period_id", periodId)
    .in("status", ["uploaded", "failed"]);

  if (invoiceError) throw invoiceError;

  // Find eligible allowances (uploaded or failed, with storage_path for paper allowances)
  const { data: eligibleAllowances, error: allowanceError } = await supabase
    .from("allowances")
    .select("id")
    .eq("tax_filing_period_id", periodId)
    .in("status", ["uploaded", "failed"]);

  if (allowanceError) throw allowanceError;

  const invoiceIds = (eligibleInvoices || []).map((inv) => inv.id);
  const allowanceIds = (eligibleAllowances || []).map((a) => a.id);

  const totalCount = invoiceIds.length + allowanceIds.length;
  if (totalCount === 0) {
    return { enqueuedCount: 0 };
  }

  // Idempotency guard: set status to 'processing' before enqueuing
  if (invoiceIds.length > 0) {
    const { error: updateInvErr } = await supabase
      .from("invoices")
      .update({ status: "processing" })
      .in("id", invoiceIds);
    if (updateInvErr) throw updateInvErr;
  }

  if (allowanceIds.length > 0) {
    const { error: updateAllErr } = await supabase
      .from("allowances")
      .update({ status: "processing" })
      .in("id", allowanceIds);
    if (updateAllErr) throw updateAllErr;
  }

  // Build queue messages
  type QueueMessage = {
    entity_type: "invoice" | "allowance";
    entity_id: string;
    firm_id: string;
    client_id: string;
    tax_filing_period_id: string;
  };

  const messages: QueueMessage[] = [
    ...invoiceIds.map((id) => ({
      entity_type: "invoice" as const,
      entity_id: id,
      firm_id: period.firm_id,
      client_id: period.client_id,
      tax_filing_period_id: periodId,
    })),
    ...allowanceIds.map((id) => ({
      entity_type: "allowance" as const,
      entity_id: id,
      firm_id: period.firm_id,
      client_id: period.client_id,
      tax_filing_period_id: periodId,
    })),
  ];

  const queue = supabase.schema("pgmq_public");
  // TODO: handle the extremely large number of messages (1000+)
  const { error: sendError } = await queue.rpc("send_batch", {
    queue_name: "extraction_jobs",
    messages: messages,
  });

  if (sendError) {
    // Rollback status changes on enqueue failure
    if (invoiceIds.length > 0) {
      await supabase
        .from("invoices")
        .update({ status: "uploaded" })
        .in("id", invoiceIds);
    }
    if (allowanceIds.length > 0) {
      await supabase
        .from("allowances")
        .update({ status: "uploaded" })
        .in("id", allowanceIds);
    }
    throw new Error(`Failed to enqueue extraction jobs: ${sendError.message}`);
  }

  return { enqueuedCount: totalCount };
}

/**
 * Get the progress of bulk extraction for a filing period.
 * Counts invoice and allowance statuses as the source of truth.
 */
export async function getBulkExtractionProgress(
  periodId: string,
): Promise<BulkExtractionProgress> {
  const supabase = await createClient();

  // Fetch all invoices and allowances in the period
  const [invoiceResult, allowanceResult] = await Promise.all([
    supabase
      .from("invoices")
      .select("status")
      .eq("tax_filing_period_id", periodId),
    supabase
      .from("allowances")
      .select("status")
      .eq("tax_filing_period_id", periodId),
  ]);

  if (invoiceResult.error) throw invoiceResult.error;
  if (allowanceResult.error) throw allowanceResult.error;

  const allStatuses = [
    ...(invoiceResult.data || []).map((r) => r.status),
    ...(allowanceResult.data || []).map((r) => r.status),
  ];

  const counts: BulkExtractionProgress = {
    total: allStatuses.length,
    uploaded: 0,
    processing: 0,
    processed: 0,
    confirmed: 0,
    failed: 0,
  };

  for (const status of allStatuses) {
    if (status === "uploaded") counts.uploaded++;
    else if (status === "processing") counts.processing++;
    else if (status === "processed") counts.processed++;
    else if (status === "confirmed") counts.confirmed++;
    else if (status === "failed") counts.failed++;
  }

  return counts;
}
