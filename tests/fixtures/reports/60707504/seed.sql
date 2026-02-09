-- Seed data for report integration tests (client tax_id: 60707504)

INSERT INTO firms (id, name, tax_id, created_at)
VALUES (
  '52fbe251-4fea-40cb-a0cb-640e4e25e810',
  '昂工科技有限公司',
  '60707504',
  '2025-12-31 05:32:02.646319+00'
);

INSERT INTO clients (id, firm_id, name, contact_person, tax_id, tax_payer_id, industry, created_at)
VALUES (
  '2c3c7f79-1193-406c-90d6-ae7c98de4084',
  '52fbe251-4fea-40cb-a0cb-640e4e25e810',
  '昂工科技有限公司',
  '王致昂',
  '60707504',
  '351406082',
  '軟體資訊',
  '2025-12-31 05:32:02.646319+00'
);

INSERT INTO profiles (id, firm_id, name, role)
VALUES (
  '__TEST_USER_ID__',
  '52fbe251-4fea-40cb-a0cb-640e4e25e810',
  'Report Test User',
  'admin'
)
ON CONFLICT (id) DO UPDATE
SET firm_id = EXCLUDED.firm_id,
    name = EXCLUDED.name,
    role = EXCLUDED.role;

INSERT INTO tax_filing_periods (id, firm_id, client_id, year_month, status, created_at, updated_at)
VALUES (
  '78d3b3d0-2ad0-4b53-9ad6-7ce51f2e0f01',
  '52fbe251-4fea-40cb-a0cb-640e4e25e810',
  '2c3c7f79-1193-406c-90d6-ae7c98de4084',
  '11409',
  'open',
  '2026-01-07 00:00:00+00',
  '2026-01-07 00:00:00+00'
);

INSERT INTO invoice_ranges (id, firm_id, client_id, year_month, invoice_type, start_number, end_number, created_at)
VALUES
  (
    '21ebb42d-bb7d-4dae-8d22-5fa3385b9d05',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '11409',
    '手開二聯式',
    'RV25776650',
    'RV25776699',
    '2026-01-07 07:07:12.730515+00'
  ),
  (
    'ce04935f-7f12-4cc8-bf61-e4e7cb23f411',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '11409',
    '手開三聯式',
    'RT33662450',
    'RT33662499',
    '2026-01-07 07:06:41.273751+00'
  );

