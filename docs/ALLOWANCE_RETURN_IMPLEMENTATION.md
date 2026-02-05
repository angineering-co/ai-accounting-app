# Allowance & Return Implementation Design

This document outlines the technical design for supporting **折讓證明單 (Allowance Certificates)** and **退回 (Returns)** in the tax filing system.

## Background

Per `ALLOWANCE_RETURN.md`, allowances and returns are critical components of business tax filing:
- **Sales Returns/Allowances (銷項)**: Format codes 33, 34
- **Purchase Returns/Allowances (進項)**: Format codes 23, 24

These records are tracked separately in `.TXT` files and aggregated into dedicated "減項" fields in `.TET_U` reports.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Table Structure** | Separate `allowances` table | Multiple allowances per invoice; cleaner semantics |
| **Schema Pattern** | Mirror `invoices` table | Reuse existing flows; familiar patterns |
| **Format Code** | Derived from `in_or_out` + `allowanceType` | No redundant storage |
| **Amounts/Dates** | Store in `extracted_data` JSONB | Keep table simple; same as invoices |
| **Original Invoice Link** | `original_invoice_serial_code` + optional FK | Lookup by serial; link when invoice exists |
| **in_or_out Derivation** | Compare client tax_id with seller/buyer | No need for AI to explicitly extract |
| **Status Validation** | App level (Zod schema) | Flexibility; same pattern as invoices |
| **Customs Refund (格式29)** | Deferred | Not needed for 401 forms |
| **Special Tax Rate (格式38)** | Deferred | Only supporting 401 forms |

---

## Data Model

### New Table: `allowances`

The `allowances` table mirrors the `invoices` table structure, with additional fields for linking to the original invoice.

```sql
CREATE TABLE allowances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    tax_filing_period_id UUID REFERENCES tax_filing_periods(id),
    
    -- Document identification
    allowance_serial_code TEXT,              -- Electronic allowances have their own code; paper = NULL
    original_invoice_serial_code TEXT,       -- Populated after extraction; used for lookup
    original_invoice_id UUID REFERENCES invoices(id),  -- Linked when original invoice exists
    
    -- Classification (derived from client tax_id vs seller/buyer in extracted_data)
    in_or_out TEXT NOT NULL,
    
    -- For uploaded documents (paper allowances)
    storage_path TEXT,
    filename TEXT,
    
    -- Status & metadata (same as invoices; validation at app level)
    status TEXT DEFAULT 'uploaded',
    extracted_data JSONB,  -- Contains: allowanceType, amount, taxAmount, date, etc.
    
    uploaded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE allowances ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage allowances in their firm
CREATE POLICY "Users can manage allowances in their firm" ON allowances
    FOR ALL
    USING (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );

-- Indexes based on known query patterns

-- 1. Report generation: query by client + period
--    Covers the most common read pattern for generating TXT/TET_U
CREATE INDEX idx_allowances_client_period 
ON allowances(client_id, tax_filing_period_id);

-- 2. Invoice detail view: show all allowances linked to an invoice
--    Needed for displaying allowance history on invoice page
--    Note: FK does not auto-create index in PostgreSQL
CREATE INDEX idx_allowances_original_invoice_id 
ON allowances(original_invoice_id) 
WHERE original_invoice_id IS NOT NULL;

-- 3. Electronic allowances: unique by their own serial code
--    Prevents duplicate imports of same electronic allowance
CREATE UNIQUE INDEX idx_allowances_client_serial_unique
ON allowances (client_id, allowance_serial_code)
WHERE allowance_serial_code IS NOT NULL;
```

### Why No FK on `original_invoice_serial_code`?

We considered adding a foreign key from `original_invoice_serial_code` to `invoices.invoice_serial_code`:

| Pros | Cons |
|------|------|
| Referential integrity | Original invoice may not exist in system yet |
| Database enforces valid references | 進項 invoices may never be entered (we only have the allowance) |
| Cascade updates if serial changes | Inserts would fail until invoice is added |
| | Serial codes aren't unique without client_id (composite FK is complex) |

**Decision**: Don't use FK for `original_invoice_serial_code`. Instead:
- Store the serial code as TEXT for lookup
- Use `original_invoice_id` (UUID FK) to link when the invoice exists
- Show UI warning when original invoice can't be found

### ExtractedAllowanceData Schema

Add to `lib/domain/models.ts`:

