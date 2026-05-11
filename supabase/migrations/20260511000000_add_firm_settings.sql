-- Add a single JSONB settings column to firms for firm-level configuration
-- (e.g., TET_U declarer/agent fields). Querying by individual keys is not
-- needed; JSONB lets us add more settings later without further migrations.
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS settings JSONB;
