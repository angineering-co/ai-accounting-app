   -- Create invoices table
   CREATE TABLE invoices (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       firm_id UUID REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
       client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
       storage_path TEXT NOT NULL,
       filename TEXT NOT NULL,
       in_or_out TEXT CHECK (in_or_out IN ('in', 'out')) NOT NULL,
       status TEXT CHECK (status IN ('uploaded', 'processing', 'processed', 'confirmed', 'failed')) DEFAULT 'uploaded',
       extracted_data JSONB, -- Stores AI-extracted fields
       uploaded_by UUID REFERENCES profiles(id) NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now()
   );

   -- Enable RLS
   ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

   -- RLS Policy: Users can manage invoices in their firm
   CREATE POLICY "Users can manage invoices in their firm" ON invoices
       FOR ALL
       USING (
           firm_id = public.get_auth_user_firm_id()
           OR (auth.jwt() ->> 'role' = 'super_admin')
       );

   -- Create index for common queries
   CREATE INDEX idx_invoices_firm_id ON invoices(firm_id);
   CREATE INDEX idx_invoices_client_id ON invoices(client_id);
   CREATE INDEX idx_invoices_status ON invoices(status);
   CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);