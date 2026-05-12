-- Storage bucket for VAT tax-filing artifacts:
--   - .TXT / .TET_U snapshots (overwritten each generation)
--   - IRS receipt PDFs uploaded by firm staff (multi-file)
--
-- Path layout: {firm_id}/{year_month}/{client_id}/...
--   storage.foldername(name)[1] = firm_id
--   storage.foldername(name)[2] = year_month
--   storage.foldername(name)[3] = client_id
--
-- Access model (mirrors the table-level pattern in 20260302090000_add_client_portal.sql):
--   - Firm staff (profiles.client_id IS NULL): full CRUD inside their firm folder
--   - Client portal user (profiles.client_id IS NOT NULL): SELECT only, AND only on
--     paths where folder[3] = their client_id
--   - super_admin (JWT role): bypasses both checks

INSERT INTO storage.buckets (id, name, public)
VALUES ('vat-tax-filings', 'vat-tax-filings', false)
ON CONFLICT (id) DO NOTHING;

-- SELECT: firm staff anywhere in firm folder; client portal user only in their
-- own client_id subfolder; super_admin everywhere.
CREATE POLICY "vat-tax-filings: read"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'vat-tax-filings'
    AND (
        (
            (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
            AND (
                (SELECT client_id FROM profiles WHERE id = auth.uid()) IS NULL
                OR (storage.foldername(name))[3] = (SELECT client_id::text FROM profiles WHERE id = auth.uid())
            )
        )
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
);

-- INSERT: firm staff only (client portal users blocked).
CREATE POLICY "vat-tax-filings: insert (staff only)"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'vat-tax-filings'
    AND (
        (
            (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
            AND (SELECT client_id FROM profiles WHERE id = auth.uid()) IS NULL
        )
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
);

-- UPDATE: firm staff only. Needed so snapshot regeneration and same-filename
-- re-uploads can use upsert.
CREATE POLICY "vat-tax-filings: update (staff only)"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'vat-tax-filings'
    AND (
        (
            (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
            AND (SELECT client_id FROM profiles WHERE id = auth.uid()) IS NULL
        )
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
)
WITH CHECK (
    bucket_id = 'vat-tax-filings'
    AND (
        (
            (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
            AND (SELECT client_id FROM profiles WHERE id = auth.uid()) IS NULL
        )
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
);

-- DELETE: firm staff only.
CREATE POLICY "vat-tax-filings: delete (staff only)"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'vat-tax-filings'
    AND (
        (
            (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
            AND (SELECT client_id FROM profiles WHERE id = auth.uid()) IS NULL
        )
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
);
