-- Phase 6b Work C: tighten `invoices.document_id` / `allowances.document_id`
-- to NOT NULL UNIQUE.
--
-- Pre-conditions (must hold at apply time):
--   1. Phase 6b Work B is deployed (electronic invoice import is
--      documents-first), so no new NULL document_id rows are being created.
--   2. `scripts/backfill-document-id.ts --confirm-remote` has been re-run in
--      prod and reports `remaining = 0`. The defensive RAISE EXCEPTION below
--      aborts the migration if any NULL row slipped through.
--
-- After this migration, every invoice / allowance has exactly one document
-- parent (UNIQUE), and every row has one (NOT NULL). The CTI parent/child
-- invariant is structurally enforced — Phase 7's confirm RPC no longer needs
-- to "upsert documents", and the orphan-detection query in
-- docs/VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md is the only remaining gap (orphans
-- are documents without ANY child, which UNIQUE cannot express).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM invoices WHERE document_id IS NULL) THEN
    RAISE EXCEPTION 'invoices.document_id 仍有 NULL row,請先重跑 scripts/backfill-document-id.ts 直到 remaining=0 再套此 migration';
  END IF;
  IF EXISTS (SELECT 1 FROM allowances WHERE document_id IS NULL) THEN
    RAISE EXCEPTION 'allowances.document_id 仍有 NULL row,請先重跑 scripts/backfill-document-id.ts 直到 remaining=0 再套此 migration';
  END IF;
END $$;

-- The Phase 5.5 single-column indexes become redundant once UNIQUE is added
-- (UNIQUE constraints auto-create a b-tree index on the column). Drop them
-- first so we don't carry two equivalent indexes.
DROP INDEX IF EXISTS invoices_document_id_idx;
DROP INDEX IF EXISTS allowances_document_id_idx;

ALTER TABLE invoices
  ALTER COLUMN document_id SET NOT NULL,
  ADD CONSTRAINT invoices_document_id_key UNIQUE (document_id);

ALTER TABLE allowances
  ALTER COLUMN document_id SET NOT NULL,
  ADD CONSTRAINT allowances_document_id_key UNIQUE (document_id);
