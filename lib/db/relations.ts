import { relations } from "drizzle-orm/relations";
import { authUsers as usersInAuth } from "drizzle-orm/supabase";
import { clients, line_accounts, leads, documents, profiles, firms, journal_entries, journal_entry_lines, tax_filing_periods, invoices, allowances, invoice_ranges, fiscal_year_closes, audit_trails, voucher_sequences } from "./schema";

export const line_accountsRelations = relations(line_accounts, ({one}) => ({
	client: one(clients, {
		fields: [line_accounts.client_id],
		references: [clients.id]
	}),
	lead: one(leads, {
		fields: [line_accounts.lead_id],
		references: [leads.id]
	}),
}));

export const clientsRelations = relations(clients, ({one, many}) => ({
	line_accounts: many(line_accounts),
	documents: many(documents),
	journal_entries: many(journal_entries),
	tax_filing_periods: many(tax_filing_periods),
	invoices: many(invoices),
	allowances: many(allowances),
	invoice_ranges: many(invoice_ranges),
	profiles: many(profiles),
	firm: one(firms, {
		fields: [clients.firm_id],
		references: [firms.id]
	}),
	fiscal_year_closes: many(fiscal_year_closes),
	voucher_sequences: many(voucher_sequences),
}));

export const leadsRelations = relations(leads, ({many}) => ({
	line_accounts: many(line_accounts),
}));

export const documentsRelations = relations(documents, ({one, many}) => ({
	client: one(clients, {
		fields: [documents.client_id],
		references: [clients.id]
	}),
	profile: one(profiles, {
		fields: [documents.created_by],
		references: [profiles.id]
	}),
	firm: one(firms, {
		fields: [documents.firm_id],
		references: [firms.id]
	}),
	journal_entries: many(journal_entries),
	invoices: many(invoices),
	allowances: many(allowances),
}));

export const profilesRelations = relations(profiles, ({one, many}) => ({
	documents: many(documents),
	journal_entries_created_by: many(journal_entries, {
		relationName: "journal_entries_created_by_profiles_id"
	}),
	journal_entries_posted_by: many(journal_entries, {
		relationName: "journal_entries_posted_by_profiles_id"
	}),
	invoices: many(invoices),
	allowances: many(allowances),
	client: one(clients, {
		fields: [profiles.client_id],
		references: [clients.id]
	}),
	firm: one(firms, {
		fields: [profiles.firm_id],
		references: [firms.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [profiles.id],
		references: [usersInAuth.id]
	}),
	fiscal_year_closes: many(fiscal_year_closes),
	audit_trails: many(audit_trails),
}));

export const firmsRelations = relations(firms, ({many}) => ({
	documents: many(documents),
	journal_entries: many(journal_entries),
	tax_filing_periods: many(tax_filing_periods),
	invoices: many(invoices),
	allowances: many(allowances),
	invoice_ranges: many(invoice_ranges),
	profiles: many(profiles),
	clients: many(clients),
	fiscal_year_closes: many(fiscal_year_closes),
	audit_trails: many(audit_trails),
}));

export const journal_entriesRelations = relations(journal_entries, ({one, many}) => ({
	client: one(clients, {
		fields: [journal_entries.client_id],
		references: [clients.id]
	}),
	profile_created_by: one(profiles, {
		fields: [journal_entries.created_by],
		references: [profiles.id],
		relationName: "journal_entries_created_by_profiles_id"
	}),
	document: one(documents, {
		fields: [journal_entries.document_id],
		references: [documents.id]
	}),
	firm: one(firms, {
		fields: [journal_entries.firm_id],
		references: [firms.id]
	}),
	profile_posted_by: one(profiles, {
		fields: [journal_entries.posted_by],
		references: [profiles.id],
		relationName: "journal_entries_posted_by_profiles_id"
	}),
	journal_entry: one(journal_entries, {
		fields: [journal_entries.reverses_entry_id],
		references: [journal_entries.id],
		relationName: "journal_entries_reverses_entry_id_journal_entries_id"
	}),
	journal_entries: many(journal_entries, {
		relationName: "journal_entries_reverses_entry_id_journal_entries_id"
	}),
	journal_entry_lines: many(journal_entry_lines),
}));

export const journal_entry_linesRelations = relations(journal_entry_lines, ({one}) => ({
	journal_entry: one(journal_entries, {
		fields: [journal_entry_lines.journal_entry_id],
		references: [journal_entries.id]
	}),
}));

export const tax_filing_periodsRelations = relations(tax_filing_periods, ({one, many}) => ({
	client: one(clients, {
		fields: [tax_filing_periods.client_id],
		references: [clients.id]
	}),
	firm: one(firms, {
		fields: [tax_filing_periods.firm_id],
		references: [firms.id]
	}),
	invoices: many(invoices),
	allowances: many(allowances),
}));

export const invoicesRelations = relations(invoices, ({one, many}) => ({
	client: one(clients, {
		fields: [invoices.client_id],
		references: [clients.id]
	}),
	document: one(documents, {
		fields: [invoices.document_id],
		references: [documents.id]
	}),
	firm: one(firms, {
		fields: [invoices.firm_id],
		references: [firms.id]
	}),
	tax_filing_period: one(tax_filing_periods, {
		fields: [invoices.tax_filing_period_id],
		references: [tax_filing_periods.id]
	}),
	profile: one(profiles, {
		fields: [invoices.uploaded_by],
		references: [profiles.id]
	}),
	allowances: many(allowances),
}));

export const allowancesRelations = relations(allowances, ({one}) => ({
	client: one(clients, {
		fields: [allowances.client_id],
		references: [clients.id]
	}),
	document: one(documents, {
		fields: [allowances.document_id],
		references: [documents.id]
	}),
	firm: one(firms, {
		fields: [allowances.firm_id],
		references: [firms.id]
	}),
	invoice: one(invoices, {
		fields: [allowances.original_invoice_id],
		references: [invoices.id]
	}),
	tax_filing_period: one(tax_filing_periods, {
		fields: [allowances.tax_filing_period_id],
		references: [tax_filing_periods.id]
	}),
	profile: one(profiles, {
		fields: [allowances.uploaded_by],
		references: [profiles.id]
	}),
}));

export const invoice_rangesRelations = relations(invoice_ranges, ({one}) => ({
	client: one(clients, {
		fields: [invoice_ranges.client_id],
		references: [clients.id]
	}),
	firm: one(firms, {
		fields: [invoice_ranges.firm_id],
		references: [firms.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	profiles: many(profiles),
}));

export const fiscal_year_closesRelations = relations(fiscal_year_closes, ({one}) => ({
	client: one(clients, {
		fields: [fiscal_year_closes.client_id],
		references: [clients.id]
	}),
	profile: one(profiles, {
		fields: [fiscal_year_closes.closed_by],
		references: [profiles.id]
	}),
	firm: one(firms, {
		fields: [fiscal_year_closes.firm_id],
		references: [firms.id]
	}),
}));

export const audit_trailsRelations = relations(audit_trails, ({one}) => ({
	profile: one(profiles, {
		fields: [audit_trails.actor_id],
		references: [profiles.id]
	}),
	firm: one(firms, {
		fields: [audit_trails.firm_id],
		references: [firms.id]
	}),
}));

export const voucher_sequencesRelations = relations(voucher_sequences, ({one}) => ({
	client: one(clients, {
		fields: [voucher_sequences.client_id],
		references: [clients.id]
	}),
}));