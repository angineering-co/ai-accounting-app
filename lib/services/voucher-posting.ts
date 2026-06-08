"use server";

// Thin Server Action wrapper around the internal `postJournalEntries` helper in
// `lib/services/journal-entry.ts` (which is intentionally NOT 'use server', so
// its injected-userId helper isn't exposed as a public endpoint). This wrapper
// takes the clientId + entryIds and lets the helper resolve auth from cookies
// and enforce the firm-scope boundary via an RLS-bounded clients read.

import {
  postJournalEntries,
  type PostResult,
} from "@/lib/services/journal-entry";

// Batch-post draft entries (single-entry posting is a length-1 array). Returns a
// per-entry result so the UI can mark each ✓ + voucher_no or ✗ + error.
export async function postJournalEntriesAction(
  clientId: string,
  entryIds: string[],
): Promise<PostResult[]> {
  return postJournalEntries(clientId, entryIds);
}
