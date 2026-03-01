---
name: create-vat-reports
description: 產生台灣 (ROC) 營業稅申報檔案 (TXT 與 TET_U)。此技能會自動驗證進銷項憑證完整性，並以繁體中文 (zh-TW) 提供檢查報告與申報摘要。
---

# 營業稅申報報表產生器 (VAT Reports)

## 概覽
此技能用於自動化產生台灣營業稅電子申報檔案：
1.  **TXT 檔**：包含所有進銷項憑證與折讓單的 81 位元定長檔案。
2.  **TET_U 檔**：401/403 申報書彙總表 (112 欄位管線分隔格式)。

## 語言與語調規範
- **語言**：所有與使用者的對話、狀態回報及回覆皆必須使用**繁體中文 (zh-TW)**。
- **專業術語**：使用標準台灣稅務術語（如：統一編號、稅籍編號、扣抵代號、銷項、進項、留抵稅額）。

## 前置條件
- **客戶 ID (Client ID)**：資料庫中的唯一識別碼。
- **申報期別**：民國年與月份格式（例如 "11301" 代表 113 年 1-2 月）。
- **發票字軌範圍**：需事先定義該期別的字軌範圍以計算空白未使用發票。

## Workflow

### 1. Identify Client and Period
If the user provides a name or partial period, search for the exact `client_id` and `tax_filing_period_id`.

### 2. Verify Readiness
Before generating reports, verify the following:
- Are all invoices for the period in `confirmed` status?
- Are the invoice serial number ranges defined?
- Is the client's `tax_id` and `tax_payer_id` (稅籍編號) set in the `clients` table?

### 3. Collect TET_U Configuration
Before generating the TET_U report, you MUST ask the user to provide the necessary declaration configuration parameters.
**CRITICAL**: Ask the user to enter ONE field at a time, or present a numbered list and ask them to provide all values, to ensure no information is missed. Do NOT use default values unless the user explicitly tells you to. Note that some fields can be intentionally left blank by the user; you must support and accept blank values if the user indicates they should be empty.
The required fields are:
- `declarationType` (申報種類 - 1: 按期申報, 2: 按月申報)
- `countyCity` (縣市別 - e.g., 臺北市, 新北市)
- `declarationMethod` (申報方式 - 1: 自行申報, 2: 委託申報)
- `declarerId` (申報人身分證統一編號)
- `declarerName` (申報人姓名)
- `declarerPhoneAreaCode` (申報人電話區域碼)
- `declarerPhone` (申報人電話)
- `declarerPhoneExtension` (申報人電話分機)
- `agentRegistrationNumber` (代理申報人登錄字號 - required if declarationMethod is 2)
- `consolidatedDeclarationCode` (總繳代號 - 0: 單一機構, 1: 總機構彙總報繳, 2: 各單位分別申報)
- `fileNumber` (檔案編號 - usually "        " 8 spaces or "00000000")
- `midYearClosureTaxPayable` (調整補徵應繳)
- `midYearClosureTaxRefundable` (調整應退稅額)
- `previousPeriodCarryForwardTax` (上期留抵稅額)

### 4. Fetch Raw Data
Run the following scripts to fetch the required data into JSON files (saved to `./reports/temp/` by default):
- `tsx scripts/get_client.ts <clientId>`
- `tsx scripts/get_invoices.ts <clientId> <yyymm>`
- `tsx scripts/get_allowances.ts <clientId> <yyymm>`
- `tsx scripts/get_invoice_ranges.ts <clientId> <yyymm>`

### 5. Generate Reports (Rule Extraction & Mapping)
Read `references/txt_spec.md` and `references/tet_u_spec.md` carefully to understand the formatting and aggregation rules. These specs contain detailed algorithms, field linkages, and mutual exclusions (e.g., the I, J, K, L, M logic for TXT; the exactly 112 field summations for TET_U).
Then, write an ephemeral Node.js/TypeScript script to map the fetched JSON data into the exact formats required by the formatter scripts. **Make sure to pass the collected TET_U configuration parameters into your mapping script so they are included in the final TET_U file**.
1. **For TXT**: Based on `txt_spec.md`, map the invoices, allowances, and unused ranges into an array of objects representing the rows. You must handle the mutually exclusive fields correctly based on the format code. **Special case for Electronic Invoices**: If there are no relevant unused ranges for electronic invoices (電子發票) but there are issued electronic invoices, you must automatically generate an unused range row (with taxType "彙加") for the unused numbers up to the end of the 50-number block of the last used electronic invoice. The keys in your JSON objects must exactly match what the formatter expects: `formatCode`, `taxPayerId`, `sequenceNumber`, `yearMonth`, `buyerTaxId`, `sellerTaxId`, `invoiceSerialCode`, `salesAmount`, `taxType`, `taxAmount`, `deductionCode`, `reserved`, `specialTaxRate`, `aggregateMark`, `customsMark`. Save it as `txt_data.json`.
2. **For TET_U**: Based on `tet_u_spec.md` and the user's config, calculate the aggregations (e.g., separating triplicate vs electronic invoices, grouping by zero-tax, etc.), and map the exactly 112 fields in order into an array of objects `[{ value: ..., format: "X"|"C"|"9"|"S9", length: ... }]` and save it as `tet_u_data.json`. **CRITICAL**: You MUST extract the exact length for each of the 112 fields from the format string in `tet_u_spec.md` (e.g., `S9(012)` means length 12, `S9(010)` means length 10, `9(003)` means length 3, `X(011)` means length 11). Do not hardcode a default length! Pay special attention to the S9 format and padding lengths specified in the spec.

### 6. Format Files
Pass the intermediate JSON models to the deterministic formatter scripts:
- `tsx scripts/format_txt_from_json.ts <txt_data.json> <output_dir/TAX_ID.TXT>`
- `tsx scripts/format_tet_u_from_json.ts <tet_u_data.json> <output_dir/TAX_ID.TET_U>`

### 7. Review Summary
Display a summary of the generated data based on the aggregations you calculated:
- Total Sales (Output)
- Total Tax (Output)
- Total Purchases (Input)
- Total Tax (Input)
- Tax Payable or Carry-forward

## Resources

### References
- [txt_spec.md](references/txt_spec.md): Detailed 81-byte format specification.
- [tet_u_spec.md](references/tet_u_spec.md): Detailed 112-field summary format specification.

### Scripts
- `scripts/get_*.ts`: Scripts to fetch raw data.
- `scripts/format_txt_from_json.ts`: Applies padding and formats the final TXT string.
- `scripts/format_tet_u_from_json.ts`: Applies Big5 padding and COBOL S9 formatting for the final TET_U string.
- `scripts/verify_readiness.ts`: Checks for missing ranges or unconfirmed invoices.

## Examples

### Generate reports for a client
> "Generate the VAT reports for 'Ang Tech' for Jan-Feb 2026."

### Check readiness
> "Is 'Ang Tech' ready for the 115/01 filing?"

### Troubleshooting
> "The TXT report for 'Ang Tech' is missing some invoices. Why?"
> *Response: Check if there are any 'draft' status invoices or missing ranges.*
