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
| **Table Structure** | Extend `invoices` table | Reuse existing flows; aligns with government filing structure |
| **Document Type Field** | Top-level column + `extracted_data` | Required for unique constraint |
| **Format Code Storage** | Use existing `invoiceType` field | `invoiceType` already serves similar purpose |
| **Original Invoice Link** | Store in `extracted_data.originalInvoiceSerialCode` | No FK validation for now |
| **Customs Refund (格式29)** | Deferred | Not needed for 401 forms |
| **Special Tax Rate (格式38)** | Deferred | Only supporting 401 forms |

---

## Data Model Changes

### New Column: `document_type`

```sql
-- Required because paper allowances share serial codes with original invoices
ALTER TABLE invoices ADD COLUMN document_type TEXT 
  CHECK (document_type IN ('invoice', 'allowance')) 
  DEFAULT 'invoice';
```

### Updated Unique Index

```sql
-- Paper allowances use the original invoice's serial code
-- We need document_type to distinguish them
DROP INDEX IF EXISTS idx_invoices_client_serial_unique;

CREATE UNIQUE INDEX idx_invoices_client_serial_doctype_unique
ON invoices (client_id, invoice_serial_code, document_type)
WHERE invoice_serial_code IS NOT NULL;
```

### ExtractedInvoiceData Schema Updates

Add to `lib/domain/models.ts`:

```typescript
export const extractedInvoiceDataSchema = z.object({
  // ... existing fields ...
  
  // NEW: Document classification
  documentType: z.enum(['invoice', 'allowance']).optional().default('invoice'),
  
  // NEW: Original invoice reference (for allowances)
  originalInvoiceSerialCode: z.string().optional(),
});
```

### Document Type by Serial Code Pattern

| Document Type | Has Own Serial Code? | `invoice_serial_code` Value |
|--------------|---------------------|----------------------------|
| Electronic invoice | Yes | Own serial code |
| Electronic allowance | Yes | Own serial code |
| Paper invoice | Yes | Own serial code |
| Paper allowance | No | **Original invoice's serial code** |

---

## Format Code Mapping

### Design: Many-to-One Mapping (invoiceType → formatCode)

The `invoiceType` field is **semantic** (what type of document is this), while `formatCode` is a **derived output format** for government filing. Multiple invoiceTypes can map to the same format code.

| invoiceType | documentType | 銷項 formatCode | 進項 formatCode |
|-------------|--------------|-----------------|-----------------|
| 手開三聯式 | invoice | 31 | 21 |
| 手開二聯式 | invoice | 32 | 22 |
| 電子發票 | invoice | 35 | 25 |
| 三聯式收銀機 | invoice | 35 | 25 |
| 二聯式收銀機 | invoice | 32 | 22 |
| 免用發票 | invoice | 36 | — |
| 海關代徵 | invoice | — | 28 |
| **三聯式折讓** | allowance | **33** | **23** |
| **電子發票折讓** | allowance | **33** | **23** |
| **二聯式折讓** | allowance | **34** | **24** |

Note: 三聯式折讓 and 電子發票折讓 both map to format code 33/23.

### Implementation