```typescript
// Schema for extracted allowance data (stored in JSONB column)
export const extractedAllowanceDataSchema = z.object({
  // Allowance classification
  allowanceType: z.enum(['三聯式折讓', '電子發票折讓', '二聯式折讓']).optional(),
  
  // Original invoice reference (also stored in column for indexing)
  originalInvoiceSerialCode: z.string().optional(),
  
  // Amounts (totals for the entire allowance)
  amount: z.number().optional(),      // 折讓金額 (銷售額)
  taxAmount: z.number().optional(),   // 折讓稅額
  
  // Date
  date: z.string().optional(),  // YYYY/MM/DD format
  
  // Party information (used to derive in_or_out)
  sellerName: z.string().optional(),
  sellerTaxId: z.string().optional(),
  buyerName: z.string().optional(),
  buyerTaxId: z.string().optional(),
  
 // Combined line items as text (for display, similar to invoice summary)
 // Groups multiple rows with same 折讓單號碼 into a single text field
 summary: z.string().optional(),

 // Line items (kept granular for report export)
 items: z.array(z.object({
  amount: z.number().optional(),    // 折讓金額 (銷售額)
  taxAmount: z.number().optional(), // 折讓稅額
  description: z.string().optional(),
 })).optional(),
  
  // For 進項 allowances: deduction type
  deductionCode: z.enum(['1', '2']).optional(),  // 1=進貨費用, 2=固定資產
  
  // Metadata
  source: z.enum(['scan', 'import-excel']).optional(),
  confidence: z.record(z.string(), z.enum(['low', 'medium', 'high'])).optional(),
}).passthrough();

export type ExtractedAllowanceData = z.infer<typeof extractedAllowanceDataSchema>;
```

**Design note:** we keep `items` in the serialized JSON so the TXT report can emit
one row per line item. `summary` is optional and only used for display; older
records without `items` should fall back to the existing grouped behavior.

### Deriving `in_or_out` from Party Info

Instead of asking AI to explicitly extract 進項/銷項, we derive it:

```typescript
function deriveInOrOut(clientTaxId: string, extractedData: ExtractedAllowanceData): 'in' | 'out' {
  // If client is the seller, this is a sales allowance (銷項)
  if (extractedData.sellerTaxId === clientTaxId) {
    return 'out';
  }
  // If client is the buyer, this is a purchase allowance (進項)
  if (extractedData.buyerTaxId === clientTaxId) {
    return 'in';
  }
  // Fallback: require manual selection
  throw new Error('Cannot determine in_or_out: client tax ID does not match buyer or seller');
}
```

### Allowance Type by Source

| Source | Has Own Serial Code? | `allowance_serial_code` | `original_invoice_serial_code` |
|--------|---------------------|-------------------------|-------------------------------|
| Excel import | Yes | Allowance's own code | From import data |
| Paper scan (electronic allowance) | Yes | Extracted by AI | Extracted by AI |
| Paper scan (paper allowance) | No | NULL | Extracted by AI |

### Key Differences from `invoices` Table

| Field | `invoices` | `allowances` |
|-------|-----------|--------------|
| Serial code | `invoice_serial_code` | `allowance_serial_code` (can be NULL for paper) |
| Original reference | N/A | `original_invoice_serial_code` + `original_invoice_id` |
| Multiple per invoice | N/A | Yes (no constraint on original_invoice_serial_code) |

---

## Format Code Mapping

### Design: Derived Format Code

The format code is derived at report generation time from `in_or_out` and `allowanceType`. No need to store it.

| allowanceType | 銷項 formatCode | 進項 formatCode |
|---------------|-----------------|-----------------|
| 三聯式折讓 | 33 | 23 |
| 電子發票折讓 | 33 | 23 |
| 二聯式折讓 | 34 | 24 |

### Implementation

```typescript
// lib/domain/format-codes.ts

export function getAllowanceFormatCode(
  inOrOut: 'in' | 'out',
  allowanceType: string
): string {
  const isTriplicateFamily = 
    allowanceType === '三聯式折讓' || 
    allowanceType === '電子發票折讓';
  
  if (inOrOut === 'out') {
    return isTriplicateFamily ? '33' : '34';
  } else {
    return isTriplicateFamily ? '23' : '24';
  }
}

export function isAllowanceFormatCode(formatCode: string): boolean {
  return ['23', '24', '33', '34'].includes(formatCode);
}

// Reverse mapping for Excel imports
export const ALLOWANCE_FORMAT_CODE_MAP: Record<string, {
  inOrOut: 'in' | 'out';
  allowanceType: string;
}> = {
  '23': { inOrOut: 'in', allowanceType: '電子發票折讓' },
  '24': { inOrOut: 'in', allowanceType: '二聯式折讓' },
  '33': { inOrOut: 'out', allowanceType: '電子發票折讓' },
  '34': { inOrOut: 'out', allowanceType: '二聯式折讓' },
};
```

---

## Implementation Steps

### Phase 1: Data Model (Database Migration)

**Step 1.1: Create `allowances` table**

Create migration file with the schema above.

