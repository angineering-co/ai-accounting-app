-- Minimal seed data for empty report tests

INSERT INTO firms (id, name, tax_id, created_at)
VALUES (
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  '空白測試公司',
  '99999999',
  '2026-01-01 00:00:00+00'
);

INSERT INTO clients (id, firm_id, name, contact_person, tax_id, tax_payer_id, industry, created_at)
VALUES (
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  '空白測試公司',
  '測試人',
  '99999999',
  '999999999',
  '測試用',
  '2026-01-01 00:00:00+00'
);

INSERT INTO profiles (id, firm_id, name, role)
VALUES (
  '__TEST_USER_ID__',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  'Report Test User',
  'admin'
)
ON CONFLICT (id) DO UPDATE
SET firm_id = EXCLUDED.firm_id,
    name = EXCLUDED.name,
    role = EXCLUDED.role;

INSERT INTO tax_filing_periods (id, firm_id, client_id, year_month, status, created_at, updated_at)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  '11409',
  'open',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
);
