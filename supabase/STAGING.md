# Staging environment — setup & operation

We run **one persistent Supabase branch** named `staging` as a shared, long-lived
testing environment: a fixed URL, seeded firm + users, accumulating data, and a
working AI extraction pipeline (pgmq queue → pg_cron → `extraction-worker` Edge
Function → Gemini). **All PR preview deployments point at this one branch** via
Vercel's Preview-scope env vars.

Tradeoff we accepted: a shared DB means staging carries one schema for everyone.
We keep it sane by having **staging track `main`** — pure app/UI PRs test against
staging seamlessly; schema changes are tested locally before merge and pushed to
staging only after merge (see "Operating").

Principle: **codify what we own, click what Supabase owns.** Supabase-generated
SQL (the queue wrapper functions) is *not* put in migrations — that's a snapshot
that drifts from the live Supabase version. It comes from the dashboard button.

## Reproduces automatically (in code)

- **Queue + extensions + cron** — `migrations/20260311090000_create_extraction_queue.sql`.
- **Edge Function** — `functions/extraction-worker/` deploys via `supabase functions deploy`.
- **`auto_expose_new_tables = true`** (`config.toml [api]`) — keeps local/CI table grants working after CLI v2.106.0 changed the default. Deprecated (removal 2026-10-30); durable fix is explicit `GRANT`s in migrations.
- **Queue exposure (`pgmq_public`)** is NOT in code — see the button step below. It's deliberately *not* listed in `config.toml [api].schemas`, because `supabase start` fails to load PostgREST's schema cache if a listed schema doesn't exist (and the wrappers are created by the button, not a migration).

## One-time setup

Enable Branching on the project, then create the persistent branch and note its
ref / URL / keys:

```bash
supabase --experimental branches create staging --persistent --project-ref <prod-ref>
supabase --experimental branches list                 # read the BRANCH PROJECT ID (= staging ref)
supabase --experimental branches get staging -o env   # DB URL etc. (verify which fields it returns)
```

Turn **off** per-PR auto-branching in the Supabase GitHub integration so PRs
don't spawn their own ephemeral branches (we want them all on `staging`).

### 1. Deploy schema + function to staging

```bash
supabase link --project-ref <staging-ref>
supabase db push                                       # all migrations
supabase functions deploy extraction-worker --project-ref <staging-ref>
```

### 2. GEMINI_API_KEY

```bash
supabase secrets set GEMINI_API_KEY=<key> --project-ref <staging-ref>
```

(`config.toml [edge_runtime.secrets]` covers this for **local** dev, reading
`env(GEMINI_API_KEY)` from your environment.)

### 3. Expose the queue — click the button once

Staging dashboard → **Integrations → Queues → "Expose Queues via PostgREST"**.
This generates the `pgmq_public` wrappers (`send_batch`, `read`, …) the enqueue
path and worker call. Also confirm `pgmq_public` under Settings → API → Exposed
schemas.

> For fresh **local** dev (`supabase start` / `db reset`), do the same in local
> Studio (localhost:54323) — we intentionally don't ship a migration for these.

### 4. Point the cron at staging's own function

The `process-extraction-jobs` cron reads its target URL + auth from two Vault
secrets that migration `20260311090000` seeds with *local* values — wrong on a
hosted branch. Reset them to staging's values. Easiest: staging dashboard → SQL
Editor, paste and run (substitute the two values):

```sql
begin;
delete from vault.secrets where name in ('project_url', 'service_role_key');
select vault.create_secret('https://<staging-ref>.supabase.co', 'project_url');
select vault.create_secret('<staging-service-role-key>', 'service_role_key');
commit;
```

(`scripts/configure-staging.sh` does the same over `psql` if you have a working
direct DB connection — note the direct endpoint is IPv6-only, so the SQL editor
is usually less hassle.)

### 5. Seed once

Staging dashboard → SQL Editor → paste the full contents of `supabase/seed.sql`
→ Run. Creates 速博記帳事務所, the admin + client logins, and 速博智慧有限公司.
Idempotent (`on conflict do nothing`), and we never re-seed, so accumulated data
is preserved.

(If you have `psql` on a reachable DB connection: `psql
"<staging-db-connection-string>" -f supabase/seed.sql`. The direct DB host is
IPv6-only; use the **Session pooler** connection string for IPv4.)

### 6. Wire Vercel + Auth

- In Vercel, set the **Preview** environment variables to staging's values:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
  `POSTGRES_URL` (the server-side direct DB connection — previews fail without
  it). This is what makes every PR preview talk to staging. Keep the
  Supabase–Vercel integration only for Production vars.
- Add the Vercel preview domain(s) to staging's **Auth → URL Configuration**
  redirect allowlist so logins work from previews.

## Operating

**Convention: staging tracks `main`.** Push migrations to staging **only after a
PR merges to `main`**, so staging's schema always equals `main` and is never left
holding a half-applied, not-yet-merged migration from one in-flight PR. The
upside is staging stays coherent for everyone; the cost is you **can't test a
schema change on staging before merge — do that locally** (`supabase db reset` /
`supabase start`) or on a throwaway DB. This makes "should I push this migration
now?" a non-question: only after merge.

```bash
# After merging to main: apply new migrations to staging
git checkout main && git pull
supabase db push --db-url "<staging-db-connection-string>"

# Redeploy the worker if functions/extraction-worker changed
supabase functions deploy extraction-worker --project-ref <staging-ref>
```

> ⚠️ **Push to the right environment — never production by accident.**
> `supabase db push` targets whatever project is currently **linked**, so a
> stray `supabase link --project-ref <prod-ref>` earlier can silently send your
> push to prod. Protect against it:
> - Prefer the explicit **`--db-url "<staging-db-connection-string>"`** form
>   above (no reliance on ambient link state) — and double-check the host/ref in
>   that URL is **staging**, not prod, before hitting enter.
> - If you do use `--linked`, run `supabase projects list` first and confirm the
>   `●` linked project is staging.
> - Treat production migrations as a separate, deliberate, reviewed step — not
>   something you fire from a staging workflow.

- **Verify extraction:** upload an invoice → status should go `uploaded → processing → processed`. If it stalls at `uploaded`, check: queue exposed (step 3), `GEMINI_API_KEY` set (step 2), and `select name from vault.decrypted_secrets;` shows the right `project_url` / `service_role_key` (step 4).
