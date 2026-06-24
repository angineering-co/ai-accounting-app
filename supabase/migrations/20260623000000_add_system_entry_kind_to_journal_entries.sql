-- System-generated journal entries (no source document) need their own identity for
-- idempotency, since document_id is NULL for them and can't serve as the key. A generic
-- (kind, key) pair covers the VAT period-close entry now and a future year-end closing or
-- recurring depreciation entry without a kind-specific column:
--   system_entry_kind = 'vat_close'        -> system_entry_key = year_month (YYYMM)
--   system_entry_kind = 'year_end_closing' -> system_entry_key = fiscal ROC year
-- One such entry per (client_id, kind, key). Document-linked entries leave both NULL.

ALTER TABLE journal_entries
    ADD COLUMN system_entry_kind TEXT NULL
        CHECK (system_entry_kind IS NULL OR system_entry_kind IN ('vat_close')),
    ADD COLUMN system_entry_key TEXT NULL;

CREATE UNIQUE INDEX journal_entries_system_entry_idx
    ON journal_entries(client_id, system_entry_kind, system_entry_key)
    WHERE system_entry_kind IS NOT NULL;
