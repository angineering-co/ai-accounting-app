-- Add year_month column to invoices table
ALTER TABLE invoices ADD COLUMN year_month TEXT;

-- Create an index for year_month to speed up filtering
CREATE INDEX idx_invoices_year_month ON invoices(year_month);