-- Phase 5.5: link invoices / allowances to their CTI parent `documents` row.
-- NULLABLE for now — rows created before the documents-first upload flow have no
-- parent document. Phase 6 backfills those old rows and tightens this to
-- NOT NULL UNIQUE.

ALTER TABLE invoices
    ADD COLUMN document_id UUID NULL REFERENCES documents(id);

ALTER TABLE allowances
    ADD COLUMN document_id UUID NULL REFERENCES documents(id);

CREATE INDEX invoices_document_id_idx ON invoices(document_id);
CREATE INDEX allowances_document_id_idx ON allowances(document_id);