```typescript
// lib/domain/format-codes.ts

// ============================================================
// Reverse Mapping: formatCode → invoiceType (for TXT/Excel imports)
// ============================================================
// TXT/Excel imports are for ELECTRONIC invoices only.
// Paper invoices/allowances are uploaded via photo.
// So format code 33/23 → 電子發票折讓 (not 三聯式折讓).

export const FORMAT_CODE_TO_INVOICE_TYPE: Record<string, {
  inOrOut: 'in' | 'out';
  documentType: 'invoice' | 'allowance';
  invoiceType: string;
}> = {
  // Sales (銷項) - Regular Invoices
  '31': { inOrOut: 'out', documentType: 'invoice', invoiceType: '手開三聯式' },
  '32': { inOrOut: 'out', documentType: 'invoice', invoiceType: '手開二聯式' },
  '35': { inOrOut: 'out', documentType: 'invoice', invoiceType: '電子發票' },
  '36': { inOrOut: 'out', documentType: 'invoice', invoiceType: '免用發票' },
  
  // Sales (銷項) - Allowances (電子發票折讓 for TXT/Excel import)
  '33': { inOrOut: 'out', documentType: 'allowance', invoiceType: '電子發票折讓' },
  '34': { inOrOut: 'out', documentType: 'allowance', invoiceType: '二聯式折讓' },
  
  // Purchases (進項) - Regular Invoices
  '21': { inOrOut: 'in', documentType: 'invoice', invoiceType: '手開三聯式' },
  '22': { inOrOut: 'in', documentType: 'invoice', invoiceType: '手開二聯式' },
  '25': { inOrOut: 'in', documentType: 'invoice', invoiceType: '電子發票' },
  '28': { inOrOut: 'in', documentType: 'invoice', invoiceType: '海關代徵' },
  
  // Purchases (進項) - Allowances (電子發票折讓 for TXT/Excel import)
  '23': { inOrOut: 'in', documentType: 'allowance', invoiceType: '電子發票折讓' },
  '24': { inOrOut: 'in', documentType: 'allowance', invoiceType: '二聯式折讓' },
};

// ============================================================
// Forward Mapping: invoiceType → formatCode (for exports/reports)
// ============================================================
// Many-to-one: multiple invoiceTypes can produce the same format code.

export function isAllowance(formatCode: string): boolean {
  return ['23', '24', '33', '34'].includes(formatCode);
}

export function getFormatCode(inv: ExtractedInvoiceData): string {
  const { inOrOut, documentType, invoiceType } = inv;
  const isAllowanceDoc = documentType === 'allowance';
  
  // Allowance format codes (many-to-one mapping)
  // 三聯式折讓, 電子發票折讓 → 33 (銷項) or 23 (進項)
  // 二聯式折讓 → 34 (銷項) or 24 (進項)
  if (isAllowanceDoc) {
    const isTriplicateFamily = 
      invoiceType === '三聯式折讓' || 
      invoiceType === '電子發票折讓';
    
    return inOrOut === '銷項'
      ? (isTriplicateFamily ? '33' : '34')
      : (isTriplicateFamily ? '23' : '24');
  }
  
  // Regular invoice format codes
  if (inOrOut === '銷項') {
    switch (invoiceType) {
      case '手開三聯式': return '31';
      case '手開二聯式': return '32';
      case '電子發票': return '35';
      case '三聯式收銀機': return '35';
      case '二聯式收銀機': return '32';
      case '免用發票': return '36';
      default: return '35'; // Default to electronic
    }
  } else {
    switch (invoiceType) {
      case '手開三聯式': return '21';
      case '手開二聯式': return '22';
      case '電子發票': return '25';
      case '三聯式收銀機': return '25';
      case '二聯式收銀機': return '22';
      case '海關代徵': return '28';
      default: return '25'; // Default to electronic
    }
  }
}
```

---

## Implementation Steps

### Phase 1: Data Model (Database Migration)

**Step 1.1: Add `document_type` column**

Create migration file:
```sql
-- Add document_type column
ALTER TABLE invoices ADD COLUMN document_type TEXT 
  CHECK (document_type IN ('invoice', 'allowance')) 
  DEFAULT 'invoice';

-- Backfill existing records
UPDATE invoices SET document_type = 'invoice' WHERE document_type IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE invoices ALTER COLUMN document_type SET NOT NULL;
```

**Verification:**
- [ ] Run migration locally
- [ ] Verify column exists: `SELECT document_type FROM invoices LIMIT 1;`
- [ ] Verify all existing records have `document_type = 'invoice'`

**Step 1.2: Update unique index**

```sql
-- Drop old index
DROP INDEX IF EXISTS idx_invoices_client_serial_unique;

-- Create new index with document_type
CREATE UNIQUE INDEX idx_invoices_client_serial_doctype_unique
ON invoices (client_id, invoice_serial_code, document_type)
WHERE invoice_serial_code IS NOT NULL;
```

