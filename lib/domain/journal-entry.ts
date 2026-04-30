import { z } from "zod";

export const VOUCHER_TYPE = ["收入", "支出", "轉帳"] as const;

export const ENTRY_STATUS = ["draft", "posted", "reversed"] as const;

export const ACCOUNT_CODE_REGEX = /^\d{4,6}$/;

// Mirrors §3.4 DB CHECK: each line must be debit-only or credit-only.
export const journalEntryLineSchema = z
  .object({
    id: z.string().uuid(),
    journal_entry_id: z.string().uuid(),
    line_number: z.number().int().min(1),
    account_code: z.string().regex(ACCOUNT_CODE_REGEX, "科目代碼為 4–6 位數字"),
    debit: z.number().int().nonnegative().default(0),
    credit: z.number().int().nonnegative().default(0),
    description: z.string().nullable().optional(),
  })
  .refine((line) => (line.debit > 0) !== (line.credit > 0), {
    message: "借方與貸方只能擇一為正",
  });

// Mirrors §3.3 DB CHECK: posted/reversed must carry a voucher_no.
export const journalEntrySchema = z
  .object({
    id: z.string().uuid(),
    firm_id: z.string().uuid(),
    client_id: z.string().uuid(),
    document_id: z.string().uuid().nullable().optional(),
    voucher_no: z
      .string()
      .regex(/^\d{8}-\d{5}$/, "傳票編號格式錯誤 (YYYYMMDD-NNNNN)")
      .nullable()
      .optional(),
    voucher_type: z.enum(VOUCHER_TYPE),
    entry_date: z.string(), // YYYY-MM-DD
    description: z.string().nullable().optional(),
    status: z.enum(ENTRY_STATUS).default("draft"),
    reverses_entry_id: z.string().uuid().nullable().optional(),
    posted_at: z.coerce.date().nullable().optional(),
    posted_by: z.string().uuid().nullable().optional(),
    created_by: z.string().uuid().nullable().optional(),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
  })
  .refine((e) => e.status === "draft" || (e.voucher_no != null && e.voucher_no.length > 0), {
    message: "posted/reversed 必須有 voucher_no",
  });

export const journalEntryWithLinesSchema = z.object({
  entry: journalEntrySchema,
  lines: z.array(journalEntryLineSchema),
});

export type VoucherType = (typeof VOUCHER_TYPE)[number];
export type EntryStatus = (typeof ENTRY_STATUS)[number];
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type JournalEntryLine = z.infer<typeof journalEntryLineSchema>;
export type JournalEntryWithLines = z.infer<typeof journalEntryWithLinesSchema>;

interface LineSums {
  debit: number;
  credit: number;
}

type SumLine = Pick<JournalEntryLine, "debit" | "credit">;

export function sumLines(lines: readonly SumLine[]): LineSums {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    debit += l.debit;
    credit += l.credit;
  }
  return { debit, credit };
}

export function isLinesBalanced(lines: readonly SumLine[]): boolean {
  const { debit, credit } = sumLines(lines);
  return debit === credit && debit > 0;
}

// Single pass over all lines into a map keyed by journal_entry_id —
// O(L) build + O(1) per-row lookup, replacing O(rows × L) per-row scans.
export function buildLineSumsMap(
  lines: readonly Pick<JournalEntryLine, "journal_entry_id" | "debit" | "credit">[],
): Map<string, LineSums> {
  const m = new Map<string, LineSums>();
  for (const l of lines) {
    const cur = m.get(l.journal_entry_id);
    if (cur) {
      cur.debit += l.debit;
      cur.credit += l.credit;
    } else {
      m.set(l.journal_entry_id, { debit: l.debit, credit: l.credit });
    }
  }
  return m;
}