**Verification:**
- [ ] Run migration locally
- [ ] Verify table exists: `SELECT * FROM allowances LIMIT 1;`
- [ ] Verify RLS policy works

**Step 1.2: Update `supabase/database.types.ts`**

Run `npx supabase gen types typescript` to regenerate types.

**Verification:**
- [ ] `allowances.Row` type exists
- [ ] `allowances.Insert` type exists

---

### Phase 2: Domain Model Updates

**Step 2.1: Add allowance schemas to `lib/domain/models.ts`**

```typescript
// Add extractedAllowanceDataSchema (as shown above)

export const allowanceSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  tax_filing_period_id: z.string().uuid().nullable().optional(),
  allowance_serial_code: z.string().nullable().optional(),
  original_invoice_serial_code: z.string().nullable().optional(),
  original_invoice_id: z.string().uuid().nullable().optional(),
  in_or_out: z.enum(['in', 'out']),
  storage_path: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  status: z.enum(['uploaded', 'processing', 'processed', 'confirmed', 'failed']),
  extracted_data: extractedAllowanceDataSchema.nullable().optional(),
  uploaded_by: z.string().uuid().nullable().optional(),
  created_at: z.coerce.date(),
});

export type Allowance = z.infer<typeof allowanceSchema>;
```

**Step 2.2: Create format code utilities**

Create `lib/domain/format-codes.ts` with the functions above.

**Verification:**
- [ ] `getAllowanceFormatCode('out', '三聯式折讓')` returns `'33'`
- [ ] `getAllowanceFormatCode('in', '二聯式折讓')` returns `'24'`
- [ ] `isAllowanceFormatCode('33')` returns `true`

---

### Phase 3: Excel Import Flow Updates

#### Design Decision: Auto-Detection by File Header

Invoice Excel files and allowance Excel files have **different headers**. Rather than requiring users to select file type, we detect automatically:

| File Type | Detection Header | Sheet Structure |
|-----------|-----------------|-----------------|
| Invoice | `發票號碼` + `格式代號` (no `折讓單號碼`) | Two sheets: header + detail |
| Allowance | `折讓單號碼` + `折讓單日期` | Single sheet (flat structure) |

**Allowance Excel Headers:**
```
折讓單號碼, 格式代號, 折讓單狀態, 折讓單類別, 發票號碼, 發票日期, 
買方統一編號, 買方名稱, 賣方統一編號, 賣方名稱, 寄送日期, 品項名稱, 
品項折讓金額(不含稅), 品項折讓稅額, 折讓金額(不含稅), 折讓稅額, 
註記欄(不轉入進銷項媒體申報檔), 折讓單日期, 最後異動時間, 
MIG訊息類別, 傳送方統編, 傳送方名稱
```

**Important:** The same `折讓單號碼` can appear in multiple rows for different `品項名稱` (line items). We group by `折讓單號碼` and combine line items into a summary field, similar to how invoice details are stored.

**Step 3.1: File type detection**

```typescript
type ElectronicFileType = 'invoice' | 'allowance';

function detectFileType(workbook: XLSX.WorkBook): ElectronicFileType {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    const firstRowValues: string[] = [];
    
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
      if (cell && cell.v) firstRowValues.push(String(cell.v));
    }
    
    // Allowance files have 折讓單號碼 header
    if (firstRowValues.some(v => v.includes('折讓單號碼'))) {
      return 'allowance';
    }
  }
  
  // Default to invoice (existing behavior)
  return 'invoice';
}
```

**Step 3.2: Update `processElectronicInvoiceFile`**

Dispatch to correct parser based on detected file type:

```typescript
export async function processElectronicInvoiceFile(
  clientId: string,
  firmId: string,
  storagePath: string,
  filename: string,
  filingYearMonth: string,
  options?: ProcessElectronicInvoiceTestOptions
): Promise<ImportResult> {
  // ... existing setup code ...
  
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const fileType = detectFileType(workbook);
  
  if (fileType === 'allowance') {
    return processAllowanceExcelFile(
      workbook, clientId, firmId, storagePath, filename, userId, filingPeriod
    );
  } else {
    // Existing invoice parsing logic
    return processInvoiceExcelFile(
      workbook, clientId, firmId, storagePath, filename, userId, result, filingPeriod
    );
  }
}
```

**Step 3.3: Allowance Excel parsing (group by 折讓單號碼)**