**Verification:**
- [ ] Run migration locally
- [ ] Test: Insert invoice with serial `AB12345678`, then insert allowance with same serial - should succeed
- [ ] Test: Insert two invoices with same serial - should fail

**Step 1.3: Update `supabase/database.types.ts`**

Run `npx supabase gen types typescript` to regenerate types.

**Verification:**
- [ ] `invoices.Row` has `document_type: string`
- [ ] `invoices.Insert` has `document_type?: string`

---

### Phase 2: Domain Model Updates

**Step 2.1: Update `lib/domain/models.ts`**

Add to `extractedInvoiceDataSchema`:
```typescript
documentType: z.enum(['invoice', 'allowance']).optional().default('invoice'),
originalInvoiceSerialCode: z.string().optional(),
```

Update `invoiceType` enum to include allowance types (separate types for semantic clarity):
```typescript
invoiceType: z.enum([
  // Regular invoices
  '手開二聯式', '手開三聯式', '電子發票', 
  '二聯式收銀機', '三聯式收銀機',
  // Allowances (separate types, even if same format code)
  // 三聯式折讓 and 電子發票折讓 both → format code 33/23
  // 二聯式折讓 → format code 34/24
  '三聯式折讓', '電子發票折讓', '二聯式折讓'
]).optional(),
```

**Verification:**
- [ ] `npm run lint` passes
- [ ] Types compile without errors

**Step 2.2: Create format code utilities**

Create `lib/domain/format-codes.ts` with:
- `FORMAT_CODE_TO_INVOICE_TYPE`: Reverse mapping for imports (formatCode → invoiceType)
- `getFormatCode()`: Forward mapping for exports (invoiceType → formatCode, many-to-one)
- `isAllowance()`: Helper to check if a format code is an allowance

**Verification:**
- [ ] `isAllowance('33')` returns `true`
- [ ] `isAllowance('31')` returns `false`
- [ ] `getFormatCode({ inOrOut: '銷項', documentType: 'allowance', invoiceType: '三聯式折讓' })` returns `'33'`
- [ ] `getFormatCode({ inOrOut: '銷項', documentType: 'allowance', invoiceType: '電子發票折讓' })` returns `'33'` (same!)
- [ ] `getFormatCode({ inOrOut: '進項', documentType: 'allowance', invoiceType: '二聯式折讓' })` returns `'24'`

---

### Phase 3: Import Flow Updates

**Step 3.1: Update TXT import (`lib/services/invoice-import.ts`)**

In `parseTxtRow`:
1. Detect format codes 23, 24, 33, 34 as allowances
2. Set `document_type` column on insert
3. Set `documentType` in `extracted_data`

```typescript
const formatCode = substringBytes(buffer, 1, 2);
const documentType = isAllowance(formatCode) ? 'allowance' : 'invoice';

// In the return object:
return {
  // ... existing fields ...
  document_type: documentType,  // NEW: DB column
};
```

**Verification:**
- [ ] Import TXT file with format code 33 record
- [ ] Verify `document_type = 'allowance'` in database
- [ ] Verify `extracted_data.documentType = 'allowance'`
- [ ] Verify `extracted_data.invoiceType = '電子發票折讓'` (TXT/Excel = electronic)

**Step 3.2: Update Excel import**

In `processExcelFile`:
1. Check format code from Excel row
2. Set `document_type` accordingly

**Verification:**
- [ ] Import Excel file with allowance records
- [ ] Verify correct `document_type` values

**Step 3.3: Update upsert conflict handling**

In `processElectronicInvoiceFile`, update the upsert:
```typescript
.upsert(invoicesToInsert, {
  onConflict: "client_id, invoice_serial_code, document_type",  // UPDATED
})
```

**Verification:**
- [ ] Import invoice, then import allowance with same serial - both records exist
- [ ] Re-import same allowance - updates existing record (no duplicate)

---

### Phase 4: AI Extraction Updates

**Step 4.1: Update Gemini prompt (`lib/services/gemini.ts`)**

Add document type detection to the prompt:

