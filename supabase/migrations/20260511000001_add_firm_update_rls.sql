-- Allow firm members (and super_admins) to UPDATE their own firm row.
-- The init migration only granted SELECT; without this, server actions like
-- updateFirmSettings silently no-op for authenticated users (RLS returns 0
-- affected rows, no error).
CREATE POLICY "Users can update their own firm" ON public.firms
    FOR UPDATE
    USING (
        id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
    WITH CHECK (
        id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );
