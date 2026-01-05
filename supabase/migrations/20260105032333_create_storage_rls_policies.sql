-- Create the invoices bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: Users can upload to their firm's folder
CREATE POLICY "Users can upload invoices for their firm"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'invoices' AND
    (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
);

-- Policy: Users can read invoices from their firm
CREATE POLICY "Users can read invoices from their firm"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'invoices' AND
    (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
);

-- Policy: Users can delete invoices from their firm's folder
CREATE POLICY "Users can delete invoices from their firm"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'invoices' AND
    (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
);