```typescript
async function processAllowanceExcelFile(
  workbook: XLSX.WorkBook,
  clientId: string,
  firmId: string,
  storagePath: string,
  filename: string,
  userId: string,
  filingPeriod: TaxFilingPeriod
): Promise<ImportResult> {
  const result: ImportResult = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  
  // Allowance files have a single sheet
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(workbook.Sheets[sheetName]);
  
  // Group rows by 折讓單號碼
  const groupedRows = new Map<string, ExcelRow[]>();
  for (const row of rows) {
    const serialCode = getString(row, '折讓單號碼');
    if (!serialCode) continue;
    
    if (!groupedRows.has(serialCode)) {
      groupedRows.set(serialCode, []);
    }
    groupedRows.get(serialCode)!.push(row);
  }
  
  result.total = groupedRows.size;
  const allowancesToInsert: TablesInsert<'allowances'>[] = [];
  
  for (const [serialCode, itemRows] of groupedRows) {
    try {
      const allowance = parseAllowanceFromRows(
        serialCode, itemRows, clientId, firmId, filingPeriod.id, userId
      );
      allowancesToInsert.push(allowance);
    } catch (e) {
      result.failed++;
      result.errors.push(`折讓單 ${serialCode}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }
  
  // Batch insert
  if (allowancesToInsert.length > 0) {
    const { data, error } = await supabase.from('allowances').upsert(allowancesToInsert, {
      onConflict: 'client_id, allowance_serial_code',
    }).select('id');
    
    if (error) {
      result.failed += allowancesToInsert.length;
      result.errors.push(error.message);
    } else {
      result.inserted = data?.length || 0;
      
      // Attempt to link to original invoices
      const allowanceIds = data?.map(a => a.id) || [];
      await linkAllowancesToInvoices(clientId, allowanceIds);
    }
  }
  
  return result;
}

function parseAllowanceFromRows(
  serialCode: string,
  itemRows: ExcelRow[],
  clientId: string,
  firmId: string,
  periodId: string,
  userId: string
): TablesInsert<'allowances'> {
  // Take common fields from first row
  const firstRow = itemRows[0];
  const formatCode = getString(firstRow, '格式代號');
  const { inOrOut, allowanceType } = ALLOWANCE_FORMAT_CODE_MAP[formatCode];
  
  const originalSerialCode = getString(firstRow, '發票號碼');
  const dateVal = getRowValue(firstRow, '折讓單日期');
  const dateStr = formatDate(dateVal);
  
  // Combine line items into summary text (similar to invoice details)
  const summary = itemRows
    .map(row => {
      const desc = getString(row, '品項名稱');
      const amt = getNumber(row, '品項折讓金額(不含稅)');
      return `品名：${desc}, 金額：${amt}`;
    })
    .join('\n');
  
  return {
    firm_id: firmId,
    client_id: clientId,
    tax_filing_period_id: periodId,
    allowance_serial_code: serialCode,
    original_invoice_serial_code: originalSerialCode,
    in_or_out: inOrOut,
    status: 'uploaded',
    uploaded_by: userId,
    extracted_data: {
      allowanceType,
      amount: getNumber(firstRow, '折讓金額(不含稅)'),    // Total (same across rows)
      taxAmount: getNumber(firstRow, '折讓稅額'),         // Total (same across rows)
      date: dateStr,
      sellerTaxId: getString(firstRow, '賣方統一編號'),
      sellerName: getString(firstRow, '賣方名稱'),
      buyerTaxId: getString(firstRow, '買方統一編號'),
      buyerName: getString(firstRow, '買方名稱'),
      summary,                                            // Combined line items as text
      source: 'import-excel',
    },
  };
}
```

**Step 3.5: Link original invoice**

Attempt to link allowances to existing invoices. This should happen:
1. After inserting new allowances
2. When `original_invoice_serial_code` is updated manually

```typescript
/**
 * Attempts to link an allowance to its original invoice.
 * Call this after insert or when original_invoice_serial_code is updated.
 * 
 * @returns { linked: boolean, invoiceId?: string }
 */
async function tryLinkOriginalInvoice(
  clientId: string, 
  allowanceId: string,
  originalSerialCode: string
): Promise<{ linked: boolean; invoiceId?: string }> {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('client_id', clientId)
    .eq('invoice_serial_code', originalSerialCode)
    .maybeSingle();
  
  if (invoice) {
    await supabase
      .from('allowances')
      .update({ original_invoice_id: invoice.id })
      .eq('id', allowanceId);
    
    return { linked: true, invoiceId: invoice.id };
  }
  
  return { linked: false };
}

/**
 * Batch link multiple allowances after import.
 */
