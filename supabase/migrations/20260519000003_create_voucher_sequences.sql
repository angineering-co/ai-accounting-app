-- voucher_sequences: per-client per-day next-seq counter for YYYYMMDD-NNNNN voucher_no.
-- The seq is consumed by the post RPC (Phase 8) inside a SELECT ... FOR UPDATE +
-- UPSERT pattern so concurrent posts on the same client+date serialize and produce
-- gap-free numbers. Phase 5 just creates the table; no writers yet.

CREATE TABLE voucher_sequences (
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    seq_date DATE NOT NULL,
    next_seq INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (client_id, seq_date)
);

ALTER TABLE voucher_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage voucher_sequences via client firm" ON voucher_sequences
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = voucher_sequences.client_id
              AND (
                  c.firm_id = public.get_auth_user_firm_id()
                  OR (auth.jwt() ->> 'role' = 'super_admin')
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = voucher_sequences.client_id
              AND (
                  c.firm_id = public.get_auth_user_firm_id()
                  OR (auth.jwt() ->> 'role' = 'super_admin')
              )
        )
    );
