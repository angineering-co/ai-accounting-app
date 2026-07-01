-- todos: lightweight follow-up tasks shown on the firm dashboard. Each task
-- targets a LINE account (line_account_id); if that LINE account is bound to a
-- client we display the client name for context, but the client is never a
-- separate target. status ('open' / 'done') and the required line_account_id
-- are validated in the app layer (Zod, lib/domain/models.ts) rather than via DB
-- CHECK / NOT NULL constraints, per the project's app-validation preference.

CREATE TABLE todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    line_account_id UUID REFERENCES line_accounts(id) ON DELETE CASCADE,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'open',
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX todos_firm_id_status_idx ON todos(firm_id, status);
CREATE INDEX todos_line_account_id_idx ON todos(line_account_id) WHERE line_account_id IS NOT NULL;

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage todos in their firm" ON todos
    FOR ALL
    USING (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
    WITH CHECK (
        firm_id = public.get_auth_user_firm_id()
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );
