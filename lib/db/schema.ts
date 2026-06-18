import { authUsers as users } from "drizzle-orm/supabase";
import { pgTable, index, unique, check, uuid, text, jsonb, timestamp, uniqueIndex, foreignKey, boolean, pgPolicy, integer, bigint, date, smallint, varchar, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const leads = pgTable("leads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	lead_code: text().notNull(),
	path: text().notNull(),
	data: jsonb().default({}).notNull(),
	status: text().default('new').notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_leads_created_at").using("btree", table.created_at.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_leads_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	unique("leads_lead_code_key").on(table.lead_code),
	check("leads_status_check", sql`status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text])`),
]);

export const line_accounts = pgTable("line_accounts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	line_user_id: text(),
	lead_id: uuid(),
	client_id: uuid(),
	display_name: text(),
	binding_code: text(),
	binding_code_created_at: timestamp({ withTimezone: true, mode: 'string' }),
	binding_confirmed: boolean().default(false).notNull(),
	followed_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	linked_at: timestamp({ withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("idx_line_accounts_binding_code").using("btree", table.binding_code.asc().nullsLast().op("text_ops")).where(sql`(binding_code IS NOT NULL)`),
	index("idx_line_accounts_client_id").using("btree", table.client_id.asc().nullsLast().op("uuid_ops")).where(sql`(client_id IS NOT NULL)`),
	index("idx_line_accounts_lead_id").using("btree", table.lead_id.asc().nullsLast().op("uuid_ops")).where(sql`(lead_id IS NOT NULL)`),
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "line_accounts_client_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.lead_id],
			foreignColumns: [leads.id],
			name: "line_accounts_lead_id_fkey"
		}).onDelete("set null"),
	unique("line_accounts_line_user_id_key").on(table.line_user_id),
]);

export const ecpay_payments = pgTable("ecpay_payments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firm_id: uuid().notNull(),
	client_id: uuid(),
	type: text().notNull(),
	status: text().default('pending').notNull(),
	amount: integer().notNull(),
	description: text().notNull(),
	checkout_token: text().notNull(),
	expires_at: timestamp({ withTimezone: true, mode: 'string' }),
	merchant_trade_no: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	gwsr: bigint({ mode: "number" }),
	card4no: text(),
	raw_payload: jsonb(),
	charged_at: timestamp({ withTimezone: true, mode: 'string' }),
	refunded_amount: integer(),
	refunded_at: timestamp({ withTimezone: true, mode: 'string' }),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ecpay_payments_client_id_idx").using("btree", table.client_id.asc().nullsLast().op("uuid_ops")).where(sql`(client_id IS NOT NULL)`),
	index("ecpay_payments_firm_id_status_idx").using("btree", table.firm_id.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "ecpay_payments_client_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "ecpay_payments_firm_id_fkey"
		}).onDelete("cascade"),
	unique("ecpay_payments_checkout_token_key").on(table.checkout_token),
	unique("ecpay_payments_merchant_trade_no_key").on(table.merchant_trade_no),
	pgPolicy("Users can manage ecpay_payments in their firm", { as: "permissive", for: "all", to: ["public"], using: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`, withCheck: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`  }),
	check("ecpay_payments_status_check", sql`status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'expired'::text, 'refunded'::text])`),
	check("ecpay_payments_type_check", sql`type = ANY (ARRAY['deposit'::text, 'subscription'::text, 'addon'::text])`),
]);