INSERT INTO invoices (
  id,
  firm_id,
  client_id,
  storage_path,
  filename,
  in_or_out,
  status,
  extracted_data,
  uploaded_by,
  created_at,
  year_month,
  invoice_serial_code,
  tax_filing_period_id
)
VALUES
  (
    '2d727b6e-4acb-49b7-ac93-d030842fe940',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/86ac87cb-d63f-42ad-93f3-2cf654a0996b.jpg',
    'S__55361725.jpg',
    'out',
    'confirmed',
    '{"tax":300,"date":"2025/09/19","account":"4101 營業收入","inOrOut":"銷項","summary":"提供軟體開發服務。","taxType":"應稅","buyerName":"全民資產管理股份有限公司","buyerTaxId":"93556691","deductible":true,"sellerName":"昂工科技有限公司","totalSales":6000,"invoiceType":"手開三聯式","sellerTaxId":"60707504","totalAmount":6300,"invoiceSerialCode":"RT33662452"}'::jsonb,
    '__TEST_USER_ID__',
    '2026-01-07 06:52:58.115584+00',
    '11409',
    'RT33662452',
    '78d3b3d0-2ad0-4b53-9ad6-7ce51f2e0f01'
  ),
  (
    '53c5a212-0027-41a6-90ea-206521850ff3',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/a20e246d-2a24-4e09-a4b0-db6e2c8ee947.jpg',
    'S__55361727.jpg',
    'out',
    'confirmed',
    '{"tax":250,"date":"2025/09/30","account":"4101 營業收入","inOrOut":"銷項","summary":"審計軟體服務費","taxType":"應稅","buyerName":"勤信聯合會計師事務所","buyerTaxId":"82530323","deductible":true,"sellerName":"昂工科技有限公司","totalSales":5000,"invoiceType":"手開三聯式","sellerTaxId":"60707504","totalAmount":5250,"invoiceSerialCode":"RT33662454"}'::jsonb,
    '__TEST_USER_ID__',
    '2026-01-07 06:52:58.318929+00',
    '11409',
    'RT33662454',
    '78d3b3d0-2ad0-4b53-9ad6-7ce51f2e0f01'
  ),
  (
    '554c6f5a-d6e7-41be-96b2-88d46634615f',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/1c49142b-f687-4d83-835e-011f442d42f8.jpg',
    'S__55361724.jpg',
    'out',
    'confirmed',
    '{"tax":300,"date":"2025/09/10","account":"4101 營業收入","inOrOut":"銷項","summary":"提供軟體服務費用","taxType":"應稅","buyerName":"仁玖國際有限公司","buyerTaxId":"85001521","deductible":true,"sellerName":"昂工科技有限公司","totalSales":6000,"invoiceType":"手開三聯式","sellerTaxId":"60707504","totalAmount":6300,"invoiceSerialCode":"RT33662450"}'::jsonb,
    '__TEST_USER_ID__',
    '2026-01-07 06:52:57.99756+00',
    '11409',
    'RT33662450',
    '78d3b3d0-2ad0-4b53-9ad6-7ce51f2e0f01'
  ),
  (
    '61d7ad1c-aa26-4c88-9ce5-302c72074124',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810/4dbed57c-8f5a-4dcd-9d50-d1b3b6593cd1/bea03a9d-9734-42fa-9b19-147069a2c7ea.jpg',
    'EVQR_856CDE9B_A262_4B7B_A4E3_3CBC57A41DE8.1.jpg',
    'in',
    'confirmed',
    '{"tax":5,"date":"2025/09/12","account":"613212 交通費用","inOrOut":"進項","summary":"停車費","taxType":"應稅","buyerName":"昂工科技有限公司","buyerTaxId":"60707504","deductible":true,"sellerName":"正好停股份有限公司","totalSales":95,"invoiceType":"電子發票","sellerTaxId":"88232292","totalAmount":100,"invoiceSerialCode":"TJ78038974"}'::jsonb,
    '__TEST_USER_ID__',
    '2026-01-07 06:50:15.753753+00',
    '11409',
    'TJ78038974',
    '78d3b3d0-2ad0-4b53-9ad6-7ce51f2e0f01'
  ),
  (
    '70a2d9d6-8b07-461a-be49-dbea59689a5d',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/f7692cb3-7eb4-48e5-b4b6-93d8e49b6b58.jpg',
    'S__55361728.jpg',
    'out',
    'confirmed',
    '{"tax":300,"date":"2025/10/16","account":"4101 營業收入","inOrOut":"銷項","summary":"提供軟體開發服務費用","taxType":"應稅","buyerName":"金億資產管理股份有限公司","buyerTaxId":"93556691","deductible":true,"sellerName":"昂工科技有限公司","totalSales":6000,"invoiceType":"手開三聯式","sellerTaxId":"60707504","totalAmount":6300,"invoiceSerialCode":"RT33662455"}'::jsonb,
    '__TEST_USER_ID__',
    '2026-01-07 06:52:58.414554+00',
    '11409',
    'RT33662455',
    '78d3b3d0-2ad0-4b53-9ad6-7ce51f2e0f01'
  ),
  (
    '9415fd33-112e-47ef-84fe-5ccc91e57078',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/332f4625-142b-4bff-9710-a0517fdf0dde.jpg',
    'S__55361726.jpg',
    'out',
    'confirmed',
    '{"tax":6000,"date":"2025/09/22","account":"4101 營業收入","inOrOut":"銷項","summary":"出售會計軟體予勤信聯合會計師事務所。","taxType":"應稅","buyerName":"勤信聯合會計師事務所","buyerTaxId":"82530323","deductible":true,"sellerName":"昂工科技有限公司","totalSales":120000,"invoiceType":"手開三聯式","sellerTaxId":"60707504","totalAmount":126000,"invoiceSerialCode":"RT33662453"}'::jsonb,
    '__TEST_USER_ID__',
    '2026-01-07 06:52:58.219587+00',
    '11409',
    'RT33662453',
    '78d3b3d0-2ad0-4b53-9ad6-7ce51f2e0f01'
  ),
  (
    'a72c78d6-7944-49c0-a4da-0c932792eb4b',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/bc669929-1bd7-45bd-95b2-687d7831930b.jpg',
    'S__55361730 (1).jpg',
    'out',
    'confirmed',
    '{"tax":250,"date":"2025/10/03","account":"4101 營業收入","inOrOut":"銷項","summary":"銷售審計軟體","taxType":"應稅","buyerName":"勤信聯合會計師事務所","buyerTaxId":"82530323","deductible":true,"sellerName":"昂工科技有限公司","totalSales":5000,"invoiceType":"手開三聯式","sellerTaxId":"60707504","totalAmount":5250,"invoiceSerialCode":"RT33662456"}'::jsonb,
    '__TEST_USER_ID__',
    '2026-01-07 06:52:58.501451+00',
    '11409',
    'RT33662456',
    '78d3b3d0-2ad0-4b53-9ad6-7ce51f2e0f01'
  ),
  (
    'b0bc3787-86ad-4555-afc6-e913460f4e6b',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810/4dbed57c-8f5a-4dcd-9d50-d1b3b6593cd1/de424df7-118c-465c-ab98-b381a9840c05.jpg',
    '_1410_251107133041624_001_d3aafa71.jpg',
    'in',
    'confirmed',
    '{"tax":5,"date":"2025/09/03","account":"6112 文具用品","inOrOut":"進項","summary":"購買文具用品。","taxType":"應稅","buyerName":"昂工科技有限公司","buyerTaxId":"60707504","deductible":true,"sellerName":"豐堯綜合事業有限公司","totalSales":107,"invoiceType":"手開三聯式","sellerTaxId":"16160426","totalAmount":112,"invoiceSerialCode":"RT26980200"}'::jsonb,
    '__TEST_USER_ID__',
    '2026-01-07 06:50:15.655035+00',
    '11409',
    'RT26980200',
    '78d3b3d0-2ad0-4b53-9ad6-7ce51f2e0f01'
  ),
  (
    'de80fd94-243a-46cb-85b1-d4c91862e569',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810',
    '2c3c7f79-1193-406c-90d6-ae7c98de4084',
    '52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/e1d401db-55fa-4015-a448-2ba505da79fb.jpg',
    'S__55378064.jpg',
    'out',
    'confirmed',
    '{"tax":300,"date":"2025/09/19","account":"4101 營業收入","inOrOut":"銷項","summary":"開立軟體服務發票後作廢","taxType":"作廢","buyerName":"全居資產管理股份有限公司","buyerTaxId":"93556691","deductible":true,"sellerName":"昂工科技有限公司","totalSales":6000,"invoiceType":"手開三聯式","sellerTaxId":"60707504","totalAmount":6300,"invoiceSerialCode":"RT33662451"}'::jsonb,
    '__TEST_USER_ID__',
    '2026-01-07 06:52:58.592962+00',
    '11409',
    'RT33662451',
    '78d3b3d0-2ad0-4b53-9ad6-7ce51f2e0f01'
  );
