"use server";

// Thin Server Action wrappers around the internal period-batch helpers in
// `lib/services/journal-entry.ts` (which is intentionally NOT 'use server', so
// its injected-userId helpers aren't exposed as public endpoints). These
// wrappers take only a periodId and let the helper resolve auth from cookies.

import {
  generatePeriodDraftEntries,
  getPeriodEntryStatus,
  type GeneratePeriodResult,
  type PeriodEntryStatus,
} from "@/lib/services/journal-entry";

export async function getPeriodEntryStatusAction(
  periodId: string,
): Promise<PeriodEntryStatus> {
  return getPeriodEntryStatus(periodId);
}

export async function generatePeriodDraftEntriesAction(
  periodId: string,
): Promise<GeneratePeriodResult> {
  return generatePeriodDraftEntries(periodId);
}