export const documents = pgTable("documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firm_id: uuid().notNull(),
	client_id: uuid().notNull(),
	doc_date: date().notNull(),
	type: text().notNull(),
	doc_type: text().notNull(),
	file_url: text(),
	ocr_status: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amount: bigint({ mode: "number" }),
	status: text().default('active').notNull(),
	created_by: uuid().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	filename: text(),
}, (table) => [
	index("documents_client_id_doc_date_idx").using("btree", table.client_id.asc().nullsLast().op("date_ops"), table.doc_date.asc().nullsLast().op("date_ops")),
	index("documents_client_id_status_idx").using("btree", table.client_id.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "documents_client_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.created_by],
			foreignColumns: [profiles.id],
			name: "documents_created_by_fkey"
		}),
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "documents_firm_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can manage documents in their firm", { as: "permissive", for: "all", to: ["public"], using: sql`((firm_id = get_auth_user_firm_id()) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`, withCheck: sql`((firm_id = get_auth_user_firm_id()) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`  }),
	check("documents_doc_type_check", sql`doc_type = ANY (ARRAY['invoice'::text, 'allowance'::text, 'other'::text])`),
	check("documents_ocr_status_check", sql`(ocr_status IS NULL) OR (ocr_status = ANY (ARRAY['pending'::text, 'done'::text, 'failed'::text]))`),
	check("documents_status_check", sql`status = ANY (ARRAY['active'::text, 'deleted'::text])`),
	check("documents_type_check", sql`type = ANY (ARRAY['VAT'::text, 'NON_VAT'::text])`),
]);

export const journal_entries = pgTable("journal_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firm_id: uuid().notNull(),
	client_id: uuid().notNull(),
	document_id: uuid(),
	voucher_no: text(),
	voucher_type: text().notNull(),
	entry_date: date().notNull(),
	description: text(),
	status: text().default('draft').notNull(),
	reverses_entry_id: uuid(),
	posted_at: timestamp({ withTimezone: true, mode: 'string' }),
	posted_by: uuid(),
	created_by: uuid(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("journal_entries_client_entry_date_idx").using("btree", table.client_id.asc().nullsLast().op("date_ops"), table.entry_date.asc().nullsLast().op("uuid_ops")),
	index("journal_entries_client_status_idx").using("btree", table.client_id.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("journal_entries_client_voucher_no_idx").using("btree", table.client_id.asc().nullsLast().op("uuid_ops"), table.voucher_no.asc().nullsLast().op("text_ops")).where(sql`(voucher_no IS NOT NULL)`),
	index("journal_entries_document_id_idx").using("btree", table.document_id.asc().nullsLast().op("uuid_ops")).where(sql`(document_id IS NOT NULL)`),
	index("journal_entries_reverses_entry_id_idx").using("btree", table.reverses_entry_id.asc().nullsLast().op("uuid_ops")).where(sql`(reverses_entry_id IS NOT NULL)`),
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "journal_entries_client_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.created_by],
			foreignColumns: [profiles.id],
			name: "journal_entries_created_by_fkey"
		}),
	foreignKey({
			columns: [table.document_id],
			foreignColumns: [documents.id],
			name: "journal_entries_document_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "journal_entries_firm_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.posted_by],
			foreignColumns: [profiles.id],
			name: "journal_entries_posted_by_fkey"
		}),
	foreignKey({
			columns: [table.reverses_entry_id],
			foreignColumns: [table.id],
			name: "journal_entries_reverses_entry_id_fkey"
		}),
	unique("journal_entries_document_id_key").on(table.document_id),
	pgPolicy("Users can manage journal_entries in their firm", { as: "permissive", for: "all", to: ["public"], using: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`, withCheck: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`  }),
	check("journal_entries_status_check", sql`status = ANY (ARRAY['draft'::text, 'posted'::text, 'reversed'::text])`),
	check("journal_entries_voucher_type_check", sql`voucher_type = ANY (ARRAY['收入'::text, '支出'::text, '轉帳'::text])`),
	check("voucher_no_required_when_booked", sql`(status = 'draft'::text) OR (voucher_no IS NOT NULL)`),
]);

