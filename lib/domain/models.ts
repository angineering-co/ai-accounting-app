import { z } from "zod";

// ===== Client Schemas =====
export const clientSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  name: z.string().min(1, "客戶名稱為必填"),
  contact_person: z.string().nullable().optional(),
  tax_id: z.string().min(8, "統一編號格式錯誤").max(8, "統一編號格式錯誤"),
  tax_payer_id: z.string().min(1, "稅籍編號為必填"),
  industry: z.string().nullable().optional(),
});

export const updateClientSchema = clientSchema.pick({
  name: true,
  contact_person: true,
  tax_id: true,
  tax_payer_id: true,
  industry: true,
});

export const createClientSchema = clientSchema.pick({
  firm_id: true,
  name: true,
  contact_person: true,
  tax_id: true,
  tax_payer_id: true,
  industry: true,
});

export type Client = z.infer<typeof clientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;

// ===== Invoice Schemas =====

// Schema for extracted invoice data (stored in JSONB column)
export const extractedInvoiceDataSchema = z.object({
  invoice_number: z.string().optional(),
  invoice_date: z.string().optional(), // ISO date string
  amount: z.number().optional(),
  tax_amount: z.number().optional(),
  total_amount: z.number().optional(),
  vendor_name: z.string().optional(),
  vendor_tax_id: z.string().optional(),
  // Add other extracted fields as needed
}).passthrough(); // Allow additional fields from AI extraction

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  storage_path: z.string().min(1),
  filename: z.string().min(1),
  in_or_out: z.enum(['in', 'out']),
  status: z.enum(['uploaded', 'processing', 'processed', 'confirmed', 'failed']),
  extracted_data: extractedInvoiceDataSchema.nullable().optional(),
  uploaded_by: z.string().uuid(),
  created_at: z.string().datetime(),
});

export const createInvoiceSchema = z.object({
  firm_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  storage_path: z.string().min(1),
  filename: z.string().min(1),
  in_or_out: z.enum(['in', 'out']),
});

export const updateInvoiceSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  in_or_out: z.enum(['in', 'out']).optional(),
  status: z.enum(['uploaded', 'processing', 'processed', 'confirmed', 'failed']).optional(),
  extracted_data: extractedInvoiceDataSchema.nullable().optional(),
});

export type Invoice = z.infer<typeof invoiceSchema>;
export type ExtractedInvoiceData = z.infer<typeof extractedInvoiceDataSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
