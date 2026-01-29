-- Add the column
ALTER TABLE invoice_ranges 
ADD COLUMN firm_id UUID REFERENCES firms(id) ON DELETE CASCADE;

-- Update existing records (if any)
UPDATE invoice_ranges 
SET firm_id = clients.firm_id 
FROM clients 
WHERE invoice_ranges.client_id = clients.id;

-- Make it NOT NULL after backfilling
ALTER TABLE invoice_ranges ALTER COLUMN firm_id SET NOT NULL;

-- Simplify the policy
DROP POLICY "Users can manage invoice ranges in their firm" ON invoice_ranges;

CREATE POLICY "Users can manage invoice ranges in their firm" ON invoice_ranges
    FOR ALL
    USING (
        firm_id = public.get_auth_user_firm_id() 
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );