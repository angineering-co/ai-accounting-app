-- Performance: composite indexes for the period-detail list pages.
--
-- The hottest read pattern is the period-scoped invoice/allowance list:
--   WHERE tax_filing_period_id = $1 [AND status = $2 | AND in_or_out = $3]
--   ORDER BY created_at DESC
--
-- Existing single-column indexes (idx_invoices_tax_filing_period_id,
-- idx_invoices_status, idx_allowances_client_period) cannot serve both the
-- equality filter and the ordering, so the planner falls back to an index
-- scan + in-memory sort. These composites turn the query into a single
-- index range scan, with no Sort node in the plan. Status-count COUNT(*)
-- queries also become index-only scans.
--
-- Rollout: regular CREATE INDEX (not CONCURRENTLY) — Supabase migrations
-- run in a transaction, and tables are well under 1M rows. If/when they
-- grow large, build new indexes manually via the SQL editor with
-- CONCURRENTLY and mark the migration applied.

-- Staff period page (filters by status, orders by created_at DESC).
-- Also serves the 5×status-count COUNT(*) queries.
CREATE INDEX IF NOT EXISTS idx_invoices_period_status_created
  ON invoices (tax_filing_period_id, status, created_at DESC);

-- Portal period page (filters by in_or_out, orders by created_at DESC).
CREATE INDEX IF NOT EXISTS idx_invoices_period_inout_created
  ON invoices (tax_filing_period_id, in_or_out, created_at DESC);

-- Allowances are always client-scoped — both staff and portal queries
-- include client_id alongside tax_filing_period_id.
CREATE INDEX IF NOT EXISTS idx_allowances_client_period_status_created
  ON allowances (client_id, tax_filing_period_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_allowances_client_period_inout_created
  ON allowances (client_id, tax_filing_period_id, in_or_out, created_at DESC);

-- Note: idx_invoices_tax_filing_period_id and idx_allowances_client_period
-- are now redundant (their leading columns are covered by the new composites)
-- but kept in this migration to allow a clean A/B comparison after deploy.
-- Drop them in a follow-up migration once the new indexes are confirmed in
-- pg_stat_user_indexes.