```
**IMPORTANT: Document Type Detection**
First, identify the document type:
1. **統一發票** (Invoice): Regular invoice with "統一發票" header
2. **折讓證明單** (Allowance Certificate): Contains "銷貨退回或折讓證明單" or "進貨退出或折讓證明單"

For 折讓證明單, also extract:
- **originalInvoiceSerialCode**: The original invoice number referenced
- Set **documentType** to "allowance"
```

**Verification:**
- [ ] Upload photo of 折讓證明單
- [ ] Verify AI extracts `documentType: 'allowance'`
- [ ] Verify AI extracts `originalInvoiceSerialCode`

---

### Phase 5: Report Generation Updates

**Step 5.1: Update `generateTxtRow` in `lib/services/reports.ts`**

Use `getFormatCode()` helper to determine format code based on document type:

```typescript
function generateTxtRow(inv: ExtractedInvoiceData, rowNum: number, taxPayerId: string): string {
  let row = '';
  
  // Bytes 1-2: Format Code - use helper
  const formatCode = getFormatCode(inv);
  row += formatCode;
  
  // ... rest unchanged
}
```

**Verification:**
- [ ] Generate TXT with allowance records
- [ ] Verify format codes are 33/34 for 銷項 allowances
- [ ] Verify format codes are 23/24 for 進項 allowances

**Step 5.2: Update `aggregateInvoiceData`**

Replace placeholder `const isReturn = false` with actual logic:

```typescript
const documentType = inv.documentType || 'invoice';
const isReturn = documentType === 'allowance';
```

**Verification:**
- [ ] Write unit test with mix of invoices and allowances
- [ ] Verify `returnsAndAllowances.sales` is correctly aggregated
- [ ] Verify `totalSales` calculation subtracts allowances

**Step 5.3: Update TET_U field mappings**

Ensure aggregated values map to correct fields:
- Field 13/19: 銷項應稅折讓
- Field 24: 銷項零稅率折讓  
- Field 56/66: 進項進貨費用折讓
- Field 57/67: 進項固定資產折讓

**Verification:**
- [ ] Generate TET_U with allowances
- [ ] Verify fields 13, 19, 56, 66 have correct values
- [ ] Verify total calculations (field 14 = 9+10+11+12 - 13)

---

### Phase 6: UI Updates (Optional/Future)

**Step 6.1: Document type indicator in list view**
- Add badge/icon to distinguish allowances from invoices

**Step 6.2: Filter by document type**
- Add dropdown filter: All / Invoices / Allowances

**Step 6.3: Allowance-specific fields in edit form**
- Show `originalInvoiceSerialCode` for allowances
- Link to original invoice if it exists in the system

---

## Testing Checklist

### Unit Tests
- [ ] `isAllowance()` function
- [ ] `getFormatCode()` function - verify many-to-one mapping:
  - 三聯式折讓 → 33 (銷項) / 23 (進項)
  - 電子發票折讓 → 33 (銷項) / 23 (進項) ← same as above!
  - 二聯式折讓 → 34 (銷項) / 24 (進項)
- [ ] `FORMAT_CODE_TO_INVOICE_TYPE` reverse lookup
- [ ] `aggregateInvoiceData()` with allowances

### Integration Tests
- [ ] TXT import with allowance format codes
- [ ] Excel import with allowance records
- [ ] Upsert doesn't conflict invoice vs allowance with same serial

### End-to-End Tests
- [ ] Full flow: Upload allowance → Confirm → Generate reports
- [ ] Verify TXT output has correct format codes
- [ ] Verify TET_U aggregation is correct

---

## Rollback Plan

If issues are discovered after deployment:

1. **Database**: `document_type` has default value, so existing queries still work
2. **Index**: Old index can be recreated if needed
3. **Code**: Feature flag could gate allowance detection (optional)

---

## Open Questions

1. **UI Priority**: Should we implement Phase 6 (UI updates) in this iteration?
2. **Validation**: Should we warn if allowance date is before original invoice date?
3. **Linking**: Should we add FK from allowance to original invoice in the future?
