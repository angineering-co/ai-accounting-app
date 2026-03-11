-- =============================================================================
-- Bulk AI Extraction Queue Setup
-- Uses pgmq for durable message queue, pg_cron + pg_net to trigger Edge Function
--
-- After running this migration, enable "Expose Queues via PostgREST" in:
--   Hosted: Supabase Dashboard → Integrations → Queues
--   Local:  Supabase Studio (localhost:54323) → Integrations → Queues
-- Then add "pgmq_public" to config.toml schemas and restart.
-- =============================================================================

-- Enable required extensions
create extension if not exists pgmq;
create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

-- Create the extraction queue (creates pgmq.q_extraction_jobs and pgmq.a_extraction_jobs)
select pgmq.create('extraction_jobs');

-- Enable RLS on queue tables (required before exposing via PostgREST)
alter table pgmq.q_extraction_jobs enable row level security;
alter table pgmq.a_extraction_jobs enable row level security;

-- Allow service_role full access (Edge Function worker uses service role)
create policy "Service role can manage queue"
  on pgmq.q_extraction_jobs for all
  using (true)
  with check (true);

create policy "Service role can manage archive"
  on pgmq.a_extraction_jobs for all
  using (true)
  with check (true);

-- Allow authenticated users to send messages and read queue (for server actions)
create policy "Authenticated users can insert"
  on pgmq.q_extraction_jobs for insert
  to authenticated
  with check (true);

create policy "Authenticated users can select"
  on pgmq.q_extraction_jobs for select
  to authenticated
  using (true);

-- Grant schema-level access so roles can reach pgmq tables/functions
grant usage on schema pgmq to authenticated, service_role;

-- Authenticated users need INSERT (send) and SELECT (check) on the queue table
grant select, insert on pgmq.q_extraction_jobs to authenticated;
grant select on pgmq.a_extraction_jobs to authenticated;

-- Service role (Edge Function worker) needs full access to pgmq objects
grant all on all tables in schema pgmq to service_role;
grant all on all sequences in schema pgmq to service_role;
grant execute on all functions in schema pgmq to service_role;

-- Store Edge Function connection info in Vault (Supabase-recommended approach).
-- On hosted Supabase, update these secrets via Dashboard → Settings → Vault
-- to use the real project URL and service role key.
select vault.create_secret('http://kong:8000', 'project_url');
select vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  'service_role_key'
);

-- Schedule worker every 10 seconds via pg_cron + pg_net
-- The cron job reads URL and auth from Vault at execution time
select cron.schedule(
  'process-extraction-jobs',
  '10 seconds',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/extraction-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
