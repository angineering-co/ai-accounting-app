-- journal_entry_lines: detail rows for a voucher. debit XOR credit enforced at CHECK;
-- balance (sum debit == sum credit, both > 0) enforced at service layer on post.
-- RLS goes through the parent entry — adding firm_id/client_id/entry_date/status here
-- is reserved for later denormalization (see plan's "Future denormalization triggers").

CREATE TABLE journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_number SMALLINT NOT NULL,
    account_code TEXT NOT NULL,
    debit BIGINT NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit BIGINT NOT NULL DEFAULT 0 CHECK (credit >= 0),
    description TEXT NULL,
    CONSTRAINT debit_credit_xor CHECK ((debit > 0) <> (credit > 0))
);

CREATE UNIQUE INDEX journal_entry_lines_entry_line_idx
    ON journal_entry_lines(journal_entry_id, line_number);
CREATE INDEX journal_entry_lines_account_entry_idx
    ON journal_entry_lines(account_code, journal_entry_id);

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage journal_entry_lines via parent entry" ON journal_entry_lines
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM journal_entries e
            WHERE e.id = journal_entry_lines.journal_entry_id
              AND (
                  e.firm_id = public.get_auth_user_firm_id()
                  OR (auth.jwt() ->> 'role' = 'super_admin')
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM journal_entries e
            WHERE e.id = journal_entry_lines.journal_entry_id
              AND (
                  e.firm_id = public.get_auth_user_firm_id()
                  OR (auth.jwt() ->> 'role' = 'super_admin')
              )
        )
    );
