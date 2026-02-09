-- Cleanup existing report fixture data for empty client

DELETE FROM allowances
WHERE client_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

DELETE FROM invoices
WHERE client_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

DELETE FROM invoice_ranges
WHERE client_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

DELETE FROM tax_filing_periods
WHERE client_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

DELETE FROM profiles
WHERE firm_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

DELETE FROM clients
WHERE id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

DELETE FROM firms
WHERE id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
