import { z } from "zod";

import { ACCOUNT_CODE_REGEX, VOUCHER_TYPE } from "./journal-entry";

// `voided` / `marked_duplicate` 等舊 enum 值已隨 v1 schema 收斂移除 — `feedback_no_speculative_status_values`：
// 作廢 / duplicate 的自動化處理 v1 範圍外，沒有對應 audit writer，DB CHECK 也只允許這 5 個值。
export const AUDIT_ACTION = [
  "created",
  "updated",
  "deleted",
  "posted",
  "reversed",
] as const;

// 與 audit_trails.entity_table 無 DB CHECK；保留 invoices / allowances 是因為未來模組擴張。
export const AUDIT_ENTITY_TABLE = [
  "journal_entries",
  "journal_entry_lines",
  "documents",
  "invoices",
  "allowances",
] as const;

// Snapshot of an entry's pre-change state, written when entity_table=journal_entries.
// Other entity_tables will get their own snapshot variants when they grow audit support;
// at that point this becomes a discriminated union keyed on entity_table.
export const beforeSnapshotEntryFieldsSchema = z.object({
  voucher_type: z.enum(VOUCHER_TYPE).optional(),
  entry_date: z.string().optional(),
  description: z.string().nullable().optional(),
});

export const beforeSnapshotLineSchema = z.object({
  line_number: z.number().int().min(1),
  account_code: z.string().regex(ACCOUNT_CODE_REGEX),
  debit: z.number().int().nonnegative(),
  credit: z.number().int().nonnegative(),
  description: z.string().nullable().optional(),
});

export const beforeSnapshotSchema = z.object({
  entry: beforeSnapshotEntryFieldsSchema.optional(),
  lines: z.array(beforeSnapshotLineSchema).optional(),
});

export const auditTrailSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  entity_table: z.enum(AUDIT_ENTITY_TABLE),
  entity_id: z.string().uuid(),
  action: z.enum(AUDIT_ACTION),
  before: beforeSnapshotSchema.nullable().optional(),
  reason: z.string().nullable().optional(),
  actor_id: z.string().uuid().nullable().optional(), // NULL 表示系統動作
  actor_at: z.coerce.date(),
});

export type AuditAction = (typeof AUDIT_ACTION)[number];
export type AuditEntityTable = (typeof AUDIT_ENTITY_TABLE)[number];
export type BeforeSnapshot = z.infer<typeof beforeSnapshotSchema>;
export type AuditTrail = z.infer<typeof auditTrailSchema>;
