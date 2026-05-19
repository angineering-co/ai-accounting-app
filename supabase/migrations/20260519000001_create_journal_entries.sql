-- journal_entries: voucher header. voucher_no is YYYYMMDD-NNNNN, assigned only when
-- status flips draft -> posted via the post RPC (Phase 8, not yet implemented).
-- reverses_entry_id is a self-FK structural link; reversal audit metadata lives in
-- audit_trails. document_id is UNIQUE to enforce 1:1 entry-per-document semantics
-- (system-generated entries like depreciation set it NULL).

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    document_id UUID UNIQUE NULL REFERENCES documents(id) ON DELETE SET NULL,
    voucher_no TEXT NULL,
    voucher_type TEXT NOT NULL CHECK (voucher_type IN ('收入', '支出', '轉帳')),
    entry_date DATE NOT NULL,
    description TEXT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
    reverses_entry_id UUID NULL REFERENCES journal_entries(id),
    posted_at TIMESTAMPTZ NULL,
    posted_by UUID NULL REFERENCES profiles(id),
    created_by UUID NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT voucher_no_required_when_booked CHECK (status = 'draft' OR voucher_no IS NOT NULL)
);

CREATE UNIQUE INDEX journal_entries_client_voucher_no_idx
    ON journal_entries(client_id, voucher_no)
    WHERE voucher_no IS NOT NULL;
CREATE INDEX journal_entries_client_entry_date_idx ON journal_entries(client_id, entry_date);
CREATE INDEX journal_entries_client_status_idx ON journal_entries(client_id, status);
CREATE INDEX journal_entries_document_id_idx ON journal_entries(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX journal_entries_reverses_entry_id_idx ON journal_entries(reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage journal_entries in their firm" ON journal_entries
    FOR ALL
    USING (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
    WITH CHECK (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );
