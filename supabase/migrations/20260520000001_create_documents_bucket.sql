-- Storage bucket for uploaded source documents (invoices, allowances, and later
-- doc_type='other'). Replaces the historically misnamed `invoices` bucket.
--
-- Path layout: {firm_id}/{client_id}/{period_yyymm}/{uuid}.{ext}
--   storage.foldername(name)[1] = firm_id
--   storage.foldername(name)[2] = client_id
--   storage.foldername(name)[3] = period_yyymm
-- Every object uses this layout — the Phase 5.6 copy script reorders legacy
-- files into it, and new uploads write it directly.
--
-- Access model (mirrors the portal-aware pattern of the `vat-tax-filings` bucket,
-- 20260512000001_create_vat_tax_filings_bucket.sql):
--   - Firm staff (profiles.client_id IS NULL): full access inside their firm folder.
--   - Client portal user (profiles.client_id IS NOT NULL): access only where
--     foldername[2] = their own client_id. Portal users both upload and preview
--     their own documents, so they get INSERT/SELECT/DELETE — unlike the
--     staff-only `vat-tax-filings` bucket.
-- This is intentionally stricter than the legacy `invoices` bucket, which checked
-- firm membership only and let any firm member reach any client's files.

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- INSERT: firm staff anywhere in their firm folder; portal user only in their
-- own client_id subfolder.
CREATE POLICY "documents: insert"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
    AND (
        (SELECT client_id FROM profiles WHERE id = auth.uid()) IS NULL
        OR (storage.foldername(name))[2] = (SELECT client_id::text FROM profiles WHERE id = auth.uid())
    )
);

-- SELECT: same scoping as INSERT.
CREATE POLICY "documents: read"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
    AND (
        (SELECT client_id FROM profiles WHERE id = auth.uid()) IS NULL
        OR (storage.foldername(name))[2] = (SELECT client_id::text FROM profiles WHERE id = auth.uid())
    )
);

-- DELETE: same scoping. Portal users delete their own pre-AI queue uploads, so
-- they need this in their own subfolder.
CREATE POLICY "documents: delete"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
    AND (
        (SELECT client_id FROM profiles WHERE id = auth.uid()) IS NULL
        OR (storage.foldername(name))[2] = (SELECT client_id::text FROM profiles WHERE id = auth.uid())
    )
);
