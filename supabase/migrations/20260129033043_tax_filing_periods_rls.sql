-- 1. Enable RLS
ALTER TABLE public.tax_filing_periods ENABLE ROW LEVEL SECURITY;

-- 2. Create Management Policy
-- This uses your existing public.get_auth_user_firm_id() helper function
CREATE POLICY "Users can manage tax filing periods in their firm" ON public.tax_filing_periods
    FOR ALL
    USING (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
    WITH CHECK (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );