---
name: extract-invoices
description: Extract data from Taiwan Unified Invoice (統一發票) images using Claude's vision — no API keys or network needed. Use this skill whenever the user wants to extract, read, process, or review invoice images locally. Trigger on phrases like "extract invoices", "讀發票", "辨識發票", "幫我處理發票", "read these invoices", or when the user points to a directory/folder of invoice files, receipt images, or scanned documents. Also trigger if the user asks to identify invoice details, pull data from invoice photos, or batch-process a folder of financial documents.
---

# Invoice Data Extraction

Extract structured data from Taiwan Unified Invoice (統一發票) images/PDFs using Claude's vision capabilities, then validate and output the results.

## 1. Client Info Setup

Before extracting, you need the client's business information. Check for a `client-info.md` file in the current working directory.

**If `client-info.md` exists**, read it and parse the fields.

**If it does not exist**, ask the user for:
- **name**: Company name (公司名稱)
- **taxId**: Unified Business Number (統一編號), must be 8 digits
- **industry**: Industry type (行業別), e.g. 餐飲業, 科技業, 零售業

Validate the tax ID using the UBN checksum algorithm (see Section 5), then write `client-info.md`:

```markdown
# Client Info
- name: 範例有限公司
- taxId: 12345678
- industry: 餐飲業
```

## 2. Image Discovery

1. Accept a directory path from the user. Default to the current working directory if none specified.
2. Use Glob to scan for invoice files: `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.pdf`
3. List the discovered files and confirm with the user before proceeding.
4. Optionally accept a **target period** in YYYMM format (ROC year + month, e.g. `11401` = January 2025) for period validation.

## 3. Extraction (Parallel Sub-agents)

Process invoices in parallel using the **Agent tool**. Launch up to 5 sub-agents at a time, each handling one invoice file. Wait for all agents in a round to complete before launching the next round.

### Sub-agent Prompt