async function linkAllowancesToInvoices(clientId: string, allowanceIds: string[]) {
  const { data: allowances } = await supabase
    .from('allowances')
    .select('id, original_invoice_serial_code')
    .in('id', allowanceIds)
    .is('original_invoice_id', null)
    .not('original_invoice_serial_code', 'is', null);
  
  const results = [];
  for (const allowance of allowances || []) {
    const result = await tryLinkOriginalInvoice(
      clientId, 
      allowance.id, 
      allowance.original_invoice_serial_code!
    );
    results.push({ allowanceId: allowance.id, ...result });
  }
  
  return results;
}
```

**Step 3.6: Show alert for unlinked allowances**

In the UI, when displaying an allowance that has `original_invoice_serial_code` but no `original_invoice_id`:

```typescript
// In allowance detail/list component
if (allowance.original_invoice_serial_code && !allowance.original_invoice_id) {
  // Show warning alert
  toast.warning(`找不到原始發票 ${allowance.original_invoice_serial_code}`);
}
```

**Verification:**
- [ ] Auto-detection correctly identifies invoice vs allowance Excel files
- [ ] Invoice Excel (with header+detail sheets) routes to existing invoice parser
- [ ] Allowance Excel (with single sheet, `折讓單號碼` header) routes to allowance parser
- [ ] Rows with same `折讓單號碼` are grouped into single allowance record
- [ ] Line items are combined into `summary` field
- [ ] Allowance records inserted into `allowances` table (not `invoices`)
- [ ] Invoice records still go to `invoices` table
- [ ] Verify `extracted_data.allowanceType` correctly derived from format code
- [ ] Linking works when original invoice exists
- [ ] Warning shown when original invoice not found
- [ ] Manual update of serial code triggers re-link attempt

---

### Phase 4: AI Extraction Updates (Paper Allowances)

**Step 4.1: UI-selected document type (no AI auto-detection)**

When uploading a paper document image, the user must select the document type.

- Add **進項折讓** and **銷項折讓** to the upload dialog dropdown
- Use the selected type to choose the correct Gemini prompt
- Do not ask Gemini to detect invoice vs allowance

For 折讓證明單 extraction, continue to extract these fields:
- **originalInvoiceSerialCode**: The original invoice number being referenced
- **allowanceType**: One of "三聯式折讓", "電子發票折讓", or "二聯式折讓"
- **amount**: The allowance amount (折讓金額)
- **taxAmount**: The tax amount (折讓稅額)
- **date**: The allowance date
- **sellerName**, **sellerTaxId**, **buyerName**, **buyerTaxId**: Party info

**Step 4.2: Route based on user-selected type after extraction**

```typescript
async function processUploadedDocument(
  file: UploadedFile, 
  clientId: string,
  clientTaxId: string
) {
  const extractedData = await extractWithGemini(file, selectedDocumentType);
  
  if (selectedDocumentType === '進項折讓' || selectedDocumentType === '銷項折讓') {
    // Derive in_or_out from party info
    const inOrOut = deriveInOrOut(clientTaxId, extractedData);
    
    // Insert into allowances table
    const { data: allowance } = await supabase.from('allowances').insert({
      client_id: clientId,
      original_invoice_serial_code: extractedData.originalInvoiceSerialCode,
      in_or_out: inOrOut,
      storage_path: file.storagePath,
      filename: file.filename,
      extracted_data: extractedData,
      status: 'processed',
    }).select().single();
    
    // Attempt to link original invoice
    if (allowance && extractedData.originalInvoiceSerialCode) {
      const linkResult = await tryLinkOriginalInvoice(
        clientId, 
        allowance.id, 
        extractedData.originalInvoiceSerialCode
      );
      
      if (!linkResult.linked) {
        // Return warning for UI to display
        return { 
          allowance, 
          warning: `找不到原始發票 ${extractedData.originalInvoiceSerialCode}` 
        };
      }
    }
    
    return { allowance };
  } else {
    // Insert into invoices table (existing flow)
    return await supabase.from('invoices').insert({
      // ... existing logic
    });
  }
}
```

**Verification:**
- [ ] Upload photo of 折讓證明單
- [ ] Verify record inserted into `allowances` table
- [ ] Verify linking attempted after extraction
- [ ] Verify warning shown if original invoice not found

---

### Phase 5: Report Generation Updates

**Step 5.1: Query both tables**

Update `lib/services/reports.ts` to fetch allowances separately:

```typescript
async function getReportData(clientId: string, periodId: string) {
  // Fetch invoices (existing)
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('client_id', clientId)
    .eq('tax_filing_period_id', periodId)
    .eq('status', 'confirmed');
  
  // Fetch allowances (new)
  const { data: allowances } = await supabase
    .from('allowances')
    .select('*')
    .eq('client_id', clientId)
    .eq('tax_filing_period_id', periodId)
    .eq('status', 'confirmed');
  
  return { invoices: invoices || [], allowances: allowances || [] };
}
```

**Step 5.2: Generate TXT rows for allowances (one row per line item)**

```typescript
function generateAllowanceTxtRows(
  allowance: Allowance,
  startRowNum: number,
  taxPayerId: string
): { rows: string[]; nextRowNum: number } {
  const data = allowance.extracted_data;
  const formatCode = getAllowanceFormatCode(
    allowance.in_or_out,
    data?.allowanceType || '電子發票折讓'
  );

  const items = data?.items?.length
    ? data.items
    : [{ amount: data?.amount, taxAmount: data?.taxAmount }];

  const rows = items.map((item, index) => {
    const rowNum = startRowNum + index;
    let row = '';
    row += formatCode;                           // Bytes 1-2: Format code
    row += String(rowNum).padStart(7, '0');      // Bytes 3-9: Row number
    row += taxPayerId.padEnd(8, ' ');            // Bytes 10-17: Tax payer ID
    // Use item.amount / item.taxAmount for line-level values
    // ... continue with allowance-specific format
    return row;
  });

  return { rows, nextRowNum: startRowNum + rows.length };
}
```

**Step 5.3: Update TET_U aggregation**

```typescript
function aggregateReportData(
  invoices: Invoice[], 
  allowances: Allowance[]
): TetUFields {
  const fields = initializeTetUFields();
  
  // Process invoices (existing logic)
  for (const inv of invoices) {
    // ... add to appropriate fields (9-12, 50-55, etc.)
  }
  
  // Process allowances (new)
  for (const allowance of allowances) {
    const data = allowance.extracted_data;
    const amount = data?.amount || 0;
    const taxAmount = data?.taxAmount || 0;
    
    if (allowance.in_or_out === 'out') {
      // 銷項折讓
      if (data?.taxType === '零稅率') {
        fields.field24 += amount;  // 零稅率退回及折讓
      } else {
        fields.field13 += amount;  // 應稅退回及折讓金額
        fields.field19 += taxAmount;  // 應稅退回及折讓稅額
      }
    } else {
      // 進項折讓
      const isFixedAsset = data?.deductionCode === '2';
      if (isFixedAsset) {
        fields.field57 += amount;  // 固定資產退出金額
        fields.field67 += taxAmount;  // 固定資產退出稅額
      } else {
        fields.field56 += amount;  // 進貨費用退出金額
        fields.field66 += taxAmount;  // 進貨費用退出稅額
      }
    }
  }
  
  // Calculate totals (existing formulas now work correctly)
  fields.field14 = (fields.field9 + fields.field10 + fields.field11 + fields.field12) - fields.field13;
  fields.field20 = (fields.field15 + fields.field16 + fields.field17 + fields.field18) - fields.field19;
  // ... etc.
  
  return fields;
}
```

**Verification:**
- [ ] Generate TXT with mix of invoices and allowances
- [ ] Verify invoices produce format codes 21/22/25/31/32/35
- [ ] Verify allowances produce format codes 23/24/33/34
- [ ] Verify TET_U fields 13, 19, 56, 57, 66, 67 are correctly populated
- [ ] Verify total calculations subtract allowances

---

### Phase 6: UI Updates

#### Design Decision: Same Page, Separate Sections

Display invoices and allowances on the **same page in separate sections**, each with independent pagination. This provides:
- Clean visual separation
- Simple pagination (each section queries its own table)
- Single import button handles both types with auto-detection

```
┌─────────────────────────────────────────────────────┐
│ 發票 (25)                                           │
├─────────────────────────────────────────────────────┤
│ AB-12345 | 進項 | $10,000 | 已確認                  │
│ CD-67890 | 銷項 | $25,000 | 待確認                  │
│ ... (pagination for invoices)                       │
├─────────────────────────────────────────────────────┤
│ 折讓 (3)                                            │
├─────────────────────────────────────────────────────┤
│ ZA-00001 | 進項 | -$500   | 已確認                  │
│ ... (pagination for allowances)                     │
├─────────────────────────────────────────────────────┤
│                              [上傳發票/折讓] [匯入]  │
└─────────────────────────────────────────────────────┘
```

**Step 6.1: Separate sections for invoices and allowances**

Update the period page (`/firm/[firmId]/client/[clientId]/period/[periodYYYMM]/page.tsx`) to display two sections:

```typescript
// Fetch invoices (existing, with pagination)
const { data: invoices, count: invoiceCount } = await supabase
  .from('invoices')
  .select('*, client:clients(id, name)', { count: 'exact' })
  .eq('client_id', clientId)
  .eq('tax_filing_period_id', periodId)
  .range(invoicePage * pageSize, (invoicePage + 1) * pageSize - 1);

