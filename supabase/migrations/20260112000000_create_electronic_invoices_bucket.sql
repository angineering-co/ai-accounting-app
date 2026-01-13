-- Create the electronic-invoices bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('electronic-invoices', 'electronic-invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: Users can upload to their firm's folder
CREATE POLICY "Users can upload electronic invoices for their firm"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'electronic-invoices' AND
    (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
);

-- Policy: Users can read invoices from their firm
CREATE POLICY "Users can read electronic invoices from their firm"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'electronic-invoices' AND
    (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
);

-- Policy: Users can delete invoices from their firm's folder
CREATE POLICY "Users can delete electronic invoices from their firm"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'electronic-invoices' AND
    (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
);
