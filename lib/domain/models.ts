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
// Matches InvoiceData interface from examples/invoice-reader/src/Models.ts
export const extractedInvoiceDataSchema = z.object({
  invoiceSerialCode: z.string().optional(), // 發票字軌號碼
  date: z.string().optional(), // YYYY/MM/DD format
  sellerName: z.string().optional(), // 賣方名稱
  sellerTaxId: z.string().optional(), // 賣方統一編號
  buyerName: z.string().optional(), // 買方名稱
  buyerTaxId: z.string().optional(), // 買方統一編號
  totalSales: z.number().optional(), // 銷售額
  tax: z.number().optional(), // 營業稅
  totalAmount: z.number().optional(), // 總計
  summary: z.string().optional(), // 摘要
  deductible: z.boolean().optional(), // 是否可扣抵
  account: z.string().optional(), // 會計科目 (e.g., "5102 旅費")
  taxType: z.enum(['應稅', '零稅率', '免稅', '作廢', '彙加']).optional(), // 課稅別
  invoiceType: z.enum(['手開二聯式', '手開三聯式', '電子發票', '二聯式收銀機', '三聯式收銀機']).optional(), // 發票類型
  inOrOut: z.enum(['進項', '銷項']).optional(), // 進銷項
  confidence: z.record(z.string(), z.enum(['low', 'medium', 'high'])).optional(), // Confidence levels for extracted fields
  source: z.enum(['import-excel', 'import-txt']).optional(), // Source of the invoice data
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
  invoice_serial_code: z.string().nullable().optional(),
  year_month: z.string().length(5, "所屬年月格式錯誤 (YYYMM)").nullable().optional(),
  uploaded_by: z.string().uuid(),
  created_at: z.coerce.date(),
});

export const createInvoiceSchema = z.object({
  firm_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  storage_path: z.string().min(1),
  filename: z.string().min(1),
  in_or_out: z.enum(['in', 'out']),
  year_month: z.string().length(5, "所屬年月格式錯誤 (YYYMM)").optional(),
});

export const updateInvoiceSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  in_or_out: z.enum(['in', 'out']).optional(),
  year_month: z.string().length(5, "所屬年月格式錯誤 (YYYMM)").optional(),
  status: z.enum(['uploaded', 'processing', 'processed', 'confirmed', 'failed']).optional(),
  extracted_data: extractedInvoiceDataSchema.nullable().optional(),
  invoice_serial_code: z.string().nullable().optional(),
});

export type Invoice = z.infer<typeof invoiceSchema>;
export type ExtractedInvoiceData = z.infer<typeof extractedInvoiceDataSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

// ===== Invoice Range Schemas =====
export const invoiceRangeSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  year_month: z.string().length(5, "所屬年月格式錯誤 (YYYMM)"),
  invoice_type: z.enum(['手開二聯式', '手開三聯式', '電子發票', '二聯式收銀機', '三聯式收銀機']),
  start_number: z.string().length(10, "發票起始號碼長度應為 10 碼"),
  end_number: z.string().length(10, "發票結束號碼長度應為 10 碼"),
  created_at: z.coerce.date(),
});

export const createInvoiceRangeSchema = invoiceRangeSchema.omit({ 
  id: true, 
  created_at: true 
});

export type InvoiceRange = z.infer<typeof invoiceRangeSchema>;
export type CreateInvoiceRangeInput = z.infer<typeof createInvoiceRangeSchema>;

// ===== TET_U Config Schemas =====
export const tetUConfigSchema = z.object({
  // Basic File Info
  fileNumber: z.string(),
  consolidatedDeclarationCode: z.enum(['0', '1', '2']), // 0=單一, 1=總機構, 2=分別
  declarationCode: z.string(), // Field 5
  taxPayerId: z.string().min(9, "稅籍編號為 9 碼").max(9, "稅籍編號為 9 碼"),
  
  // Tax Calculation Fields
  midYearClosureTaxPayable: z.number(),
  previousPeriodCarryForwardTax: z.number(),
  midYearClosureTaxRefundable: z.number(),
  
  // Declarer Information
  declarationType: z.enum(['1', '2']), // 1=按期, 2=按月
  countyCity: z.string(),
  declarationMethod: z.enum(['1', '2']), // 1=自行, 2=委託
  declarerId: z.string(),
  declarerName: z.string(),
  declarerPhoneAreaCode: z.string(),
  declarerPhone: z.string(),
  declarerPhoneExtension: z.string(),
  agentRegistrationNumber: z.string(),
});

export type TetUConfig = z.infer<typeof tetUConfigSchema>;
