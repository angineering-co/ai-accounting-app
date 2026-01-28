create table public.tax_filing_periods (
  id uuid not null default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  year_month varchar(5) not null,
  status text not null default 'open',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  
  -- Constraints
  constraint tax_filing_periods_pkey primary key (id),
  constraint tax_filing_periods_client_year_month_key unique (client_id, year_month)
);

-- Add index for lookups
create index idx_tax_filing_periods_client_ym on tax_filing_periods(client_id, year_month);

-- Update invoices table
alter table invoices 
add column tax_filing_period_id uuid references tax_filing_periods(id) on delete set null;

-- Add index for filtering invoices by period bucket
create index idx_invoices_tax_filing_period_id on invoices(tax_filing_period_id);