export const journal_entry_lines = pgTable("journal_entry_lines", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	journal_entry_id: uuid().notNull(),
	line_number: smallint().notNull(),
	account_code: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	debit: bigint({ mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	credit: bigint({ mode: "number" }).default(0).notNull(),
	description: text(),
}, (table) => [
	index("journal_entry_lines_account_entry_idx").using("btree", table.account_code.asc().nullsLast().op("uuid_ops"), table.journal_entry_id.asc().nullsLast().op("text_ops")),
	uniqueIndex("journal_entry_lines_entry_line_idx").using("btree", table.journal_entry_id.asc().nullsLast().op("uuid_ops"), table.line_number.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.journal_entry_id],
			foreignColumns: [journal_entries.id],
			name: "journal_entry_lines_journal_entry_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can manage journal_entry_lines via parent entry", { as: "permissive", for: "all", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM journal_entries e
  WHERE ((e.id = journal_entry_lines.journal_entry_id) AND (((e.firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (e.client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM journal_entries e
  WHERE ((e.id = journal_entry_lines.journal_entry_id) AND (((e.firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (e.client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text)))))`  }),
	check("debit_credit_xor", sql`(debit > 0) <> (credit > 0)`),
	check("journal_entry_lines_credit_check", sql`credit >= 0`),
	check("journal_entry_lines_debit_check", sql`debit >= 0`),
]);

export const firms = pgTable("firms", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	tax_id: text().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	settings: jsonb(),
}, (table) => [
	pgPolicy("Authenticated users can create a firm", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(auth.role() = 'authenticated'::text)`  }),
	pgPolicy("Users can update their own firm", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own firm", { as: "permissive", for: "select", to: ["public"] }),
]);

export const invoices = pgTable("invoices", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firm_id: uuid().notNull(),
	client_id: uuid(),
	storage_path: text().notNull(),
	filename: text().notNull(),
	in_or_out: text().notNull(),
	status: text().default('uploaded'),
	extracted_data: jsonb(),
	uploaded_by: uuid().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	year_month: text(),
	invoice_serial_code: text(),
	tax_filing_period_id: uuid(),
	document_id: uuid().notNull(),
}, (table) => [
	index("idx_invoices_client_id").using("btree", table.client_id.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("idx_invoices_client_serial_unique").using("btree", table.client_id.asc().nullsLast().op("text_ops"), table.invoice_serial_code.asc().nullsLast().op("text_ops")),
	index("idx_invoices_created_at").using("btree", table.created_at.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_invoices_firm_id").using("btree", table.firm_id.asc().nullsLast().op("uuid_ops")),
	index("idx_invoices_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_invoices_tax_filing_period_id").using("btree", table.tax_filing_period_id.asc().nullsLast().op("uuid_ops")),
	index("idx_invoices_year_month").using("btree", table.year_month.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "invoices_client_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.document_id],
			foreignColumns: [documents.id],
			name: "invoices_document_id_fkey"
		}),
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "invoices_firm_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tax_filing_period_id],
			foreignColumns: [tax_filing_periods.id],
			name: "invoices_tax_filing_period_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.uploaded_by],
			foreignColumns: [profiles.id],
			name: "invoices_uploaded_by_fkey"
		}),
	unique("invoices_document_id_key").on(table.document_id),
	pgPolicy("Users can manage invoices in their firm", { as: "permissive", for: "all", to: ["public"], using: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`, withCheck: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`  }),
	check("invoices_in_or_out_check", sql`in_or_out = ANY (ARRAY['in'::text, 'out'::text])`),
	check("invoices_status_check", sql`status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'processed'::text, 'confirmed'::text, 'failed'::text])`),
]);

export const allowances = pgTable("allowances", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firm_id: uuid().notNull(),
	client_id: uuid(),
	tax_filing_period_id: uuid(),
	allowance_serial_code: text(),
	original_invoice_serial_code: text(),
	original_invoice_id: uuid(),
	in_or_out: text().notNull(),
	storage_path: text(),
	filename: text(),
	status: text().default('uploaded'),
	extracted_data: jsonb(),
	uploaded_by: uuid(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	document_id: uuid().notNull(),
}, (table) => [
	index("idx_allowances_client_period").using("btree", table.client_id.asc().nullsLast().op("uuid_ops"), table.tax_filing_period_id.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("idx_allowances_client_serial_unique").using("btree", table.client_id.asc().nullsLast().op("uuid_ops"), table.allowance_serial_code.asc().nullsLast().op("text_ops")),
	index("idx_allowances_original_invoice_id").using("btree", table.original_invoice_id.asc().nullsLast().op("uuid_ops")).where(sql`(original_invoice_id IS NOT NULL)`),
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "allowances_client_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.document_id],
			foreignColumns: [documents.id],
			name: "allowances_document_id_fkey"
		}),
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "allowances_firm_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.original_invoice_id],
			foreignColumns: [invoices.id],
			name: "allowances_original_invoice_id_fkey"
		}),
	foreignKey({
			columns: [table.tax_filing_period_id],
			foreignColumns: [tax_filing_periods.id],
			name: "allowances_tax_filing_period_id_fkey"
		}),
	foreignKey({
			columns: [table.uploaded_by],
			foreignColumns: [profiles.id],
			name: "allowances_uploaded_by_fkey"
		}),
	unique("allowances_document_id_key").on(table.document_id),
	pgPolicy("Users can manage allowances in their firm", { as: "permissive", for: "all", to: ["public"], using: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`, withCheck: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`  }),
]);

export const invoice_ranges = pgTable("invoice_ranges", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	client_id: uuid().notNull(),
	year_month: text().notNull(),
	invoice_type: text().notNull(),
	start_number: text().notNull(),
	end_number: text().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	firm_id: uuid().notNull(),
}, (table) => [
	index("idx_invoice_ranges_client_id").using("btree", table.client_id.asc().nullsLast().op("uuid_ops")),
	index("idx_invoice_ranges_year_month").using("btree", table.year_month.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "invoice_ranges_client_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "invoice_ranges_firm_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can manage invoice ranges in their firm", { as: "permissive", for: "all", to: ["public"], using: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`, withCheck: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`  }),
]);

export const tax_filing_periods = pgTable("tax_filing_periods", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firm_id: uuid().notNull(),
	client_id: uuid().notNull(),
	year_month: varchar({ length: 5 }).notNull(),
	status: text().default('open').notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	filing: jsonb().default({}).notNull(),
	client_ready_at: timestamp({ withTimezone: true, mode: 'string' }),
	voucher_generation_status: text().default('idle').notNull(),
	voucher_generation_started_at: timestamp({ withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_tax_filing_periods_client_ym").using("btree", table.client_id.asc().nullsLast().op("text_ops"), table.year_month.asc().nullsLast().op("uuid_ops")),
	index("tax_filing_periods_ready_idx").using("btree", table.firm_id.asc().nullsLast().op("timestamptz_ops"), table.client_ready_at.asc().nullsLast().op("timestamptz_ops")).where(sql`(client_ready_at IS NOT NULL)`),
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "tax_filing_periods_client_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "tax_filing_periods_firm_id_fkey"
		}).onDelete("cascade"),
	unique("tax_filing_periods_client_year_month_key").on(table.client_id, table.year_month),
	pgPolicy("Users can manage tax filing periods in their firm", { as: "permissive", for: "all", to: ["public"], using: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`, withCheck: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (client_id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`  }),
	check("tax_filing_periods_voucher_generation_status_check", sql`voucher_generation_status = ANY (ARRAY['idle'::text, 'running'::text])`),
]);

