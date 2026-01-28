-- Migration Script to backfill TaxFilingPeriods for existing Invoices

-- 1. Create Tax Filing Periods for all unique client + year_month combinations found in invoices
--    that don't already exist in the tax_filing_periods table.
insert into tax_filing_periods (firm_id, client_id, year_month, status)
select distinct 
    i.firm_id, 
    i.client_id, 
    i.year_month, 
    'open' as status
from invoices i
left join tax_filing_periods p 
    on i.client_id = p.client_id 
    and i.year_month = p.year_month
where i.year_month is not null 
  and p.id is null;

-- 2. Link Invoices to their corresponding Tax Filing Period
--    This matches strict "Invoice Date == Filing Period" logic for now,
--    which is a safe default for backfilling.
update invoices i
set tax_filing_period_id = p.id
from tax_filing_periods p
where i.client_id = p.client_id
  and i.year_month = p.year_month
  and i.tax_filing_period_id is null;
