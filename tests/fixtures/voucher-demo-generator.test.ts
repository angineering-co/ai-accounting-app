import { describe, it, expect } from "vitest";
import { generateVoucherDemoData } from "./voucher-demo-generator";
import { documentSchema } from "@/lib/domain/document";
import {
  journalEntrySchema,
  journalEntryLineSchema,
} from "@/lib/domain/journal-entry";
import { auditTrailSchema } from "@/lib/domain/audit-trail";

describe("voucher-demo-generator", () => {
  it("emits documents that parse cleanly through documentSchema", () => {
    const data = generateVoucherDemoData();
    for (const d of data.documents) {
      expect(() => documentSchema.parse(d)).not.toThrow();
    }
  });

  it("emits journal entries that parse cleanly through journalEntrySchema", () => {
    const data = generateVoucherDemoData();
    for (const e of data.entries) {
      expect(() => journalEntrySchema.parse(e)).not.toThrow();
    }
  });

  it("emits journal entry lines that parse cleanly through journalEntryLineSchema", () => {
    const data = generateVoucherDemoData();
    for (const l of data.lines) {
      expect(() => journalEntryLineSchema.parse(l)).not.toThrow();
    }
  });

  it("emits audit trails that parse cleanly through auditTrailSchema", () => {
    const data = generateVoucherDemoData();
    for (const a of data.auditTrails) {
      expect(() => auditTrailSchema.parse(a)).not.toThrow();
    }
  });

  it("is deterministic — two calls produce identical IDs and content", () => {
    const a = generateVoucherDemoData();
    const b = generateVoucherDemoData();
    expect(a.firmId).toBe(b.firmId);
    expect(a.clientId).toBe(b.clientId);
    expect(a.entries.map((e) => e.id)).toEqual(b.entries.map((e) => e.id));
    expect(a.lines.map((l) => l.id)).toEqual(b.lines.map((l) => l.id));
    expect(a.documents.map((d) => d.id)).toEqual(b.documents.map((d) => d.id));
    expect(a.auditTrails.map((t) => t.id)).toEqual(b.auditTrails.map((t) => t.id));
  });

  it("covers all required UI states", () => {
    const data = generateVoucherDemoData();
    const drafts = data.entries.filter((e) => e.status === "draft");
    const posted = data.entries.filter((e) => e.status === "posted");
    const reversed = data.entries.filter((e) => e.status === "reversed");

    expect(drafts.length).toBeGreaterThanOrEqual(3);
    expect(posted.length).toBeGreaterThanOrEqual(5);
    expect(reversed.length).toBeGreaterThanOrEqual(1);

    // 至少一筆 reversal 連回原 entry
    const reversalEntries = posted.filter((e) => e.reverses_entry_id != null);
    expect(reversalEntries.length).toBeGreaterThanOrEqual(1);
    for (const r of reversalEntries) {
      const orig = data.entries.find((e) => e.id === r.reverses_entry_id);
      expect(orig).toBeDefined();
      expect(orig?.status).toBe("reversed");
    }

    // 至少一筆 posted-edited（在 audit_trails 留下 'updated' 紀錄）
    const editedIds = data.auditTrails
      .filter((a) => a.action === "updated")
      .map((a) => a.entity_id);
    expect(editedIds.length).toBeGreaterThanOrEqual(1);
    for (const id of editedIds) {
      const e = data.entries.find((x) => x.id === id);
      expect(e?.status).toBe("posted");
    }

    // 系統分錄：至少一筆 posted entry 沒有 document_id
    const systemEntries = posted.filter((e) => e.document_id == null);
    expect(systemEntries.length).toBeGreaterThanOrEqual(1);

    // 來自 invoice/allowance 的 entry：至少一筆 posted 有 document_id
    const docDriven = posted.filter((e) => e.document_id != null);
    expect(docDriven.length).toBeGreaterThanOrEqual(1);
  });

  it("posted entries all carry a voucher_no; drafts carry none", () => {
    const data = generateVoucherDemoData();
    for (const e of data.entries) {
      if (e.status === "draft") {
        expect(e.voucher_no).toBeNull();
      } else {
        expect(e.voucher_no).toMatch(/^\d{8}-\d{5}$/);
      }
    }
  });

  it("every line belongs to an entry that exists", () => {
    const data = generateVoucherDemoData();
    const ids = new Set(data.entries.map((e) => e.id));
    for (const l of data.lines) {
      expect(ids.has(l.journal_entry_id)).toBe(true);
    }
  });

  it("balanced entries: posted entries' debit total equals credit total", () => {
    const data = generateVoucherDemoData();
    for (const e of data.entries) {
      if (e.status !== "posted") continue;
      const ls = data.lines.filter((l) => l.journal_entry_id === e.id);
      const debit = ls.reduce((s, l) => s + l.debit, 0);
      const credit = ls.reduce((s, l) => s + l.credit, 0);
      expect(debit).toBe(credit);
      expect(debit).toBeGreaterThan(0);
    }
  });
});