export const profiles = pgTable("profiles", {
	id: uuid().primaryKey().notNull(),
	firm_id: uuid(),
	name: text(),
	role: text().default('admin'),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	client_id: uuid(),
}, (table) => [
	index("idx_profiles_client_id").using("btree", table.client_id.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "profiles_client_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "profiles_firm_id_fkey"
		}),
	foreignKey({
			columns: [table.id],
			foreignColumns: [users.id],
			name: "profiles_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can link themselves to a firm", { as: "permissive", for: "update", to: ["public"], using: sql`((id = auth.uid()) AND (firm_id IS NULL))` }),
	pgPolicy("Users can update their own profile", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view profiles in their firm", { as: "permissive", for: "select", to: ["public"] }),
	check("profiles_role_check", sql`role = ANY (ARRAY['admin'::text, 'staff'::text, 'super_admin'::text, 'client'::text])`),
]);

export const clients = pgTable("clients", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firm_id: uuid(),
	name: text().notNull(),
	contact_person: text(),
	tax_id: text().notNull(),
	tax_payer_id: text().notNull(),
	industry: text(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	address: text(),
	phone: text(),
	email: text(),
	responsible_person: jsonb(),
	shareholders: jsonb(),
	platform_credentials: jsonb(),
	landlord: jsonb(),
	invoice_purchasing: jsonb(),
	mailing_address: text(),
}, (table) => [
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "clients_firm_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can manage clients in their firm", { as: "permissive", for: "all", to: ["public"], using: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`, withCheck: sql`(((firm_id = get_auth_user_firm_id()) AND ((get_auth_user_client_id() IS NULL) OR (id = get_auth_user_client_id()))) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`  }),
]);

export const fiscal_year_closes = pgTable("fiscal_year_closes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firm_id: uuid().notNull(),
	client_id: uuid().notNull(),
	gregorian_year: smallint().notNull(),
	closed_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	closed_by: uuid().notNull(),
	notes: text(),
}, (table) => [
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "fiscal_year_closes_client_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.closed_by],
			foreignColumns: [profiles.id],
			name: "fiscal_year_closes_closed_by_fkey"
		}),
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "fiscal_year_closes_firm_id_fkey"
		}).onDelete("cascade"),
	unique("fiscal_year_closes_client_year_unique").on(table.client_id, table.gregorian_year),
	pgPolicy("Users can manage fiscal_year_closes in their firm", { as: "permissive", for: "all", to: ["public"], using: sql`((firm_id = get_auth_user_firm_id()) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`, withCheck: sql`((firm_id = get_auth_user_firm_id()) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`  }),
]);

export const audit_trails = pgTable("audit_trails", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firm_id: uuid().notNull(),
	entity_table: text().notNull(),
	entity_id: uuid().notNull(),
	action: text().notNull(),
	before: jsonb(),
	reason: text(),
	actor_id: uuid(),
	actor_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("audit_trails_actor_idx").using("btree", table.actor_id.asc().nullsLast().op("timestamptz_ops"), table.actor_at.desc().nullsFirst().op("timestamptz_ops")).where(sql`(actor_id IS NOT NULL)`),
	index("audit_trails_entity_idx").using("btree", table.entity_table.asc().nullsLast().op("text_ops"), table.entity_id.asc().nullsLast().op("text_ops"), table.actor_at.desc().nullsFirst().op("uuid_ops")),
	index("audit_trails_firm_actor_at_idx").using("btree", table.firm_id.asc().nullsLast().op("uuid_ops"), table.actor_at.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.actor_id],
			foreignColumns: [profiles.id],
			name: "audit_trails_actor_id_fkey"
		}),
	foreignKey({
			columns: [table.firm_id],
			foreignColumns: [firms.id],
			name: "audit_trails_firm_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can insert audit_trails in their firm", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`((firm_id = get_auth_user_firm_id()) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text))`  }),
	pgPolicy("Users can view audit_trails in their firm", { as: "permissive", for: "select", to: ["public"] }),
	check("audit_trails_action_check", sql`action = ANY (ARRAY['created'::text, 'updated'::text, 'deleted'::text, 'posted'::text, 'reversed'::text])`),
]);

export const voucher_sequences = pgTable("voucher_sequences", {
	client_id: uuid().notNull(),
	seq_date: date().notNull(),
	next_seq: integer().default(1).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.client_id],
			foreignColumns: [clients.id],
			name: "voucher_sequences_client_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.client_id, table.seq_date], name: "voucher_sequences_pkey"}),
	pgPolicy("Users can manage voucher_sequences via client firm", { as: "permissive", for: "all", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = voucher_sequences.client_id) AND ((c.firm_id = get_auth_user_firm_id()) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = voucher_sequences.client_id) AND ((c.firm_id = get_auth_user_firm_id()) OR ((auth.jwt() ->> 'role'::text) = 'super_admin'::text)))))`  }),
]);
