-- audit_trails: cross-table audit log. before JSONB is must-fill for 'updated' /
-- 'deleted' actions (those are the only times the prior state isn't recoverable
-- from the live row); 'posted' / 'reversed' / 'created' leave it NULL. reason is
-- must-fill for 'updated' (posted-entry edit) and 'reversed' actions in v1.
-- after-state is derivable: audit_(N+1).before, or the live row for the latest
-- audit — see `getStateAfter` helper in lib/services/audit-trail.ts.

CREATE TABLE audit_trails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    entity_table TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'posted', 'reversed')),
    before JSONB NULL,
    reason TEXT NULL,
    actor_id UUID NULL REFERENCES profiles(id),
    actor_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_trails_entity_idx ON audit_trails(entity_table, entity_id, actor_at DESC);
CREATE INDEX audit_trails_firm_actor_at_idx ON audit_trails(firm_id, actor_at DESC);
CREATE INDEX audit_trails_actor_idx ON audit_trails(actor_id, actor_at DESC) WHERE actor_id IS NOT NULL;

ALTER TABLE audit_trails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit_trails in their firm" ON audit_trails
    FOR SELECT
    USING (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );

CREATE POLICY "Users can insert audit_trails in their firm" ON audit_trails
    FOR INSERT
    WITH CHECK (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );
