-- Add invoice_serial_code column to invoices table
ALTER TABLE invoices ADD COLUMN invoice_serial_code TEXT;

-- Backfill data from extracted_data
UPDATE invoices
SET invoice_serial_code = extracted_data->>'invoiceSerialCode'
WHERE extracted_data->>'invoiceSerialCode' IS NOT NULL;

-- Create unique index on client_id and invoice_serial_code
-- NULL values in invoice_serial_code will not conflict with each other
CREATE UNIQUE INDEX idx_invoices_client_serial_unique 
ON invoices(client_id, invoice_serial_code)
WHERE invoice_serial_code IS NOT NULL;