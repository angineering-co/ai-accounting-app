-- Add client portal support:
-- - profiles.client_id linkage
-- - client role support in profiles.role check
-- - client-scoped RLS for tenant tables

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON public.profiles(client_id);

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('admin', 'staff', 'super_admin', 'client'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, firm_id, client_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'name',
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'admin'),
    (NEW.raw_user_meta_data ->> 'firm_id')::uuid,
    (NEW.raw_user_meta_data ->> 'client_id')::uuid
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_auth_user_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS "Users can view profiles in their firm" ON public.profiles;
CREATE POLICY "Users can view profiles in their firm" ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (
      firm_id = public.get_auth_user_firm_id()
      AND public.get_auth_user_client_id() IS NULL
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  );

DROP POLICY IF EXISTS "Users can manage clients in their firm" ON public.clients;
CREATE POLICY "Users can manage clients in their firm" ON public.clients
  FOR ALL
  USING (
    (
      firm_id = public.get_auth_user_firm_id()
      AND (
        public.get_auth_user_client_id() IS NULL
        OR id = public.get_auth_user_client_id()
      )
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  )
  WITH CHECK (
    (
      firm_id = public.get_auth_user_firm_id()
      AND (
        public.get_auth_user_client_id() IS NULL
        OR id = public.get_auth_user_client_id()
      )
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  );

DROP POLICY IF EXISTS "Users can manage invoices in their firm" ON public.invoices;
CREATE POLICY "Users can manage invoices in their firm" ON public.invoices
  FOR ALL
  USING (
    (
      firm_id = public.get_auth_user_firm_id()
      AND (
        public.get_auth_user_client_id() IS NULL
        OR client_id = public.get_auth_user_client_id()
      )
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  )
  WITH CHECK (
    (
      firm_id = public.get_auth_user_firm_id()
      AND (
        public.get_auth_user_client_id() IS NULL
        OR client_id = public.get_auth_user_client_id()
      )
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  );

DROP POLICY IF EXISTS "Users can manage allowances in their firm" ON public.allowances;
CREATE POLICY "Users can manage allowances in their firm" ON public.allowances
  FOR ALL
  USING (
    (
      firm_id = public.get_auth_user_firm_id()
      AND (
        public.get_auth_user_client_id() IS NULL
        OR client_id = public.get_auth_user_client_id()
      )
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  )
  WITH CHECK (
    (
      firm_id = public.get_auth_user_firm_id()
      AND (
        public.get_auth_user_client_id() IS NULL
        OR client_id = public.get_auth_user_client_id()
      )
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  );

DROP POLICY IF EXISTS "Users can manage invoice ranges in their firm" ON public.invoice_ranges;
CREATE POLICY "Users can manage invoice ranges in their firm" ON public.invoice_ranges
  FOR ALL
  USING (
    (
      firm_id = public.get_auth_user_firm_id()
      AND (
        public.get_auth_user_client_id() IS NULL
        OR client_id = public.get_auth_user_client_id()
      )
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  )
  WITH CHECK (
    (
      firm_id = public.get_auth_user_firm_id()
      AND (
        public.get_auth_user_client_id() IS NULL
        OR client_id = public.get_auth_user_client_id()
      )
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  );

DROP POLICY IF EXISTS "Users can manage tax filing periods in their firm" ON public.tax_filing_periods;
CREATE POLICY "Users can manage tax filing periods in their firm" ON public.tax_filing_periods
  FOR ALL
  USING (
    (
      firm_id = public.get_auth_user_firm_id()
      AND (
        public.get_auth_user_client_id() IS NULL
        OR client_id = public.get_auth_user_client_id()
      )
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  )
  WITH CHECK (
    (
      firm_id = public.get_auth_user_firm_id()
      AND (
        public.get_auth_user_client_id() IS NULL
        OR client_id = public.get_auth_user_client_id()
      )
    )
    OR (auth.jwt() ->> 'role' = 'super_admin')
  );
