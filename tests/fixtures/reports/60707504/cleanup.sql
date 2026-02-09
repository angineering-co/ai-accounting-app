-- Cleanup existing report fixture data for client 60707504

DELETE FROM allowances
WHERE client_id = '2c3c7f79-1193-406c-90d6-ae7c98de4084';

DELETE FROM invoices
WHERE client_id = '2c3c7f79-1193-406c-90d6-ae7c98de4084';

DELETE FROM invoice_ranges
WHERE client_id = '2c3c7f79-1193-406c-90d6-ae7c98de4084';

DELETE FROM tax_filing_periods
WHERE client_id = '2c3c7f79-1193-406c-90d6-ae7c98de4084';

DELETE FROM profiles
WHERE firm_id = '52fbe251-4fea-40cb-a0cb-640e4e25e810';

DELETE FROM clients
WHERE id = '2c3c7f79-1193-406c-90d6-ae7c98de4084';

DELETE FROM firms
WHERE id = '52fbe251-4fea-40cb-a0cb-640e4e25e810';
