"use client";

import { useSyncExternalStore } from "react";
import {
  generateVoucherDemoData,
  type VoucherDemoData,
} from "@/tests/fixtures/voucher-demo-generator";
import {
  isLinesBalanced,
  type JournalEntry,
  type JournalEntryLine,
} from "@/lib/domain/journal-entry";
import type { AuditTrail } from "@/lib/domain/audit-trail";
import { formatDateToISO } from "@/lib/utils";

// Singleton in-memory store mirroring the shape of phase 5+ DB-backed services,
// so UI written against this hook keeps working when the impl swaps to Supabase.

let _state: VoucherDemoData = generateVoucherDemoData();
const _listeners = new Set<() => void>();

function notify(): void {
  for (const l of _listeners) l();
}

function setState(next: VoucherDemoData): void {
  if (next === _state) return;
  _state = next;
  notify();
}

function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

function getSnapshot(): VoucherDemoData {
  return _state;
}

export function resetVoucherDemoStore(): void {
  setState(generateVoucherDemoData());
}

// Re-seed the demo so its firmId/clientId match the route the user is viewing.
// Without this the page filter `e.client_id === clientId` excludes every entry.
export function seedVoucherDemoFor(firmId: string, clientId: string): void {
  if (_state.firmId === firmId && _state.clientId === clientId) return;
  setState(generateVoucherDemoData({ firmId, clientId }));
}

function genId(): string {
  return globalThis.crypto.randomUUID();
}

function nextVoucherSeq(
  state: VoucherDemoData,
  clientId: string,
  yyyymmdd: string,
): number {
  let max = 0;
  for (const e of state.entries) {
    if (e.client_id !== clientId || !e.voucher_no) continue;
    if (!e.voucher_no.startsWith(`${yyyymmdd}-`)) continue;
    const seq = Number(e.voucher_no.slice(9));
    if (seq > max) max = seq;
  }
  return max + 1;
}

interface PostResult {
  entry_id: string;
  voucher_no: string | null;
  error: string | null;
}

// Mirrors §5.4 partial-success semantics: unbalanced entries fail independently and don't consume a seq, so successful voucher_no remain gap-free.
function postEntries(entryIds: string[], userId: string): PostResult[] {
  const results: PostResult[] = [];
  // Sort by (entry_date, created_at) to mirror RPC's stable ordering
  const targets = _state.entries
    .filter((e) => entryIds.includes(e.id))
    .sort((a, b) => {
      if (a.entry_date !== b.entry_date) return a.entry_date.localeCompare(b.entry_date);
      return a.created_at.getTime() - b.created_at.getTime();
    });

  let working = _state;
  for (const e of targets) {
    if (e.status !== "draft") {
      results.push({ entry_id: e.id, voucher_no: e.voucher_no ?? null, error: null });
      continue;
    }
    const entryLines = working.lines.filter((l) => l.journal_entry_id === e.id);
    if (!isLinesBalanced(entryLines)) {
      results.push({ entry_id: e.id, voucher_no: null, error: "unbalanced" });
      continue;
    }
    const yyyymmdd = e.entry_date.replaceAll("-", "");
    const seq = nextVoucherSeq(working, e.client_id, yyyymmdd);
    const voucher_no = `${yyyymmdd}-${String(seq).padStart(5, "0")}`;
    working = {
      ...working,
      entries: working.entries.map((x) =>
        x.id === e.id
          ? {
              ...x,
              status: "posted" as const,
              voucher_no,
              posted_at: new Date(),
              posted_by: userId,
              updated_at: new Date(),
            }
          : x,
      ),
    };
    results.push({ entry_id: e.id, voucher_no, error: null });
  }
  setState(working);
  return results;
}

function saveDraftEntry(
  entryId: string,
  patch: Partial<Pick<JournalEntry, "voucher_type" | "entry_date" | "description">>,
  newLines?: Omit<JournalEntryLine, "id" | "journal_entry_id">[],
): void {
  const target = _state.entries.find((e) => e.id === entryId);
  if (!target || target.status !== "draft") return;
  if (Object.keys(patch).length === 0 && !newLines) return;

  const nextEntries = _state.entries.map((e) =>
    e.id === entryId ? { ...e, ...patch, updated_at: new Date() } : e,
  );

  let nextLines = _state.lines;
  if (newLines) {
    const hydrated: JournalEntryLine[] = newLines.map((l) => ({
      ...l,
      id: genId(),
      journal_entry_id: entryId,
    }));
    nextLines = [..._state.lines.filter((l) => l.journal_entry_id !== entryId), ...hydrated];
  }
  setState({ ..._state, entries: nextEntries, lines: nextLines });
}