// Fetch allowances (new, with separate pagination)
const { data: allowances, count: allowanceCount } = await supabase
  .from('allowances')
  .select('*, client:clients(id, name)', { count: 'exact' })
  .eq('client_id', clientId)
  .eq('tax_filing_period_id', periodId)
  .range(allowancePage * pageSize, (allowancePage + 1) * pageSize - 1);
```

```tsx
// Invoices section
<Card>
  <CardHeader>
    <CardTitle>發票 ({invoiceCount})</CardTitle>
  </CardHeader>
  <CardContent>
    <InvoiceTable invoices={invoices} />
    <Pagination page={invoicePage} total={invoiceCount} pageSize={pageSize} />
  </CardContent>
</Card>

// Allowances section
<Card>
  <CardHeader>
    <CardTitle>折讓 ({allowanceCount})</CardTitle>
  </CardHeader>
  <CardContent>
    <AllowanceTable allowances={allowances} />
    <Pagination page={allowancePage} total={allowanceCount} pageSize={pageSize} />
  </CardContent>
</Card>
```

**Step 6.2: Single import button with auto-detection**

One "匯入" button opens the import dialog, which accepts both invoice and allowance Excel files. Auto-detection routes to correct table.

**Step 6.3: Multi-file import dialog**

Update `InvoiceImportDialog` to support batch upload of up to 4 files with auto-detection:

```typescript
// components/invoice/invoice-import-dialog.tsx

