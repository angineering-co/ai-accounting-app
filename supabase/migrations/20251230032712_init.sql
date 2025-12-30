-- 1. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create 'firms' table
CREATE TABLE firms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tax_id TEXT NOT NULL, -- 統一編號
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create 'profiles' table (linked to auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    firm_id UUID REFERENCES firms(id),
    name TEXT,
    role TEXT CHECK (role IN ('admin', 'staff', 'super_admin')) DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create 'clients' table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT, -- 負責人姓名
    tax_id TEXT NOT NULL, -- 統一編號
    tax_payer_id TEXT NOT NULL, -- 稅籍編號
    industry TEXT, -- 產業描述
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Helper function to get the current user's firm_id without recursion
CREATE OR REPLACE FUNCTION public.get_auth_user_firm_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT firm_id FROM public.profiles WHERE id = auth.uid();
$$;

-- RLS Policies for 'firms'
CREATE POLICY "Users can view their own firm" ON firms
    FOR SELECT
    USING (
        id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );

-- 6. RLS Policies for 'profiles'
CREATE POLICY "Users can view profiles in their firm" ON profiles
    FOR SELECT
    USING (
        id = auth.uid()
        OR firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE
    USING (id = auth.uid());

-- 7. RLS Policies for 'clients'
CREATE POLICY "Users can manage clients in their firm" ON clients
    FOR ALL
    USING (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );

-- Note: For initial signup flow 'INSERT' on 'firms', you may need a specialized 
-- trigger or service role access since a user won't have a profile yet.