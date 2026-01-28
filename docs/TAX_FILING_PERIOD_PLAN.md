# Tax Filing Period Implementation Plan

## Overview
Refactoring the application to treat "Tax Filing Period" as a first-class entity rather than just a date property on invoices. This enables strict lifecycle management (Open/Locked/Filed), better performance via cached aggregates, and decoupled reporting (e.g., reporting a past invoice in the current tax period).

## 1. Database Schema Changes

### 1.1 New Table: `tax_filing_periods`
Create a new table to manage the lifecycle of a filing period.

- `id`: UUID (PK)
- `firm_id`: UUID (FK to firms)
- `client_id`: UUID (FK to clients)
- `year_month`: String (5 chars, e.g., "11301")
- `status`: Varchar (check: 'open', 'locked', 'filed') - Default 'open'
- `created_at`: Timestamp
- `updated_at`: Timestamp

### 1.2 Update Table: `invoices`
Link invoices to their specific filing bucket.

- Add `tax_filing_period_id`: UUID (FK to `tax_filing_periods`, nullable initially)
- **Migration Strategy**:
  - Existing invoices need to be backfilled. A migration script `supabase/migrations/20260126000001_backfill_periods.sql` is provided.

## 2. Domain Model & Validation Updates

### 2.1 Update Models (`lib/domain/models.ts`)
- Add `TaxFilingPeriod` Zod schema using App-Level Enums (`TAX_PERIOD_STATUS`).
- Update `Invoice` schema to include `tax_filing_period_id`.

### 2.2 Validation Rules
Implement strict validation for linking invoices to periods:

| Invoice Type | Rule | Error Message |
| :--- | :--- | :--- |
| **Output (Sales)** | `Invoice.year_month` == `Period.year_month` | "銷項發票日期必須與申報期別一致" |
| **Input (Purchase)** | `Invoice.year_month` <= `Period.year_month` | "不可申報未來發票" |
| **Input (Purchase)** | `Invoice.year_month` > `Period.year_month - 10 years` | (Warning only) "發票日期過久" |

## 3. Backend Service Updates

### 3.1 Invoice Import Service (`lib/services/invoice-import.ts`)
Update `processElectronicInvoiceFile` to accept `targetFilingPeriod` (YYYMM).

- **Logic Flow**:
  1. **Resolve Period**: Check if `tax_filing_periods` exists for the target YYYMM. **Throw error if missing** (User must create period first).
  2. **Parse Row**: Extract invoice data (Transaction Date).
  3. **Validate**: Apply the Input/Output rules above comparing Transaction Date vs Target Period.
  4. **Link**: Set `invoice.tax_filing_period_id` to the resolved Period ID.
  5. **Insert**: Save the invoice.

### 3.2 Invoice CRUD Actions (`lib/services/invoice.ts`)
- Update `createInvoice` and `updateInvoice`:
  - Accept `period_id` or resolve it from input YYYMM.
  - **Protection**: Check `Period.status`. If `LOCKED` or `FILED`, reject the write operation with "此期別已鎖定".

### 3.3 Period Management Service (`lib/services/tax-period.ts`)
Create new service to handle period operations:
- `getTaxPeriodByYYYMM(clientId, yyymm)`: Lookup only.
- `createTaxPeriod(firmId, clientId, yyymm)`: Explicit creation.
- `updateTaxPeriodStatus(periodId, status)`: Sets status to LOCKED/OPEN.
- `getPeriodSummary(periodId)`: Returns aggregates.

## 4. UI/UX Implementation

### 4.1 Client Detail Page (`app/firm/[firmId]/client/[clientId]/page.tsx`)
- **Restructure Tabs**:
  - **Tab 1: Filings (申報管理)** (Default): Displays the grid of `PeriodCard` components.
  - **Tab 2: Basic Info (基本資料)**: Keeps existing client details.
  - **Removed**: "Invoices" and "Reports" tabs (moved to Period Page).
- **Fix Bug**: Wire up `PeriodSelector` in the import dialog (which will eventually be moved to Period Page, but good to fix in interim if needed).

### 4.2 Dashboard / Period Cards
- **New Component**: `PeriodCard`
  - Display: YYYMM, Status Badge (Open/Filed), Quick Stats (Sales/Tax).
  - Action: Click to drill down into the invoice list for that period.
- **Action**: "New Period" button.
  - Opens a dialog to select a Year/Month (e.g., "11303").
  - Calls `createTaxFilingPeriod` to initialize the bucket.
  - Redirects to the new Period Page.

### 4.3 Period Detail Page (`app/firm/[firmId]/client/[clientId]/period/[periodYYYMM]/page.tsx`)
- **New Route**: Dedicated view for a specific filing period.
- **Layout**:
  - **Header**: Period Info (e.g., "113年 01-02月"), Status Badge, "Lock/Unlock" actions.
  - **Tabs**:
    - **Invoices (發票列表)**:
      - Contains the `InvoiceTable` (filtered by this period).
      - Includes "Upload" and "Import" actions (context-aware of this period).
    - **Ranges (字軌管理)**:
      - Contains `RangeManagement` component (scoped to this period).
    - **Reports (報表產生)**:
      - Contains `ReportGeneration` component (scoped to this period).

## Execution Sequence

1.  **Schema & Models**: [COMPLETED] Define Zod schemas and prepare DB migration.
2.  **Service Layer (Import)**: [COMPLETED] Refactor `invoice-import.ts` to handle the `targetFilingPeriod` logic and validation rules.
3.  **UI Bug Fix**: [COMPLETED] Wire up the `PeriodSelector` in the import dialog to pass data to the backend.
4.  **Service Layer (CRUD)**: [TODO] Implement the "Lock" protection in standard Create/Update actions.
5.  **UI Features**: [COMPLETED] Build the Period Dashboard and Status management controls.