const importUploadProps = useSupabaseUpload({
  bucketName: "electronic-invoices",  // Reuse existing bucket for both types
  path: `${firmId}/${importPeriod.toString()}`,
  allowedMimeTypes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  maxFiles: 4,  // Allow up to 4 files (in/out invoices + in/out allowances)
  maxFileSize: 5 * 1024 * 1024,
  // ... rest of config
});

// Process each file in parallel
const handleImportComplete = useCallback(async () => {
  if (isProcessingImport || !importUploadedFiles.length) return;
  setIsProcessingImport(true);

  try {
    // Process all files in parallel
    const results = await Promise.allSettled(
      importUploadedFiles.map(file =>
        processElectronicInvoiceFile(
          clientId,
          firmId,
          file.path,
          file.name,
          importPeriod.toString()
        )
      )
    );

    // Aggregate results
    const aggregated = {
      invoices: { inserted: 0, updated: 0 },
      allowances: { inserted: 0, updated: 0 },
      errors: [] as string[],
    };

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const r = result.value;
        // Note: Need to update ImportResult to distinguish invoice vs allowance counts
        aggregated.invoices.inserted += r.inserted;
        aggregated.invoices.updated += r.updated;
        aggregated.errors.push(...r.errors);
      } else {
        aggregated.errors.push(`${importUploadedFiles[index].name}: ${result.reason}`);
      }
    });

    // Show aggregated result
    const successCount = aggregated.invoices.inserted + aggregated.invoices.updated +
                        aggregated.allowances.inserted + aggregated.allowances.updated;
    if (successCount > 0) {
      toast.success(`成功匯入 ${successCount} 筆資料`);
      onSuccess();
    }
    if (aggregated.errors.length > 0) {
      toast.error(`${aggregated.errors.length} 筆匯入失敗`);
      console.error("Import errors:", aggregated.errors);
    }
  } finally {
    setIsProcessingImport(false);
    onOpenChange(false);
  }
}, [/* deps */]);
```

**Step 6.4: Storage bucket reuse**

Reuse existing storage buckets for both invoices and allowances:
- Paper allowances: `invoices` bucket (same as paper invoices)
- Electronic allowances: `electronic-invoices` bucket (same as electronic invoices)

No new buckets needed.

**Step 6.5: Upload flow for paper allowances**

After AI extraction, route to correct confirmation form based on document type:

```typescript
// After Gemini extraction
if (extractedData.isAllowance) {
  // Route to allowance confirmation form
  setReviewingAllowance({ ...allowance, extractedData });
} else {
  // Route to existing invoice confirmation form
  setReviewingInvoice({ ...invoice, extractedData });
}
```

**Step 6.6: Allowance review dialog (`components/allowance-review-dialog.tsx`)**

Similar to `InvoiceReviewDialog`, with allowance-specific fields:

```typescript
interface AllowanceReviewDialogProps {
  allowance: Allowance | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  isLocked?: boolean;
}
```

Form fields:
- `allowanceType`: dropdown (電子發票折讓, 三聯式折讓, 二聯式折讓)
- `date`: 折讓日期 (YYYY/MM/DD)
- `originalInvoiceSerialCode`: 原發票號碼 (editable, triggers re-link on save)
- `amount` / `taxAmount` / `totalAmount`: with math validation
- `sellerName` / `sellerTaxId` / `buyerName` / `buyerTaxId`
- `deductionCode`: 扣抵類別 (only for 進項 allowances: 1=進貨費用, 2=固定資產)
- `summary`: 品項摘要

Features:
- Excel preview for import-excel source (highlights matching rows by `折讓單號碼`)
- Unlinked warning alert when `original_invoice_serial_code` exists but `original_invoice_id` is null
- Math validation: amount + taxAmount = totalAmount
- Save as "processed" or "confirmed"
- Keyboard navigation: Arrow Up/Down for prev/next, Shift+Enter to confirm
- **On save**: If `original_invoice_serial_code` changed, call `tryLinkOriginalInvoice`

Server action (`lib/services/allowance.ts`):

```typescript
export async function updateAllowance(allowanceId: string, data: UpdateAllowanceInput) {
  // 1. Validate input
  // 2. Update extracted_data and status
  // 3. Sync original_invoice_serial_code column
  // 4. If serial code changed, attempt re-link via tryLinkOriginalInvoice
}
```

**Step 6.7: Unlinked allowance warning**

Display alert when allowance has `original_invoice_serial_code` but no `original_invoice_id`:

```tsx
{allowance.original_invoice_serial_code && !allowance.original_invoice_id && (
  <Alert variant="warning">
    找不到原始發票 {allowance.original_invoice_serial_code}
  </Alert>
)}
```

**Step 6.8: Invoice detail view**

Show linked allowances on invoice detail:

```typescript
// On invoice detail page
const { data: allowances } = await supabase
  .from('allowances')
  .select('*')
  .eq('original_invoice_id', invoiceId);

