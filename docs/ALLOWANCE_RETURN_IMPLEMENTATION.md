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
  
  // Amounts
  amount: z.number().optional(),      // 折讓金額 (銷售額)
  taxAmount: z.number().optional(),   // 折讓稅額
  totalAmount: z.number().optional(), // 合計
  
  // Date
  date: z.string().optional(),  // YYYY/MM/DD format
  
  // Party information (used to derive in_or_out)
  sellerName: z.string().optional(),
  sellerTaxId: z.string().optional(),
  buyerName: z.string().optional(),
  buyerTaxId: z.string().optional(),
  
  // For 進項 allowances: deduction type
  deductionCode: z.enum(['1', '2']).optional(),  // 1=進貨費用, 2=固定資產
  
  // Metadata
  source: z.enum(['scan', 'import-txt', 'import-excel']).optional(),
  confidence: z.record(z.string(), z.enum(['low', 'medium', 'high'])).optional(),
}).passthrough();

export type ExtractedAllowanceData = z.infer<typeof extractedAllowanceDataSchema>;
```

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
| TXT/Excel import | Yes | Allowance's own code | From import data |
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

// Reverse mapping for TXT/Excel imports
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

### Phase 3: Import Flow Updates

**Step 3.1: Update TXT import (`lib/services/invoice-import.ts`)**

Route allowance format codes (23, 24, 33, 34) to the `allowances` table:

```typescript
function parseTxtRow(buffer: Buffer, clientId: string, periodId: string) {
  const formatCode = substringBytes(buffer, 1, 2);
  
  if (isAllowanceFormatCode(formatCode)) {
    return parseAllowanceTxtRow(buffer, clientId, periodId, formatCode);
  } else {
    return parseInvoiceTxtRow(buffer, clientId, periodId, formatCode);
  }
}

function parseAllowanceTxtRow(
  buffer: Buffer, 
  clientId: string, 
  periodId: string,
  formatCode: string
) {
  const { inOrOut, allowanceType } = ALLOWANCE_FORMAT_CODE_MAP[formatCode];
  const serialCode = substringBytes(buffer, 11, 10).trim();
  const originalSerialCode = substringBytes(buffer, /* position for original */);
  
  return {
    table: 'allowances',
    data: {
      client_id: clientId,
      tax_filing_period_id: periodId,
      allowance_serial_code: serialCode,
      original_invoice_serial_code: originalSerialCode,
      in_or_out: inOrOut,
      extracted_data: {
        allowanceType,
        amount: parseAmount(buffer),
        taxAmount: parseTaxAmount(buffer),
        date: parseDate(buffer),
        source: 'import-txt',
        // ... other fields
      },
      status: 'processed',
    }
  };
}
```

**Step 3.2: Link original invoice**

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

**Step 3.3: Show alert for unlinked allowances**

In the UI, when displaying an allowance that has `original_invoice_serial_code` but no `original_invoice_id`:

```typescript
// In allowance detail/list component
if (allowance.original_invoice_serial_code && !allowance.original_invoice_id) {
  // Show warning alert
  toast.warning(`找不到原始發票 ${allowance.original_invoice_serial_code}`);
}
```

**Verification:**
- [ ] Import TXT file with format code 33 records
- [ ] Verify records inserted into `allowances` table (not `invoices`)
- [ ] Verify `extracted_data.allowanceType = '電子發票折讓'`
- [ ] Verify linking works when original invoice exists
- [ ] Verify warning shown when original invoice not found
- [ ] Verify manual update of serial code triggers re-link attempt

**Step 3.4: Update Excel import similarly**

---

### Phase 4: AI Extraction Updates (Paper Allowances)

**Step 4.1: Update Gemini prompt (`lib/services/gemini.ts`)**

Add document type detection:

```
**IMPORTANT: Document Type Detection**

First, identify the document type:

1. **統一發票** (Invoice): Regular invoice with "統一發票" header
2. **折讓證明單** (Allowance Certificate): Contains "銷貨退回或折讓證明單" or "進貨退出或折讓證明單"

