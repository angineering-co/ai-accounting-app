"use server";

// 'use server' entry points for the 營業稅繳款 card. They delegate to the
// non-'use server' helpers in `journal-entry.ts` (which can't be 'use server'
// themselves — they accept an injected userId / supabase client for tests). Each
// wrapper resolves auth from cookies and enforces the staff + period-scope gate.

import {
  deleteVatPaymentDraft,
  getVatPaymentInfo,
  recordVatPayment,
  type RecordVatPaymentInput,
  type VatPaymentInfo,
} from "@/lib/services/journal-entry";

export async function getVatPaymentInfoAction(
  periodId: string,
): Promise<VatPaymentInfo> {
  return getVatPaymentInfo(periodId);
}

export async function recordVatPaymentAction(
  periodId: string,
  input: RecordVatPaymentInput,
): Promise<{ entryId: string }> {
  const entryId = await recordVatPayment(periodId, input);
  return { entryId };
}

export async function deleteVatPaymentDraftAction(
  periodId: string,
): Promise<void> {
  await deleteVatPaymentDraft(periodId);
}
