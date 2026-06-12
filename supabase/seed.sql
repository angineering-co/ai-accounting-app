-- Seed data for local dev / Supabase preview (branch) environments.
-- Runs automatically on `supabase db reset` and on preview branch creation
-- (config.toml -> [db.seed] enabled = true, sql_paths = ["./seed.sql"]).
--
-- Creates:
--   - Firm:   速博記帳事務所
--   - Admin:  snapbooks.ai+admin@gmail.com / password   (role: admin, in the firm)
--   - Client: 速博智慧有限公司 (統編 60310074)
--
-- Fixed UUIDs + ON CONFLICT DO NOTHING make this idempotent and safe to re-run.
-- The profiles row for the admin is created automatically by the
-- public.handle_new_user() trigger, which reads name/role/firm_id from
-- the auth user's raw_user_meta_data.

-- ---------------------------------------------------------------------------
-- 1. Firm
-- ---------------------------------------------------------------------------
insert into public.firms (id, name, tax_id)
values (
  'a0000000-0000-4000-8000-000000000001',
  '速博記帳事務所',
  '24681012'  -- placeholder 統一編號 for the firm (not provided)
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Client (belongs to the firm)
-- ---------------------------------------------------------------------------
insert into public.clients (id, firm_id, name, tax_id, tax_payer_id)
values (
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  '速博智慧有限公司',
  '60310074',
  '603100740'  -- placeholder 稅籍編號 (9 digits, not provided)
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Admin auth user  ->  trigger creates the matching profile
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  'd0000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'snapbooks.ai+admin@gmail.com',
  crypt('password', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  jsonb_build_object(
    'name', '管理員',
    'role', 'admin',
    'firm_id', 'a0000000-0000-4000-8000-000000000001'
  ),
  false,
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

-- Email identity so password login works.
insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  gen_random_uuid(),
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'sub', 'd0000000-0000-4000-8000-000000000001',
    'email', 'snapbooks.ai+admin@gmail.com',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Client portal user  ->  trigger creates the profile (role=client)
--    Scoped to the firm AND the specific client via raw_user_meta_data.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  'd0000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'snapbooks.ai+client@gmail.com',
  crypt('password', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  jsonb_build_object(
    'name', '速博智慧有限公司',
    'role', 'client',
    'firm_id', 'a0000000-0000-4000-8000-000000000001',
    'client_id', 'c0000000-0000-4000-8000-000000000001'
  ),
  false,
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  gen_random_uuid(),
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'sub', 'd0000000-0000-4000-8000-000000000002',
    'email', 'snapbooks.ai+client@gmail.com',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;
