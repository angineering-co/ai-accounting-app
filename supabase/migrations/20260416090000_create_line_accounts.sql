-- LINE account associations for leads and clients.
-- A row tracks a LINE user (or a pending binding code awaiting a LINE user).
-- line_user_id is nullable: null only for pending binding code rows.

create table if not exists line_accounts (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique,
  lead_id uuid references leads(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  display_name text,
  binding_code text,
  binding_code_created_at timestamptz,
  binding_confirmed boolean not null default false,
  followed_at timestamptz not null default now(),
  linked_at timestamptz
);

create index idx_line_accounts_client_id on line_accounts (client_id) where client_id is not null;

create index idx_line_accounts_lead_id on line_accounts (lead_id) where lead_id is not null;

create unique index idx_line_accounts_binding_code on line_accounts (binding_code) where binding_code is not null;

alter table line_accounts enable row level security;