Before launching agents, read `scripts/accounts.ts` and `scripts/tax-id.ts` once. Then for each invoice, launch a sub-agent whose prompt contains everything it needs to work independently (it won't have access to this SKILL.md). Include:

1. The **file path** to the invoice image
2. The **client info** (name, taxId, industry)
3. The **full account list** (the ACCOUNTS object content from `scripts/accounts.ts`)
4. The **UBN validation algorithm** (the isValidUBN function from `scripts/tax-id.ts`)
5. The **extraction instructions**: all field definitions, invoice type rules, account assignment logic, and confidence scoring rules from Sections 3-5 below
6. The **target period** (if provided)
7. Instruction to return a **single JSON object** with keys: `filename`, `data` (all extracted fields), `validationIssues` (array of strings), `lowConfidenceFields` (array of field names)

Each sub-agent should:
1. Read the image using the Read tool
2. Extract all fields listed below
3. Run all validation rules (Section 5)
4. Return the JSON object described above

### Auto-detect 進項/銷項

Compare the client's tax ID against the buyer and seller tax IDs on the invoice:
- If client taxId matches **buyerTaxId** → this is a **進項** (input/purchase) invoice
- If client taxId matches **sellerTaxId** → this is a **銷項** (output/sales) invoice
- If neither matches, set inOrOut to `null` (will be resolved during review)

### Fields to Extract

| Field | Type | Description |
|---|---|---|
| invoiceSerialCode | string | 發票字軌號碼: 2 uppercase letters + 8 digits (e.g. AB12345678) |
| date | string | YYYY/MM/DD format. Convert ROC years: add 1911 (e.g. 113/09/15 → 2024/09/15) |
| sellerName | string | 賣方名稱 (for reference only, do not prompt user to review) |
| sellerTaxId | string | 賣方統一編號 (8 digits) — important for tax filing |
| buyerName | string | 買方名稱 (for reference only, do not prompt user to review) |
| buyerTaxId | string | 買方統一編號 (8 digits) — important for tax filing |
| totalSales | number | 銷售額 (remove currency symbols/commas) |
| tax | number | 營業稅額 |
| totalAmount | number | 總計金額 |
| deductible | boolean | 是否可扣抵: true only if domestic Taiwan invoice with tax |
| account | string | 會計科目 (see Section 4) |
| summary | string | 摘要: concise description, under 30 words, Traditional Chinese |
| taxType | string | 課稅別: one of 應稅, 零稅率, 免稅, 作廢 |
| invoiceType | string | 發票類型: one of 手開二聯式, 手開三聯式, 電子發票, 二聯式收銀機, 三聯式收銀機 |
| inOrOut | string | 進銷項: 進項 or 銷項 (auto-detected) |
| confidence | object | Map of field name → low/medium/high |

### Invoice Type-Specific Rules

- **手開二聯式 / 二聯式收銀機**: These invoices show a single total with tax already included — there's no separate tax line on the form. Set `totalSales` = `totalAmount` (the displayed value), `tax` = 0. The tax portion is calculated later during report generation.
- **手開三聯式 / 三聯式收銀機 / 電子發票**: These invoices have separate fields for sales, tax, and total. Extract `totalSales`, `tax`, and `totalAmount` as separate values. Verify: totalSales + tax = totalAmount.

### Account Assignment

- If **銷項**: set account to `4101 營業收入`
- If **進項**: select the most appropriate account from the Account List (Section 4) based on the invoice summary and the client's industry. Return the full "CODE NAME" string (e.g. `6113 旅費`).

### Confidence Scoring

For each extracted field, assign a confidence level:
- **high**: Clearly visible and unambiguous
- **medium**: Somewhat clear but might have minor issues (slight blur, unusual font)
- **low**: Unclear, handwritten and hard to read, or inferred

Do **not** flag `sellerName` or `buyerName` as low-confidence issues — these are for reference only and not used in tax filing. Only flag tax IDs, amounts, dates, and serial codes.

## 4. Account List

Read `scripts/accounts.ts` (relative to this skill folder) for the full chart of accounts. The file exports an `ACCOUNTS` object where each key is a code and the value has `name` and `deductible` fields.

- **Account format**: Return as `"CODE NAME"` string (e.g. `"6113 旅費"`)
- **Deductible check**: If the selected account has `deductible: false`, set the invoice's `deductible` field to `false`

## 5. Validation Rules

After extracting data from each invoice, run these checks and record any failures in `validationIssues`.

### 5.1 Invoice Serial Code
Must match pattern: 2 uppercase English letters + 8 digits (`/^[A-Z]{2}\d{8}$/`).

### 5.2 Date Format
Must be YYYY/MM/DD. Flag any unconverted ROC dates.

### 5.3 UBN Checksum (統一編號驗證)

Validate both sellerTaxId and buyerTaxId using the `isValidUBN()` function in `scripts/tax-id.ts` (relative to this skill folder). Read that file for the full implementation. If invalid, flag as "統一編號檢核碼不符".

### 5.4 Tax Amount Check

For **應稅** invoices:
- If 二聯式 (手開二聯式 or 二聯式收銀機): tax must be 0. Flag if not: "二聯式發票稅額應為 0（稅額內含於銷售額）"
- Otherwise: tax should equal `round(totalSales × 0.05)`. Flag if mismatch: "稅額與銷售額 5% 不符"

### 5.5 Non-Deductible Account Check

If the selected account is in the non-deductible list (Section 4), ensure `deductible` is set to `false`. Flag if inconsistent.

### 5.6 Period Mismatch (if target period provided)

Convert the invoice date to ROC period (YYYMM):
- **銷項**: invoice period must exactly match target period
- **進項**: invoice period must be on or before target period (deferred reporting is allowed)

Flag as "日期與期別不符" if mismatched.

## 6. Output

### 6.1 Summary Table

After processing all invoices, display a markdown table:

```
| # | 檔名 | 字軌號碼 | 日期 | 進銷項 | 賣方統編 | 買方統編 | 金額 | 稅額 | 科目 | 可抵扣 | 問題 |
```

In the "問題" column, list any validation issues or fields with `low` confidence.

### 6.2 JSON File

Write results to `extracted-invoices.json` in the working directory:

```json
{
  "clientInfo": {
    "name": "範例有限公司",
    "taxId": "12345678",
    "industry": "餐飲業"
  },
  "extractedAt": "2026-03-23T10:30:00Z",
  "targetPeriod": "11501",
  "invoices": [
    {
      "filename": "invoice-001.jpg",
      "data": {
        "invoiceSerialCode": "AB12345678",
        "date": "2025/01/15",
        "sellerName": "台灣商店",
        "sellerTaxId": "87654321",
        "buyerName": "範例有限公司",
        "buyerTaxId": "12345678",
        "totalSales": 10000,
        "tax": 500,
        "totalAmount": 10500,
        "deductible": true,
        "account": "6113 旅費",
        "summary": "國內出差住宿費",
        "taxType": "應稅",
        "invoiceType": "電子發票",
        "inOrOut": "進項",
        "confidence": {
          "invoiceSerialCode": "high",
          "date": "high",
          "sellerName": "medium",
          "totalSales": "high"
        }
      },
      "validationIssues": [],
      "lowConfidenceFields": ["sellerTaxId"]
    }
  ]
}
```

If `extracted-invoices.json` already exists, load it and merge by filename (update existing entries, add new ones) to support idempotent re-runs.

## 7. Interactive Review

After presenting the summary table:

1. Count invoices with validation issues or low-confidence fields.
2. If any exist, ask: "有 N 張發票有問題或低信心欄位，要逐一檢視嗎？"
3. For each flagged invoice:
   - Read and display the image again
   - Show the extracted data alongside it
   - Highlight the specific issues
   - Let the user correct any fields
4. After all corrections, re-run validation and update `extracted-invoices.json`.

## 8. Writing Style

- All user-facing output in Traditional Chinese (zh-Hant)
- Do not use emojis
- Do not use `——` (double em-dash) — it reads as AI-generated in Chinese content. Use standard punctuation: `，`、`。`、`：`、`；` or sentence breaks
- Keep tone direct and professional
