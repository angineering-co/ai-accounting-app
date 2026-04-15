-- Leads table for /apply page form submissions.
-- Uses JSONB `data` column for flexible schema (form fields change often).
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  lead_code text unique not null,
  path text not null check (path in ('registration', 'bookkeeping')),
  data jsonb not null default '{}',
  status text not null default 'new' check (status in ('new', 'contacted', 'converted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index on status for filtering in admin views
create index if not exists idx_leads_status on leads (status);

-- Index on created_at for chronological listing
create index if not exists idx_leads_created_at on leads (created_at desc);

-- RLS: no public access (admin client bypasses RLS)
alter table leads enable row level security;
