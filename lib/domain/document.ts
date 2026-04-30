import { z } from "zod";

// v1 only uses `invoice` / `allowance`; rest reserved for v2+ (receipt, payroll, insurance, manual).
export const DOC_TYPE = [
  "invoice",
  "allowance",
  "receipt",
  "payroll",
  "insurance",
  "manual",
] as const;

export const DOC_STATUS = ["active", "duplicate", "void", "deleted"] as const;

export const DOC_VAT_TYPE = ["VAT", "NON_VAT"] as const;

export const DOC_OCR_STATUS = ["pending", "done", "failed"] as const;

export const documentSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  client_id: z.string().uuid(),
  doc_date: z.string(), // YYYY-MM-DD
  type: z.enum(DOC_VAT_TYPE),
  doc_type: z.enum(DOC_TYPE),
  file_url: z.string().nullable().optional(),
  ocr_status: z.enum(DOC_OCR_STATUS).nullable().optional(),
  amount: z.number().int().nullable().optional(),
  duplicate_of: z.string().uuid().nullable().optional(),
  status: z.enum(DOC_STATUS).default("active"),
  created_by: z.string().uuid(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type DocType = (typeof DOC_TYPE)[number];
export type DocStatus = (typeof DOC_STATUS)[number];
export type DocVatType = (typeof DOC_VAT_TYPE)[number];
export type DocOcrStatus = (typeof DOC_OCR_STATUS)[number];
export type Document = z.infer<typeof documentSchema>;