For 折讓證明單, extract these fields:
- **originalInvoiceSerialCode**: The original invoice number being referenced
- **allowanceType**: One of "三聯式折讓", "電子發票折讓", or "二聯式折讓"
- **amount**: The allowance amount (折讓金額)
- **taxAmount**: The tax amount (折讓稅額)
- **date**: The allowance date
- **sellerName**, **sellerTaxId**, **buyerName**, **buyerTaxId**: Party info (used to determine 進項/銷項)

Return `isAllowance: true` to indicate this is an allowance document.
```

Note: We don't ask AI to extract `inOrOut` directly. Instead, we derive it by comparing `sellerTaxId`/`buyerTaxId` with the client's `tax_id`.

**Step 4.2: Route to correct table after extraction**

```typescript
async function processUploadedDocument(
  file: UploadedFile, 
  clientId: string,
  clientTaxId: string
) {
  const extractedData = await extractWithGemini(file);
  
  if (extractedData.isAllowance) {
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
- [ ] Verify AI extracts `isAllowance: true`
- [ ] Verify `in_or_out` is correctly derived from seller/buyer tax ID
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

**Step 5.2: Generate TXT rows for allowances**

```typescript
function generateAllowanceTxtRow(
  allowance: Allowance, 
  rowNum: number, 
  taxPayerId: string
): string {
  const data = allowance.extracted_data;
  const formatCode = getAllowanceFormatCode(
    allowance.in_or_out,
    data?.allowanceType || '電子發票折讓'
  );
  
  let row = '';
  row += formatCode;                           // Bytes 1-2: Format code
  row += String(rowNum).padStart(7, '0');      // Bytes 3-9: Row number
  row += taxPayerId.padEnd(8, ' ');            // Bytes 10-17: Tax payer ID
  row += (allowance.allowance_serial_code || '').padEnd(10, ' '); // Bytes 18-27
  // ... continue with allowance-specific format
  
  return row;
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

**Step 6.1: Allowance list view**

Create a separate allowances list page or add a tab to the invoices page.

**Step 6.2: Upload flow**

After AI extraction, route to correct confirmation form based on document type.

**Step 6.3: Allowance edit form**

Similar to invoice edit form, with:
- Original invoice serial code field (editable)
- Link to original invoice (if exists)
- Allowance type dropdown
- **On save**: If `original_invoice_serial_code` changed, attempt to re-link

**Step 6.4: Unlinked allowance warning**

Display alert when allowance has `original_invoice_serial_code` but no `original_invoice_id`:

```tsx
{allowance.original_invoice_serial_code && !allowance.original_invoice_id && (
  <Alert variant="warning">
    找不到原始發票 {allowance.original_invoice_serial_code}
  </Alert>
)}
```

**Step 6.5: Invoice detail view**

Show linked allowances:
```typescript
// On invoice detail page
const { data: allowances } = await supabase
  .from('allowances')
  .select('*')
  .eq('original_invoice_id', invoiceId);
```

---

## Testing Checklist

### Unit Tests
- [ ] `getAllowanceFormatCode()` function
- [ ] `isAllowanceFormatCode()` function
- [ ] `ALLOWANCE_FORMAT_CODE_MAP` lookups
- [ ] `deriveInOrOut()` function
- [ ] `aggregateReportData()` with allowances

### Integration Tests
- [ ] TXT import routes allowance format codes to `allowances` table
- [ ] Excel import routes allowances correctly
- [ ] Original invoice linking works on insert
- [ ] Original invoice linking works on serial code update
- [ ] AI extraction detects 折讓證明單
- [ ] `in_or_out` correctly derived from seller/buyer tax ID

### End-to-End Tests
- [ ] Full flow: Upload paper allowance → AI extract → Confirm → Generate reports
- [ ] Full flow: Import TXT with allowances → Generate reports
- [ ] Verify TXT output format codes are correct
- [ ] Verify TET_U aggregation is correct
- [ ] Verify warning shown for unlinked allowances

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
4. **UI Priority**: Combined list or separate tabs for invoices vs allowances?
