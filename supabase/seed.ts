import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const users = [
  {
    "id": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "email": "ang@angineering.co",
    "user_metadata": {
      "email": "ang@angineering.co",
      "email_verified": true,
      "name": "Ang Wang",
      "phone_verified": false,
      "role": "admin",
      "sub": "d5975f92-ac17-4090-a746-1d3737ccb240"
    },
    "app_metadata": {
      "provider": "email",
      "providers": [
        "email"
      ]
    },
    "role": "authenticated"
  }
];

const firms = [
  {
    "id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "name": "勤信事務所",
    "tax_id": "12345678",
    "created_at": "2025-12-30T07:02:37.459597+00:00"
  }
];
const clients = [
  {
    "id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "name": "昂工科技有限公司",
    "contact_person": "王致昂",
    "tax_id": "60707504",
    "tax_payer_id": "351406082",
    "industry": "軟體資訊",
    "created_at": "2025-12-31T05:32:02.646319+00:00"
  }
];
const invoiceRanges = [
  {
    "id": "ce04935f-7f12-4cc8-bf61-e4e7cb23f411",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "year_month": "11409",
    "invoice_type": "手開三聯式",
    "start_number": "RT33662450",
    "end_number": "RT33662499",
    "created_at": "2026-01-07T07:06:41.273751+00:00"
  },
  {
    "id": "21ebb42d-bb7d-4dae-8d22-5fa3385b9d05",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "year_month": "11409",
    "invoice_type": "手開二聯式",
    "start_number": "RV25776650",
    "end_number": "RV25776699",
    "created_at": "2026-01-07T07:07:12.730515+00:00"
  },
  {
    "id": "1f83968c-6e38-4c81-b3ca-4990ae695062",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "year_month": "11411",
    "invoice_type": "手開三聯式",
    "start_number": "TT33764350",
    "end_number": "TT33764399",
    "created_at": "2026-01-13T07:15:18.298193+00:00"
  },
  {
    "id": "b29a3e7e-fe5b-4e69-aeb8-2936ec95ac98",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "year_month": "11411",
    "invoice_type": "手開二聯式",
    "start_number": "TV25809850",
    "end_number": "TV25809899",
    "created_at": "2026-01-13T07:26:55.664449+00:00"
  }
];
const invoices = [
  {
    "id": "de80fd94-243a-46cb-85b1-d4c91862e569",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/e1d401db-55fa-4015-a448-2ba505da79fb.jpg",
    "filename": "S__55378064.jpg",
    "in_or_out": "out",
    "status": "confirmed",
    "extracted_data": {
      "tax": 300,
      "date": "2025/09/19",
      "account": "4101 營業收入",
      "inOrOut": "銷項",
      "summary": "開立軟體服務發票後作廢",
      "taxType": "作廢",
      "buyerName": "全居資產管理股份有限公司",
      "buyerTaxId": "93556691",
      "deductible": true,
      "sellerName": "昂工科技有限公司",
      "totalSales": 6000,
      "invoiceType": "手開三聯式",
      "sellerTaxId": "60707504",
      "totalAmount": 6300,
      "invoiceSerialCode": "RT33662451"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-07T06:52:58.592962+00:00",
    "year_month": "11409",
    "invoice_serial_code": "RT33662451"
  },
  {
    "id": "70a2d9d6-8b07-461a-be49-dbea59689a5d",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/f7692cb3-7eb4-48e5-b4b6-93d8e49b6b58.jpg",
    "filename": "S__55361728.jpg",
    "in_or_out": "out",
    "status": "confirmed",
    "extracted_data": {
      "tax": 300,
      "date": "2025/10/16",
      "account": "4101 營業收入",
      "inOrOut": "銷項",
      "summary": "提供軟體開發服務費用",
      "taxType": "應稅",
      "buyerName": "金億資產管理股份有限公司",
      "buyerTaxId": "93556691",
      "deductible": true,
      "sellerName": "昂工科技有限公司",
      "totalSales": 6000,
      "invoiceType": "手開三聯式",
      "sellerTaxId": "60707504",
      "totalAmount": 6300,
      "invoiceSerialCode": "RT33662455"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-07T06:52:58.414554+00:00",
    "year_month": "11409",
    "invoice_serial_code": "RT33662455"
  },
  {
    "id": "7cebb435-53b3-4852-a2c7-e5d8752c91a9",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/11411/1768448602852_60707504_IN_20260105164340.xlsx",
    "filename": "60707504_IN_20260105164340.xlsx",
    "in_or_out": "in",
    "status": "processed",
    "extracted_data": {
      "tax": 12,
      "date": "2025/11/10",
      "source": "import-excel",
      "inOrOut": "進項",
      "summary": "品名：Portaly 頂級帳號訂閱 數量：1 單位：式 單價：249 金額：249",
      "taxType": "應稅",
      "buyerName": "昂工科技有限公司",
      "buyerTaxId": "60707504",
      "deductible": true,
      "sellerName": "真實引擎股份有限公司",
      "totalSales": 237,
      "invoiceType": "電子發票",
      "sellerTaxId": "83190913",
      "totalAmount": 249,
      "invoiceSerialCode": "VH22357699"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-13T11:27:23.729702+00:00",
    "year_month": "11411",
    "invoice_serial_code": "VH22357699"
  },
  {
    "id": "78d47916-39f0-4e26-b7a3-6b98de4627dc",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/11411/1768448602852_60707504_IN_20260105164340.xlsx",
    "filename": "60707504_IN_20260105164340.xlsx",
    "in_or_out": "in",
    "status": "processed",
    "extracted_data": {
      "tax": 12,
      "date": "2025/12/10",
      "source": "import-excel",
      "inOrOut": "進項",
      "summary": "品名：Portaly 頂級帳號訂閱 數量：1 單位：式 單價：249 金額：249",
      "taxType": "應稅",
      "buyerName": "昂工科技有限公司",
      "buyerTaxId": "60707504",
      "deductible": true,
      "sellerName": "真實引擎股份有限公司",
      "totalSales": 237,
      "invoiceType": "電子發票",
      "sellerTaxId": "83190913",
      "totalAmount": 249,
      "invoiceSerialCode": "VH22361709"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-13T11:27:23.729702+00:00",
    "year_month": "11411",
    "invoice_serial_code": "VH22361709"
  },
  {
    "id": "34ddbd05-4cfe-4c35-8424-95d80ac0f064",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/62381766-f50f-40c6-8cbb-5f0f259b8096/c927b4b4-bac5-40e0-98e4-fd364c8c44ce.jpg",
    "filename": "IMG_0706.jpg",
    "in_or_out": "out",
    "status": "confirmed",
    "extracted_data": {
      "tax": 250,
      "date": "2025/11/28",
      "account": "4101 營業收入",
      "inOrOut": "銷項",
      "summary": "銷售會計軟體服務",
      "taxType": "應稅",
      "buyerName": "總計新臺幣會計師事務所",
      "buyerTaxId": "82530323",
      "deductible": true,
      "sellerName": "昂工科技有限公司",
      "totalSales": 5000,
      "invoiceType": "手開三聯式",
      "sellerTaxId": "60707504",
      "totalAmount": 5250,
      "invoiceSerialCode": "TT33764350"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-13T07:20:29.914557+00:00",
    "year_month": "11411",
    "invoice_serial_code": "TT33764350"
  },
  {
    "id": "b0bc3787-86ad-4555-afc6-e913460f4e6b",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/4dbed57c-8f5a-4dcd-9d50-d1b3b6593cd1/de424df7-118c-465c-ab98-b381a9840c05.jpg",
    "filename": "_1410_251107133041624_001_d3aafa71.jpg",
    "in_or_out": "in",
    "status": "confirmed",
    "extracted_data": {
      "tax": 5,
      "date": "2025/09/03",
      "account": "6112 文具用品",
      "inOrOut": "進項",
      "summary": "購買文具用品。",
      "taxType": "應稅",
      "buyerName": "昂工科技有限公司",
      "buyerTaxId": "60707504",
      "deductible": true,
      "sellerName": "豐堯綜合事業有限公司",
      "totalSales": 107,
      "invoiceType": "手開三聯式",
      "sellerTaxId": "16160426",
      "totalAmount": 112,
      "invoiceSerialCode": "RT26980200"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-07T06:50:15.655035+00:00",
    "year_month": "11409",
    "invoice_serial_code": "RT26980200"
  },
  {
    "id": "2d727b6e-4acb-49b7-ac93-d030842fe940",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/86ac87cb-d63f-42ad-93f3-2cf654a0996b.jpg",
    "filename": "S__55361725.jpg",
    "in_or_out": "out",
    "status": "confirmed",
    "extracted_data": {
      "tax": 300,
      "date": "2025/09/19",
      "account": "4101 營業收入",
      "inOrOut": "銷項",
      "summary": "提供軟體開發服務。",
      "taxType": "應稅",
      "buyerName": "全民資產管理股份有限公司",
      "buyerTaxId": "93556691",
      "deductible": true,
      "sellerName": "昂工科技有限公司",
      "totalSales": 6000,
      "invoiceType": "手開三聯式",
      "sellerTaxId": "60707504",
      "totalAmount": 6300,
      "invoiceSerialCode": "RT33662452"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-07T06:52:58.115584+00:00",
    "year_month": "11409",
    "invoice_serial_code": "RT33662452"
  },
  {
    "id": "61d7ad1c-aa26-4c88-9ce5-302c72074124",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/4dbed57c-8f5a-4dcd-9d50-d1b3b6593cd1/bea03a9d-9734-42fa-9b19-147069a2c7ea.jpg",
    "filename": "EVQR_856CDE9B_A262_4B7B_A4E3_3CBC57A41DE8.1.jpg",
    "in_or_out": "in",
    "status": "confirmed",
    "extracted_data": {
      "tax": 5,
      "date": "2025/09/12",
      "account": "613212 交通費用",
      "inOrOut": "進項",
      "summary": "停車費",
      "taxType": "應稅",
      "buyerName": "昂工科技有限公司",
      "buyerTaxId": "60707504",
      "deductible": true,
      "sellerName": "正好停股份有限公司",
      "totalSales": 95,
      "invoiceType": "電子發票",
      "sellerTaxId": "88232292",
      "totalAmount": 100,
      "invoiceSerialCode": "TJ78038974"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-07T06:50:15.753753+00:00",
    "year_month": "11409",
    "invoice_serial_code": "TJ78038974"
  },
  {
    "id": "a72c78d6-7944-49c0-a4da-0c932792eb4b",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/bc669929-1bd7-45bd-95b2-687d7831930b.jpg",
    "filename": "S__55361730 (1).jpg",
    "in_or_out": "out",
    "status": "confirmed",
    "extracted_data": {
      "tax": 250,
      "date": "2025/10/03",
      "account": "4101 營業收入",
      "inOrOut": "銷項",
      "summary": "銷售審計軟體",
      "taxType": "應稅",
      "buyerName": "勤信聯合會計師事務所",
      "buyerTaxId": "82530323",
      "deductible": true,
      "sellerName": "昂工科技有限公司",
      "totalSales": 5000,
      "invoiceType": "手開三聯式",
      "sellerTaxId": "60707504",
      "totalAmount": 5250,
      "invoiceSerialCode": "RT33662456"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-07T06:52:58.501451+00:00",
    "year_month": "11409",
    "invoice_serial_code": "RT33662456"
  },
  {
    "id": "9415fd33-112e-47ef-84fe-5ccc91e57078",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/332f4625-142b-4bff-9710-a0517fdf0dde.jpg",
    "filename": "S__55361726.jpg",
    "in_or_out": "out",
    "status": "confirmed",
    "extracted_data": {
      "tax": 6000,
      "date": "2025/09/22",
      "account": "4101 營業收入",
      "inOrOut": "銷項",
      "summary": "出售會計軟體予勤信聯合會計師事務所。",
      "taxType": "應稅",
      "buyerName": "勤信聯合會計師事務所",
      "buyerTaxId": "82530323",
      "deductible": true,
      "sellerName": "昂工科技有限公司",
      "totalSales": 120000,
      "invoiceType": "手開三聯式",
      "sellerTaxId": "60707504",
      "totalAmount": 126000,
      "invoiceSerialCode": "RT33662453"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-07T06:52:58.219587+00:00",
    "year_month": "11409",
    "invoice_serial_code": "RT33662453"
  },
  {
    "id": "554c6f5a-d6e7-41be-96b2-88d46634615f",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/1c49142b-f687-4d83-835e-011f442d42f8.jpg",
    "filename": "S__55361724.jpg",
    "in_or_out": "out",
    "status": "confirmed",
    "extracted_data": {
      "tax": 300,
      "date": "2025/09/10",
      "account": "4101 營業收入",
      "inOrOut": "銷項",
      "summary": "提供軟體服務費用",
      "taxType": "應稅",
      "buyerName": "仁玖國際有限公司",
      "buyerTaxId": "85001521",
      "deductible": true,
      "sellerName": "昂工科技有限公司",
      "totalSales": 6000,
      "invoiceType": "手開三聯式",
      "sellerTaxId": "60707504",
      "totalAmount": 6300,
      "invoiceSerialCode": "RT33662450"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-07T06:52:57.99756+00:00",
    "year_month": "11409",
    "invoice_serial_code": "RT33662450"
  },
  {
    "id": "53c5a212-0027-41a6-90ea-206521850ff3",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/2f29f5ba-5aed-4a3d-8df0-83c94ad29931/a20e246d-2a24-4e09-a4b0-db6e2c8ee947.jpg",
    "filename": "S__55361727.jpg",
    "in_or_out": "out",
    "status": "confirmed",
    "extracted_data": {
      "tax": 250,
      "date": "2025/09/30",
      "account": "4101 營業收入",
      "inOrOut": "銷項",
      "summary": "審計軟體服務費",
      "taxType": "應稅",
      "buyerName": "勤信聯合會計師事務所",
      "buyerTaxId": "82530323",
      "deductible": true,
      "sellerName": "昂工科技有限公司",
      "totalSales": 5000,
      "invoiceType": "手開三聯式",
      "sellerTaxId": "60707504",
      "totalAmount": 5250,
      "invoiceSerialCode": "RT33662454"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-07T06:52:58.318929+00:00",
    "year_month": "11409",
    "invoice_serial_code": "RT33662454"
  },
  {
    "id": "076902a4-c285-4c45-8e71-4ef7aa99d95c",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/62381766-f50f-40c6-8cbb-5f0f259b8096/02ef4778-4cec-4df9-b38c-a2e40bc5319f.jpg",
    "filename": "IMG_0707.jpg",
    "in_or_out": "out",
    "status": "confirmed",
    "extracted_data": {
      "tax": 250,
      "date": "2025/12/26",
      "account": "4101 營業收入",
      "inOrOut": "銷項",
      "summary": "會計軟體服務費",
      "taxType": "應稅",
      "buyerName": "勤信聯合會計師事務所",
      "buyerTaxId": "82530323",
      "deductible": true,
      "sellerName": "昂工科技有限公司",
      "totalSales": 5000,
      "invoiceType": "手開三聯式",
      "sellerTaxId": "60707504",
      "totalAmount": 5250,
      "invoiceSerialCode": "TT33764351"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-13T07:20:30.048813+00:00",
    "year_month": "11411",
    "invoice_serial_code": "TT33764351"
  },
  {
    "id": "efa4fa73-36a0-420e-babd-bb3beac5d885",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "client_id": "2c3c7f79-1193-406c-90d6-ae7c98de4084",
    "storage_path": "52fbe251-4fea-40cb-a0cb-640e4e25e810/11411/1768448602852_60707504_IN_20260105164340.xlsx",
    "filename": "60707504_IN_20260105164340.xlsx",
    "in_or_out": "in",
    "status": "processed",
    "extracted_data": {
      "tax": 7,
      "date": "2025/11/28",
      "source": "import-excel",
      "inOrOut": "進項",
      "summary": "品名：Parking fee 數量：1 單位： 單價：150 金額：150",
      "taxType": "應稅",
      "buyerName": "Buyer",
      "buyerTaxId": "60707504",
      "deductible": true,
      "sellerName": "正好停股份有限公司臺北車站西側地上停車場",
      "totalSales": 143,
      "invoiceType": "電子發票",
      "sellerTaxId": "88232292",
      "totalAmount": 150,
      "invoiceSerialCode": "VJ67486137"
    },
    "uploaded_by": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "created_at": "2026-01-13T11:27:23.729702+00:00",
    "year_month": "11411",
    "invoice_serial_code": "VJ67486137"
  }
];
const profiles = [
  {
    "id": "d5975f92-ac17-4090-a746-1d3737ccb240",
    "firm_id": "52fbe251-4fea-40cb-a0cb-640e4e25e810",
    "name": "Ang Wang",
    "role": "admin",
    "created_at": "2025-12-30T07:00:51.678324+00:00"
  }
];

async function listExistingUsers() {
  const existing = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    existing.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  return existing;
}

export async function runSeed() {
  const existingUsers = await listExistingUsers();
  const existingByEmail = new Map(
    existingUsers.map((user) => [user.email, user.id])
  );

  const oldIdToNewId = new Map();
  const seedPassword = process.env.SEED_USER_PASSWORD ?? "TestPassword123!";

  for (const user of users) {
    if (!user.email) {
      continue;
    }

    const existingId = existingByEmail.get(user.email);
    if (existingId) {
      oldIdToNewId.set(user.id, existingId);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: seedPassword,
      email_confirm: true,
      user_metadata: user.user_metadata ?? {},
      app_metadata: user.app_metadata ?? {},
      role: user.role ?? "authenticated",
    });

    if (error || !data.user) {
      throw error ?? new Error("Failed to create seed user");
    }

    oldIdToNewId.set(user.id, data.user.id);
  }

  if (firms.length > 0) {
    const { error } = await supabase.from("firms").upsert(firms);
    if (error) throw error;
  }

  if (clients.length > 0) {
    const { error } = await supabase.from("clients").upsert(clients);
    if (error) throw error;
  }

  if (invoiceRanges.length > 0) {
    const { error } = await supabase.from("invoice_ranges").upsert(invoiceRanges);
    if (error) throw error;
  }

  if (profiles.length > 0) {
    for (const profile of profiles) {
      const mappedUserId = oldIdToNewId.get(profile.id);
      if (!mappedUserId) {
        continue;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          firm_id: profile.firm_id,
          name: profile.name,
          role: profile.role,
        })
        .eq("id", mappedUserId);

      if (error) throw error;
    }
  }

  if (invoices.length > 0) {
    const mappedInvoices = invoices.map((invoice) => ({
      ...invoice,
      uploaded_by: oldIdToNewId.get(invoice.uploaded_by) ?? invoice.uploaded_by,
    }));

    const { error } = await supabase.from("invoices").upsert(mappedInvoices);
    if (error) throw error;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runSeed().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
}
