-- Tighten journal_entries / journal_entry_lines RLS from firm-scoped to
-- firm + client scoped, matching the clause already used on clients / invoices /
-- allowances (see 20260302090000_add_client_portal.sql).
--
-- WHY: the original policies only checked `firm_id = get_auth_user_firm_id()`, so a
-- client-role (portal) user — whose profile.firm_id covers the whole firm — could
-- read EVERY client's general ledger in that firm, not just their own. Today the app
-- compensates with `assertClientAccess` in lib/services/voucher.ts, but that is
-- app-code-only and does not protect future PostgREST reads. With the financial
-- statements about to be shown to clients in the portal, the GL tables must isolate
-- clients at the database boundary.
--
-- `get_auth_user_client_id()` returns the profile's client_id for portal users and
-- NULL for firm staff, so the new clause leaves firm staff (and super_admin)
-- unrestricted while pinning portal users to their own client. Entry generation runs
-- through Drizzle (which bypasses RLS), so the WITH CHECK change does not affect the
-- write path.
--
-- NOTE: the Drizzle SUM aggregates behind the income statement / balance sheet /
-- ledger bypass RLS entirely; they remain gated by `assertClientAccess` in the
-- service layer. This migration secures the PostgREST read paths (e.g.
-- getVoucherDetail) and any future direct reads of these tables.

DROP POLICY IF EXISTS "Users can manage journal_entries in their firm" ON public.journal_entries;
CREATE POLICY "Users can manage journal_entries in their firm" ON public.journal_entries
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

DROP POLICY IF EXISTS "Users can manage journal_entry_lines via parent entry" ON public.journal_entry_lines;
CREATE POLICY "Users can manage journal_entry_lines via parent entry" ON public.journal_entry_lines
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.journal_entries e
            WHERE e.id = journal_entry_lines.journal_entry_id
              AND (
                  (
                      e.firm_id = public.get_auth_user_firm_id()
                      AND (
                          public.get_auth_user_client_id() IS NULL
                          OR e.client_id = public.get_auth_user_client_id()
                      )
                  )
                  OR (auth.jwt() ->> 'role' = 'super_admin')
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.journal_entries e
            WHERE e.id = journal_entry_lines.journal_entry_id
              AND (
                  (
                      e.firm_id = public.get_auth_user_firm_id()
                      AND (
                          public.get_auth_user_client_id() IS NULL
                          OR e.client_id = public.get_auth_user_client_id()
                      )
                  )
                  OR (auth.jwt() ->> 'role' = 'super_admin')
              )
        )
    );
