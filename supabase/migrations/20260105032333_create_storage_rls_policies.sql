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