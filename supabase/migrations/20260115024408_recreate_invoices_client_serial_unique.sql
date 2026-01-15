DROP INDEX IF EXISTS idx_invoices_client_serial_unique;
CREATE UNIQUE INDEX idx_invoices_client_serial_unique
ON invoices (client_id, invoice_serial_code);