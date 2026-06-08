"use server";

// Thin Server Action wrappers around the internal period-batch helpers in
// `lib/services/journal-entry.ts` (which is intentionally NOT 'use server', so
// its injected-userId helpers aren't exposed as public endpoints). These
// wrappers take only a periodId and let the helper resolve auth from cookies.

import {
  generateDraftEntriesByPeriod,
  getPeriodEntryStatus,
  getPeriodGenerationStatus,
  type GeneratePeriodResult,
  type PeriodEntryStatus,
  type VoucherGenerationStatus,
} from "@/lib/services/journal-entry";

export async function getPeriodEntryStatusAction(
  periodId: string,
): Promise<PeriodEntryStatus> {
  return getPeriodEntryStatus(periodId);
}

// O(1) run-state flag only — what the UI polls while a run is in flight, so the
// 2s poll never re-runs the heavy missing/stale scan in getPeriodEntryStatus.
export async function getPeriodGenerationStatusAction(
  periodId: string,
): Promise<VoucherGenerationStatus> {
  return getPeriodGenerationStatus(periodId);
}

export async function generateDraftEntriesByPeriodAction(
  periodId: string,
): Promise<GeneratePeriodResult> {
  return generateDraftEntriesByPeriod(periodId);
}
