-- System-generated journal entries (no source document) need their own identity for
-- idempotency, since document_id is NULL for them and can't serve as the key. A generic
-- (type, key) pair covers the VAT period-close entry now and a future year-end closing or
-- recurring depreciation entry without a type-specific column:
--   system_entry_type = 'vat_close'        -> system_entry_key = year_month (YYYMM)
--   system_entry_type = 'year_end_closing' -> system_entry_key = fiscal ROC year
-- One such entry per (client_id, type, key). Document-linked entries leave both NULL.
--
-- No CHECK on the allowed types: every writer is internal typed-constant code (no user or
-- AI input to guard), so the app layer owns the vocabulary and we avoid an ALTER migration
-- each time a new system-entry type is added. The partial unique index below is the
-- integrity that actually matters (no duplicate system entry per scope).

ALTER TABLE journal_entries
    ADD COLUMN system_entry_type TEXT NULL,
    ADD COLUMN system_entry_key TEXT NULL;

CREATE UNIQUE INDEX journal_entries_system_entry_idx
    ON journal_entries(client_id, system_entry_type, system_entry_key)
    WHERE system_entry_type IS NOT NULL;
