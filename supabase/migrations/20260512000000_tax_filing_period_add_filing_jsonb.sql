-- Add filing jsonb column to tax_filing_periods.
--
-- Stores everything related to closing a VAT filing period:
--   {
--     "snapshots": {
--       "txt":   { "path": "<storage key>", "generated_at": "<iso>" },
--       "tet_u": { "path": "<storage key>", "generated_at": "<iso>" }
--     },
--     "attachments": [
--       { "path": "<storage key>", "filename": "<original.pdf>", "uploaded_at": "<iso>" }
--     ],
--     "filed_at": "<iso>"
--   }
--
-- All keys are optional; pre-existing rows backfill to '{}'. Validation lives
-- in the Zod taxFilingSchema (lib/domain/models.ts) rather than at the DB level.
alter table public.tax_filing_periods
  add column filing jsonb not null default '{}'::jsonb;
