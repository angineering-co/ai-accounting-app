-- Phase 7: draft journal-entry generation is a period-level batch action
-- (generatePeriodDraftEntries), not a per-confirm side effect. This column is
-- the single-run mutex + button gate for that batch:
--   'idle'    — no generation run in progress
--   'running' — a run holds the period; a concurrent run is rejected at the
--               claim UPDATE, so the UI button can stay disabled across reloads,
--               other tabs, and other staff on the same period.
-- `voucher_generation_started_at` exists only to reclaim a flag left stuck by a
-- crashed / timed-out run (stale-run guard). The batch work is idempotent and
-- resumable, so reclaiming just continues. No progress counters are stored — a
-- binary running / idle state is enough.

ALTER TABLE tax_filing_periods
    ADD COLUMN voucher_generation_status TEXT NOT NULL DEFAULT 'idle',
    ADD COLUMN voucher_generation_started_at TIMESTAMPTZ;

ALTER TABLE tax_filing_periods
    ADD CONSTRAINT tax_filing_periods_voucher_generation_status_check
    CHECK (voucher_generation_status IN ('idle', 'running'));
