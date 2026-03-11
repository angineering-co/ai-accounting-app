# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About the App

SnapBooks.ai (記帳事務所) — an AI-powered accounting SaaS for Taiwan-based accounting firms. Firms manage clients; clients upload invoices (統一發票) and allowances (折讓證明單) which are processed by the Gemini AI API to extract structured data. The extracted data is reviewed and used to generate tax filing reports in government-mandated formats (TET_U).

The app is in Traditional Chinese (zh-Hant) and uses ROC (Republic of China) calendar year format (e.g., year 113 = 2024 AD). The 5-digit `year_month` field format is YYYMM (e.g., `11309` = September 2024).

## Commands

```bash
npm run dev           # Start development server (localhost:3000)
npm run build         # Production build
npm run lint          # Type-check + ESLint
npm run type-check    # TypeScript check only
npm test              # Run tests in watch mode (Vitest)
npm run test:run      # Run tests once (CI mode)

# Supabase local dev
npm run supabase:start   # Start local Supabase (Docker)
npm run supabase:stop    # Stop local Supabase
npm run supabase:status  # Check status
```

Run a single test file:
```bash
npx vitest run lib/domain/roc-period.test.ts
```

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
GEMINI_API_KEY=
```

## Architecture

### Route Structure (Next.js App Router)

- `app/(landing)/` — Public marketing pages (pricing, terms, privacy)
- `app/auth/` — Auth flows (login, sign-up, forgot-password, etc.)
- `app/dashboard/` — Post-login redirect / firm selection
- `app/firm/[firmId]/` — Main app shell (shared layout with sidebar)
  - `client/[clientId]/` — Client management
    - `period/[periodYYYMM]/` — Tax filing period detail (invoices, allowances)
    - `portal/` — Client-facing portal view (same route, different sidebar)
  - `dashboard/` — Firm dashboard
  - `invoice/` — Firm-level invoice management

The `[firmId]` layout (`app/firm/[firmId]/layout.tsx`) serves both accounting staff and clients — it renders `FirmSidebar` or `PortalSidebar` based on the user's `profile.role`.

### Key Layers

**`lib/domain/`** — Core domain models and business logic
- `models.ts` — All Zod schemas and TypeScript types (Invoice, Allowance, TaxFilingPeriod, Client, Profile, etc.)
- `roc-period.ts` — ROC calendar period utilities
- `format-codes.ts` — Taiwan invoice format code mappings

**`lib/services/`** — Server Actions (`"use server"`) and service functions
- `gemini.ts` — Gemini 2.5 Flash API integration: `extractInvoiceData()`, `extractAllowanceData()`, `determineAccountForInputElectronicInvoice()`
- `invoice.ts`, `allowance.ts` — CRUD + AI extraction trigger
- `reports.ts` — TET_U report generation (Big5 encoding for govt format)
- `tax-period.ts`, `invoice-range.ts`, `client.ts`, `client-user.ts` — Other service operations

**`lib/supabase/`** — Supabase client factories
- `server.ts` — `createClient()` for Server Components / Server Actions (cookie-based auth)
- `client.ts` — `createClient()` for Client Components (browser)
- `admin.ts` — Service role client for admin operations
- `proxy.ts` — Proxy client

**`lib/utils.ts`** — Shared utilities: `cn()`, date helpers, ROC year conversion (`toRocYearMonth`, `toGregorianDate`)

**`components/`** — React components (flat structure, no subdirectory nesting except `ui/`)
- `ui/` — shadcn/ui primitives
- Feature components colocated at root of `components/`

**`hooks/`** — Custom React hooks (SWR-based data fetching, upload queue, mobile detection)

### Data Model Relationships

```
Firm → Clients → TaxFilingPeriods (YYYMM)
                      ↓
               Invoices / Allowances  →  extracted_data (JSONB, AI-filled)
                                              ↓
                                       Reports (TET_U .txt files)
```

Invoice/Allowance status flow: `uploaded → processing → processed → confirmed | failed`

### AI Processing Flow

1. File uploaded to Supabase Storage → invoice record created with status `uploaded`
2. Server Action calls `extractInvoiceData()` in `lib/services/gemini.ts` → Gemini 2.5 Flash
3. Extracted data saved to `extracted_data` JSONB column, status → `processed`
4. Staff reviews and confirms → status → `confirmed`

### Testing

- **Unit tests**: Colocated with source (e.g., `lib/domain/roc-period.test.ts`)
- **Integration tests**: `tests/integration/` — use real Supabase instance
- Test fixtures/helpers in `tests/utils/supabase.ts` (`createTestFixture`, `cleanupTestFixture`)
- Static test data (JSON, XLSX) in `tests/fixtures/`

### Supabase

- `supabase/database.types.ts` — Auto-generated TypeScript types from schema
- `supabase/migrations/` — All DB migrations (chronological)
- RLS policies enforce firm-level data isolation; admin client bypasses RLS for service operations
