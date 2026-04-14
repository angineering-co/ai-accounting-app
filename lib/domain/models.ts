import { z } from "zod";
import { ACCOUNT_LIST } from "@/lib/data/accounts";

// ===== Profile / Access Schemas =====
export const profileSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  name: z.string().nullable().optional(),
  role: z.enum(["admin", "staff", "super_admin", "client"]).nullable().optional(),
  created_at: z.coerce.date().optional(),
});

export const inviteClientUserSchema = z.object({
  clientId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).optional(),
});

export type Profile = z.infer<typeof profileSchema>;
export type InviteClientUserInput = z.infer<typeof inviteClientUserSchema>;

// ===== Client Settings Sub-Schemas =====

export const responsiblePersonSchema = z.object({
  name: z.string().min(1, "負責人姓名為必填"),
  national_id: z.string().regex(/^[A-Z]\d{9}$/, "身分證字號格式錯誤（1個英文字母+9位數字）").or(z.literal("")).optional(),
  address: z.string().optional(),
  capital_contribution: z.number().int({ message: "請輸入整數金額" }).nonnegative().optional(),
});

export const shareholderSchema = z.object({
  name: z.string().min(1, "股東姓名為必填"),
  national_id: z.string().regex(/^[A-Z]\d{9}$/, "身分證字號格式錯誤（1個英文字母+9位數字）").or(z.literal("")).optional(),
  address: z.string().optional(),
  capital_contribution: z.number().int({ message: "請輸入整數金額" }).nonnegative().optional(),
});

export const platformCredentialsSchema = z.object({
  einvoice_username: z.string().optional(),
  einvoice_password: z.string().optional(),
  tax_filing_password: z.string().optional(),
});

export const landlordSchema = z.object({
  type: z.enum(["company", "individual"]),
  rent_amount: z.number().int({ message: "請輸入整數金額" }).nonnegative().optional(),
});

export const invoicePurchasingSchema = z.object({
  enabled: z.boolean().default(false),
  two_part_manual: z.number().int({ message: "請輸入整數" }).nonnegative().default(0),
  three_part_manual: z.number().int({ message: "請輸入整數" }).nonnegative().default(0),
  two_part_register: z.number().int({ message: "請輸入整數" }).nonnegative().default(0),
  three_part_register: z.number().int({ message: "請輸入整數" }).nonnegative().default(0),
});

export type ResponsiblePerson = z.infer<typeof responsiblePersonSchema>;
export type Shareholder = z.infer<typeof shareholderSchema>;
export type PlatformCredentials = z.infer<typeof platformCredentialsSchema>;
export type Landlord = z.infer<typeof landlordSchema>;
export type InvoicePurchasing = z.infer<typeof invoicePurchasingSchema>;

// ===== Client Schemas =====
export const clientSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  name: z.string().min(1, "客戶名稱為必填"),
  contact_person: z.string().nullable().optional(),
  tax_id: z.string().min(8, "統一編號格式錯誤").max(8, "統一編號格式錯誤"),
  tax_payer_id: z.string().min(1, "稅籍編號為必填"),
  industry: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  mailing_address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  responsible_person: responsiblePersonSchema.nullable().optional(),
  shareholders: z.array(shareholderSchema).nullable().optional(),
  platform_credentials: platformCredentialsSchema.nullable().optional(),
  landlord: landlordSchema.nullable().optional(),
  invoice_purchasing: invoicePurchasingSchema.nullable().optional(),
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

export const updateClientSettingsSchema = z.object({
  name: z.string().min(1, "客戶名稱為必填").optional(),
  tax_id: z.string().min(8, "統一編號格式錯誤").max(8, "統一編號格式錯誤").optional(),
  tax_payer_id: z.string().min(1, "稅籍編號為必填").optional(),
  address: z.string().optional(),
  mailing_address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("信箱格式錯誤").or(z.literal("")).optional(),
  responsible_person: responsiblePersonSchema.nullable().optional(),
  shareholders: z.array(shareholderSchema).nullable().optional(),
  platform_credentials: platformCredentialsSchema.nullable().optional(),
  landlord: landlordSchema.nullable().optional(),
  invoice_purchasing: invoicePurchasingSchema.nullable().optional(),
});

export type Client = z.infer<typeof clientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientSettingsInput = z.infer<typeof updateClientSettingsSchema>;

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
  account: z.enum(ACCOUNT_LIST).or(z.literal("")).optional(), // 會計科目 (e.g., "5102 旅費")
  taxType: z.enum(['應稅', '零稅率', '免稅', '作廢', '彙加']).optional(), // 課稅別
  invoiceType: z.enum(['手開二聯式', '手開三聯式', '電子發票', '二聯式收銀機', '三聯式收銀機']).optional(), // 發票類型
  inOrOut: z.enum(['進項', '銷項']).optional(), // 進銷項
  confidence: z.record(z.string(), z.enum(['low', 'medium', 'high'])).optional(), // Confidence levels for extracted fields
  source: z.enum(['import-excel']).optional(), // Source of the invoice data
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
  year_month: z.string().length(5, "所屬年月格式錯誤 (YYYMM)").nullable().optional(), // deprecated in favor of tax_filing_period_id
  tax_filing_period_id: z.string().uuid().nullable().optional(),
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
  tax_filing_period_id: z.string().uuid().optional(),
});

export const updateInvoiceSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  in_or_out: z.enum(['in', 'out']).optional(),
  year_month: z.string().length(5, "所屬年月格式錯誤 (YYYMM)").optional(),
  tax_filing_period_id: z.string().uuid().nullable().optional(),
  status: z.enum(['uploaded', 'processing', 'processed', 'confirmed', 'failed']).optional(),
  extracted_data: extractedInvoiceDataSchema.nullable().optional(),
  invoice_serial_code: z.string().nullable().optional(),
});

