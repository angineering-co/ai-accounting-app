-- Add client settings columns for self-onboarding portal
-- Company contact info (scalar columns for queryability)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Structured settings (JSONB columns)
-- responsible_person: {name, national_id, address, capital_contribution}
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS responsible_person JSONB;

-- shareholders: [{name, national_id, address, capital_contribution}, ...]
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS shareholders JSONB;

-- platform_credentials: {einvoice_username, einvoice_password, tax_filing_password}
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS platform_credentials JSONB;

-- landlord: {type: 'company'|'individual', rent_amount: number}
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS landlord JSONB;

-- invoice_purchasing: {enabled, two_part_manual, three_part_manual, two_part_register, three_part_register}
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS invoice_purchasing JSONB;