function deleteDraftEntry(entryId: string): void {
  const target = _state.entries.find((e) => e.id === entryId);
  if (!target || target.status !== "draft") return;
  setState({
    ..._state,
    entries: _state.entries.filter((e) => e.id !== entryId),
    lines: _state.lines.filter((l) => l.journal_entry_id !== entryId),
  });
}

function editPostedEntry(
  entryId: string,
  patch: Partial<Pick<JournalEntry, "voucher_type" | "entry_date" | "description">>,
  newLines: Omit<JournalEntryLine, "id" | "journal_entry_id">[],
  reason: string,
  userId: string,
): void {
  const target = _state.entries.find((e) => e.id === entryId);
  if (!target || target.status !== "posted") return;
  const oldLines = _state.lines.filter((l) => l.journal_entry_id === entryId);

  const audit: AuditTrail = {
    id: genId(),
    firm_id: target.firm_id,
    entity_table: "journal_entries",
    entity_id: entryId,
    action: "updated",
    before: {
      entry: {
        voucher_type: target.voucher_type,
        entry_date: target.entry_date,
        description: target.description,
      },
      lines: oldLines.map((l) => ({
        line_number: l.line_number,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
    },
    reason,
    actor_id: userId,
    actor_at: new Date(),
  };

  const hydrated: JournalEntryLine[] = newLines.map((l) => ({
    ...l,
    id: genId(),
    journal_entry_id: entryId,
  }));

  setState({
    ..._state,
    entries: _state.entries.map((e) =>
      e.id === entryId ? { ...e, ...patch, updated_at: new Date() } : e,
    ),
    lines: [..._state.lines.filter((l) => l.journal_entry_id !== entryId), ...hydrated],
    auditTrails: [..._state.auditTrails, audit],
  });
}

function reverseEntry(
  entryId: string,
  reason: string,
  userId: string,
  entryDate?: string,
): string | null {
  const orig = _state.entries.find((e) => e.id === entryId);
  if (!orig || orig.status !== "posted") return null;
  const origLines = _state.lines.filter((l) => l.journal_entry_id === entryId);

  const dateISO = entryDate ?? formatDateToISO(new Date());
  const yyyymmdd = dateISO.replaceAll("-", "");
  const seq = nextVoucherSeq(_state, orig.client_id, yyyymmdd);
  const voucher_no = `${yyyymmdd}-${String(seq).padStart(5, "0")}`;

  const newId = genId();
  const newEntry: JournalEntry = {
    id: newId,
    firm_id: orig.firm_id,
    client_id: orig.client_id,
    document_id: null,
    voucher_no,
    voucher_type: "轉帳",
    entry_date: dateISO,
    description: `沖銷 ${orig.voucher_no}：${reason}`,
    status: "posted",
    reverses_entry_id: entryId,
    posted_at: new Date(),
    posted_by: userId,
    created_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const newLines: JournalEntryLine[] = origLines.map((l) => ({
    id: genId(),
    journal_entry_id: newId,
    line_number: l.line_number,
    account_code: l.account_code,
    debit: l.credit,
    credit: l.debit,
    description: l.description ? `${l.description}（沖銷）` : null,
  }));

  const audit: AuditTrail = {
    id: genId(),
    firm_id: orig.firm_id,
    entity_table: "journal_entries",
    entity_id: entryId,
    action: "reversed",
    before: null,
    reason,
    actor_id: userId,
    actor_at: new Date(),
  };

  setState({
    ..._state,
    entries: [
      ..._state.entries.map((e) =>
        e.id === entryId ? { ...e, status: "reversed" as const, updated_at: new Date() } : e,
      ),
      newEntry,
    ],
    lines: [..._state.lines, ...newLines],
    auditTrails: [..._state.auditTrails, audit],
  });
  return newId;
}

// ---------- Public hook ----------

export interface VoucherDemoStore extends VoucherDemoData {
  saveDraftEntry: typeof saveDraftEntry;
  deleteDraftEntry: typeof deleteDraftEntry;
  postEntries: typeof postEntries;
  editPostedEntry: typeof editPostedEntry;
  reverseEntry: typeof reverseEntry;
  reset: typeof resetVoucherDemoStore;
}

export function useVoucherDemoStore(): VoucherDemoStore {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...state,
    saveDraftEntry,
    deleteDraftEntry,
    postEntries,
    editPostedEntry,
    reverseEntry,
    reset: resetVoucherDemoStore,
  };
}

// Non-hook accessor for test code that doesn't run inside React.
export function getVoucherDemoStateForTests(): VoucherDemoData {
  return _state;
}
