-- Durable replacement for the deprecated `[api].auto_expose_new_tables` flag.
--
-- Until CLI v2.106.0, that flag (default true) implicitly granted the PostgREST
-- roles access to every table in `public`. It now defaults to false and is
-- scheduled for removal on 2026-10-30. This migration makes the grants explicit
-- so PostgREST keeps working after the flag is gone, and sets default privileges
-- so tables created by FUTURE migrations are reachable without re-granting.
--
-- Security note: row visibility is still enforced by RLS (every public table has
-- RLS enabled). These are table-level privileges only; without a matching policy
-- a role can reach the table but sees/changes no rows.
--
-- Roles:
--   service_role  — backs the admin client and "use server" actions; bypasses
--                   RLS, so it needs full access.
--   authenticated — logged-in firm staff & clients querying via PostgREST;
--                   row access gated by RLS. Needs CRUD only (PostgREST never
--                   issues TRUNCATE/TRIGGER/REFERENCES).
--   anon          — intentionally NOT granted. Nothing reads public tables
--                   before login, and public writes (e.g. lead capture in
--                   lib/actions/apply.ts) go through the service_role admin
--                   client. If a genuinely public (pre-login) PostgREST read is
--                   ever added, grant anon explicitly on that specific table.

-- Schema usage (normally already granted by the bootstrap role; idempotent).
grant usage on schema public to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Existing objects
-- ---------------------------------------------------------------------------
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Future objects — this is what `auto_expose_new_tables = true` did implicitly.
-- Default privileges attach to objects created by the role running migrations
-- (postgres, both locally via the CLI and on the hosted project).
-- ---------------------------------------------------------------------------
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
