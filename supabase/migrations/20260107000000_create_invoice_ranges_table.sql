-- Create invoice_ranges table
CREATE TABLE invoice_ranges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
    year_month TEXT NOT NULL, -- e.g., "11309"
    invoice_type TEXT NOT NULL, -- e.g., "手開三聯式"
    start_number TEXT NOT NULL, -- 10 chars
    end_number TEXT NOT NULL, -- 10 chars
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE invoice_ranges ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage invoice ranges for clients in their firm
CREATE POLICY "Users can manage invoice ranges in their firm" ON invoice_ranges
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = invoice_ranges.client_id
            AND (clients.firm_id = public.get_auth_user_firm_id() OR (auth.jwt() ->> 'role' = 'super_admin'))
        )
    );

-- Create index for common queries
CREATE INDEX idx_invoice_ranges_client_id ON invoice_ranges(client_id);
CREATE INDEX idx_invoice_ranges_year_month ON invoice_ranges(year_month);

