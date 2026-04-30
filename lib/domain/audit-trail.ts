import { z } from "zod";

export const AUDIT_ACTION = [
  "created",
  "updated",
  "deleted",
  "posted",
  "voided",
  "marked_duplicate",
  "reversed",
] as const;

export const AUDIT_ENTITY_TABLE = [
  "journal_entries",
  "journal_entry_lines",
  "documents",
  "invoices",
  "allowances",
] as const;

export const auditTrailSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  entity_table: z.enum(AUDIT_ENTITY_TABLE),
  entity_id: z.string().uuid(),
  action: z.enum(AUDIT_ACTION),
  before: z.unknown().nullable().optional(),
  reason: z.string().nullable().optional(),
  actor_id: z.string().uuid().nullable().optional(), // NULL 表示系統動作
  actor_at: z.coerce.date(),
});

export type AuditAction = (typeof AUDIT_ACTION)[number];
export type AuditEntityTable = (typeof AUDIT_ENTITY_TABLE)[number];
export type AuditTrail = z.infer<typeof auditTrailSchema>;
