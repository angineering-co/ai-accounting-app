-- documents: CTI parent for VAT (invoice/allowance) and NON_VAT ('other') files.
-- v1 writers only emit 'invoice' / 'allowance' (via existing upload flow);
-- 'other' enum value reserved for NON_VAT docs which will land with the Upload
-- Classifier work. duplicate_of / 'duplicate' status deliberately omitted from v1
-- per `feedback_no_speculative_status_values` — wrong-upload goes through soft delete.

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    doc_date DATE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('VAT', 'NON_VAT')),
    doc_type TEXT NOT NULL CHECK (doc_type IN ('invoice', 'allowance', 'other')),
    file_url TEXT NULL,
    ocr_status TEXT NULL CHECK (ocr_status IS NULL OR ocr_status IN ('pending', 'done', 'failed')),
    amount BIGINT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX documents_client_id_doc_date_idx ON documents(client_id, doc_date);
CREATE INDEX documents_client_id_status_idx ON documents(client_id, status);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage documents in their firm" ON documents
    FOR ALL
    USING (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
    WITH CHECK (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );
