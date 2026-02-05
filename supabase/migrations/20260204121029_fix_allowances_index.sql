-- Fix: Remove WHERE clause from unique index to support ON CONFLICT inference
-- This is required because PostgREST/Supabase ON CONFLICT resolution requires 
-- a standard unique index or constraint on the specified columns, and does not 
-- automatically match partial indexes (with WHERE clauses).

DROP INDEX IF EXISTS idx_allowances_client_serial_unique;

CREATE UNIQUE INDEX idx_allowances_client_serial_unique
ON allowances (client_id, allowance_serial_code);
