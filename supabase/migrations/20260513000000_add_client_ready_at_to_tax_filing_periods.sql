-- Set when the client clicks the portal "Ready for review" button.
-- One-shot; uploads remain enabled regardless (status is unchanged).

alter table public.tax_filing_periods
  add column client_ready_at timestamptz;

-- Partial index sized to the firm-dashboard widget's exact query.
create index tax_filing_periods_ready_idx
  on public.tax_filing_periods (firm_id, client_ready_at desc)
  where client_ready_at is not null and status = 'open';
