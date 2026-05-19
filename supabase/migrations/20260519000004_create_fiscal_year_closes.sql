-- fiscal_year_closes: GL-module hard lock. One row per (client_id, gregorian_year)
-- means that year's posted entries can no longer be edited, reversed, or have new
-- entries dated into it. Distinct from tax_filing_period.status='filed' (VAT-module
-- lock on invoices/allowances); the two locks are orthogonal. Phase 5 just creates
-- the table; the guard predicate is added inside each mutating RPC in Phase 8+.

CREATE TABLE fiscal_year_closes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    gregorian_year SMALLINT NOT NULL,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by UUID NOT NULL REFERENCES profiles(id),
    notes TEXT NULL,
    CONSTRAINT fiscal_year_closes_client_year_unique UNIQUE (client_id, gregorian_year)
);

ALTER TABLE fiscal_year_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage fiscal_year_closes in their firm" ON fiscal_year_closes
    FOR ALL
    USING (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
    WITH CHECK (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );
