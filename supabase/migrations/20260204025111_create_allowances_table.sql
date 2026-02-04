-- Migration: Create allowances table for 折讓證明單 (Allowance Certificates)
-- See docs/ALLOWANCE_RETURN_IMPLEMENTATION.md for design decisions

CREATE TABLE allowances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    tax_filing_period_id UUID REFERENCES tax_filing_periods(id),
    
    -- Document identification
    allowance_serial_code TEXT,              -- Electronic allowances have their own code; paper = NULL
    original_invoice_serial_code TEXT,       -- Populated after extraction; used for lookup
    original_invoice_id UUID REFERENCES invoices(id),  -- Linked when original invoice exists
    
    -- Classification (derived from client tax_id vs seller/buyer in extracted_data)
    in_or_out TEXT NOT NULL,
    
    -- For uploaded documents (paper allowances)
    storage_path TEXT,
    filename TEXT,
    
    -- Status & metadata (same as invoices; validation at app level)
    status TEXT DEFAULT 'uploaded',
    extracted_data JSONB,  -- Contains: allowanceType, amount, taxAmount, date, etc.
    
    uploaded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE allowances ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage allowances in their firm
CREATE POLICY "Users can manage allowances in their firm" ON allowances
    FOR ALL
    USING (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );

-- Indexes based on known query patterns

-- 1. Report generation: query by client + period
--    Covers the most common read pattern for generating TXT/TET_U
CREATE INDEX idx_allowances_client_period 
ON allowances(client_id, tax_filing_period_id);

-- 2. Invoice detail view: show all allowances linked to an invoice
--    Needed for displaying allowance history on invoice page
--    Note: FK does not auto-create index in PostgreSQL
CREATE INDEX idx_allowances_original_invoice_id 
ON allowances(original_invoice_id) 
WHERE original_invoice_id IS NOT NULL;

-- 3. Electronic allowances: unique by their own serial code
--    Prevents duplicate imports of same electronic allowance
CREATE UNIQUE INDEX idx_allowances_client_serial_unique
ON allowances (client_id, allowance_serial_code)
WHERE allowance_serial_code IS NOT NULL;