// Display as list
{allowances && allowances.length > 0 && (
  <Card>
    <CardHeader>
      <CardTitle>相關折讓單</CardTitle>
    </CardHeader>
    <CardContent>
      {allowances.map(a => (
        <div key={a.id}>
          {a.allowance_serial_code} - {a.extracted_data?.amount}
        </div>
      ))}
    </CardContent>
  </Card>
)}
```

**Verification:**
- [x] Page displays separate sections for invoices and allowances
- [ ] Each section has independent pagination
- [x] Single import button opens dialog accepting both file types
- [x] Multi-file import processes all files in parallel
- [x] Aggregated result shows correct counts (X 筆發票, Y 筆折讓)
- [ ] Paper allowance upload routes to correct confirmation form
- [x] Unlinked allowance shows warning in table
- [x] Invoice detail shows linked allowances
- [x] Clicking allowance row opens review dialog
- [x] Allowance review dialog shows form with allowance-specific fields
- [x] Allowance review dialog shows Excel preview for import-excel source
- [x] Allowance review dialog validates amount + taxAmount = totalAmount
- [x] Allowance review dialog allows save as "processed" or "confirmed"
- [x] Allowance review dialog re-links original invoice when serial code changes
- [x] Keyboard navigation works (Arrow Up/Down, Shift+Enter)

---

## Testing Checklist

### Integration Tests
- [ ] Excel import auto-detects file type by header (`折讓單號碼` = allowance)
- [ ] Allowance Excel rows with same `折讓單號碼` grouped into single record
- [ ] Line items combined into `summary` field in `extracted_data`
- [ ] Excel import routes allowance files to `allowances` table
- [ ] Excel import routes invoice files to `invoices` table
- [ ] Original invoice linking works on insert
- [ ] Original invoice linking works on serial code update
- [ ] AI extraction detects 折讓證明單
- [ ] `in_or_out` correctly derived from seller/buyer tax ID

### End-to-End Tests
- [ ] Multi-file import: Upload 4 files at once (in/out invoices + in/out allowances)
- [ ] Multi-file import: Each file processed in parallel
- [ ] Multi-file import: Aggregated result shows correct counts
- [ ] Multi-file import: Partial failure (3 succeed, 1 fails) handled gracefully
- [ ] Page displays separate sections for invoices and allowances
- [ ] Each section has independent pagination that works correctly
- [ ] Full flow: Upload paper allowance → AI extract → Confirm → Generate reports
- [ ] Full flow: Import Excel with allowances → Generate reports
- [ ] Verify TXT output format codes are correct
- [ ] Verify TET_U aggregation is correct
- [ ] Verify warning shown for unlinked allowances
- [ ] Invoice detail shows linked allowances

---

## Rollback Plan

If issues are discovered after deployment:

1. **Database**: `allowances` table is new, can be dropped if needed
2. **Code**: Feature flag could gate allowance routing
3. **Data**: No existing data affected (clean slate)

---

## Open Questions

1. ~~**Original Invoice Validation**: Should we warn if original invoice doesn't exist in system?~~ **Yes**, show alert in UI.
2. **Amount Validation**: Should we warn if allowance amount > original invoice amount?
3. **Date Validation**: Should we warn if allowance date is before original invoice date?
4. ~~**UI Priority**: Combined list or separate tabs for invoices vs allowances?~~ **Combined list** with type column and filter. See Phase 6.