export type Invoice = z.infer<typeof invoiceSchema>;
export type ExtractedInvoiceData = z.infer<typeof extractedInvoiceDataSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type InvoiceType = NonNullable<ExtractedInvoiceData["invoiceType"]>;
export type InvoiceInOrOut = NonNullable<ExtractedInvoiceData["inOrOut"]>;

// ===== Allowance Schemas =====

// Schema for extracted allowance data (stored in JSONB column)
export const extractedAllowanceDataSchema = z.object({
  // Allowance classification
  allowanceType: z.enum(['三聯式折讓', '電子發票折讓', '二聯式折讓']).optional(),

  // Original invoice reference (also stored in column for indexing)
  originalInvoiceSerialCode: z.string().optional(),

  // Amounts (totals for the entire allowance)
  amount: z.number().optional(),      // 折讓金額 (銷售額)
  taxAmount: z.number().optional(),   // 折讓稅額

  // Date
  date: z.string().optional(),  // YYYY/MM/DD format

  // Party information (used to derive in_or_out)
  sellerName: z.string().optional(),
  sellerTaxId: z.string().optional(),
  buyerName: z.string().optional(),
  buyerTaxId: z.string().optional(),

  // Combined line items as text (for display, similar to invoice summary)
  // Groups multiple rows with same 折讓單號碼 into a single text field
  summary: z.string().optional(),

  // Line items (kept granular for report export)
  items: z.array(z.object({
    amount: z.number().optional(),    // 折讓金額 (銷售額)
    taxAmount: z.number().optional(), // 折讓稅額
    description: z.string().optional(),
  })).optional(),

  // For 進項 allowances: deduction type
  deductionCode: z.enum(['1', '2']).optional(),  // 1=進貨費用, 2=固定資產

  // Metadata
  source: z.enum(['scan', 'import-excel']).optional(),
  confidence: z.record(z.string(), z.enum(['low', 'medium', 'high'])).optional(),
}).passthrough();

export const allowanceSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  tax_filing_period_id: z.string().uuid().nullable().optional(),
  allowance_serial_code: z.string().nullable().optional(),
  original_invoice_serial_code: z.string().nullable().optional(),
  original_invoice_id: z.string().uuid().nullable().optional(),
  in_or_out: z.enum(['in', 'out']),
  storage_path: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  status: z.enum(['uploaded', 'processing', 'processed', 'confirmed', 'failed']),
  extracted_data: extractedAllowanceDataSchema.nullable().optional(),
  uploaded_by: z.string().uuid().nullable().optional(),
  created_at: z.coerce.date(),
});

export const createAllowanceSchema = z.object({
  firm_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  tax_filing_period_id: z.string().uuid().optional(),
  allowance_serial_code: z.string().nullable().optional(),
  original_invoice_serial_code: z.string().nullable().optional(),
  in_or_out: z.enum(['in', 'out']),
  storage_path: z.string().optional(),
  filename: z.string().optional(),
});

export const updateAllowanceSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  tax_filing_period_id: z.string().uuid().nullable().optional(),
  original_invoice_serial_code: z.string().nullable().optional(),
  original_invoice_id: z.string().uuid().nullable().optional(),
  in_or_out: z.enum(['in', 'out']).optional(),
  status: z.enum(['uploaded', 'processing', 'processed', 'confirmed', 'failed']).optional(),
  extracted_data: extractedAllowanceDataSchema.nullable().optional(),
});

export type Allowance = z.infer<typeof allowanceSchema>;
export type ExtractedAllowanceData = z.infer<typeof extractedAllowanceDataSchema>;
export type CreateAllowanceInput = z.infer<typeof createAllowanceSchema>;
export type UpdateAllowanceInput = z.infer<typeof updateAllowanceSchema>;
export type AllowanceType = NonNullable<ExtractedAllowanceData["allowanceType"]>;

// ===== Invoice Range Schemas =====
export const invoiceRangeSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  client_id: z.string().uuid(),
  year_month: z.string().length(5, "所屬年月格式錯誤 (YYYMM)"),
  invoice_type: z.enum(['手開二聯式', '手開三聯式', '電子發票', '二聯式收銀機', '三聯式收銀機']),
  start_number: z.string().length(10, "發票起始號碼長度應為 10 碼"),
  end_number: z.string().length(10, "發票結束號碼長度應為 10 碼"),
  created_at: z.coerce.date(),
});

export const createInvoiceRangeSchema = invoiceRangeSchema.omit({ 
  id: true, 
  created_at: true,
  firm_id: true,
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

// Enums (App Level)
export const TAX_PERIOD_STATUS = ['open', 'locked', 'filed'] as const;
export type TaxPeriodStatus = typeof TAX_PERIOD_STATUS[number];

// ===== Tax Filing Period Schemas =====
export const taxFilingPeriodSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  client_id: z.string().uuid(),
  year_month: z.string().length(5, "期別格式錯誤 (YYYMM)"),
  status: z.enum(TAX_PERIOD_STATUS).default('open'),

  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const createTaxFilingPeriodSchema = taxFilingPeriodSchema.pick({
  firm_id: true,
  client_id: true,
  year_month: true,
  status: true,
});

export const updateTaxFilingPeriodSchema = taxFilingPeriodSchema.partial();

export type TaxFilingPeriod = z.infer<typeof taxFilingPeriodSchema>;
export type CreateTaxFilingPeriodInput = z.infer<typeof createTaxFilingPeriodSchema>;
export type UpdateTaxFilingPeriodInput = z.infer<typeof updateTaxFilingPeriodSchema>;
