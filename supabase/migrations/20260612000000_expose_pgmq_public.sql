-- Reproduce the "Expose Queues via PostgREST" setup as a migration.
--
-- Enabling queue exposure in Studio/Dashboard creates a `pgmq_public` wrapper
-- schema (security-invoker functions over pgmq.*) and grants the API roles
-- access to it. That is a manual, out-of-band step that does NOT reproduce on
-- a fresh Supabase branch — so the app's enqueue path
-- (supabase.schema('pgmq_public').rpc('send_batch', ...) in
-- lib/services/bulk-extraction.ts) breaks on every new preview branch.
--
-- This migration codifies that setup. The function bodies mirror exactly what
-- Supabase's "Expose Queues" action generates. `pgmq_public` must also be
-- listed in config.toml [api].schemas for PostgREST to expose it.

create schema if not exists pgmq_public;

grant usage on schema pgmq_public to anon, authenticated, service_role;

create or replace function pgmq_public.send(queue_name text, message jsonb, sleep_seconds integer default 0)
 returns setof bigint
 language plpgsql
 set search_path to ''
as $function$ begin return query select * from pgmq.send( queue_name := queue_name, msg := message, delay := sleep_seconds ); end; $function$;

create or replace function pgmq_public.send_batch(queue_name text, messages jsonb[], sleep_seconds integer default 0)
 returns setof bigint
 language plpgsql
 set search_path to ''
as $function$ begin return query select * from pgmq.send_batch( queue_name := queue_name, msgs := messages, delay := sleep_seconds ); end; $function$;

create or replace function pgmq_public.read(queue_name text, sleep_seconds integer, n integer)
 returns setof pgmq.message_record
 language plpgsql
 set search_path to ''
as $function$ begin return query select * from pgmq.read( queue_name := queue_name, vt := sleep_seconds, qty := n , conditional := '{}'::jsonb ); end; $function$;

create or replace function pgmq_public.pop(queue_name text)
 returns setof pgmq.message_record
 language plpgsql
 set search_path to ''
as $function$ begin return query select * from pgmq.pop( queue_name := queue_name ); end; $function$;

create or replace function pgmq_public.archive(queue_name text, message_id bigint)
 returns boolean
 language plpgsql
 set search_path to ''
as $function$ begin return pgmq.archive( queue_name := queue_name, msg_id := message_id ); end; $function$;

create or replace function pgmq_public.delete(queue_name text, message_id bigint)
 returns boolean
 language plpgsql
 set search_path to ''
as $function$ begin return pgmq.delete( queue_name := queue_name, msg_id := message_id ); end; $function$;

grant execute on all functions in schema pgmq_public to anon, authenticated, service_role;
