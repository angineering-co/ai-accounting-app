# Supabase preview branches — setup

How the AI extraction pipeline (pgmq queue → pg_cron → `extraction-worker`
Edge Function → Gemini) is made to work on Supabase branches, and the few
values you must supply per environment.

## What reproduces automatically (in code)

Created by migrations / config on every branch — nothing to do:

- **Queue + extensions + cron job** — `migrations/20260311090000_create_extraction_queue.sql` (pgmq, pg_net, pg_cron, the `extraction_jobs` queue, the `process-extraction-jobs` cron).
- **`pgmq_public` PostgREST wrappers** — `migrations/20260612000000_expose_pgmq_public.sql` codifies what the dashboard "Expose Queues" toggle used to create by hand, so `supabase.schema('pgmq_public')` works on a fresh branch. Also listed in `config.toml [api].schemas`.
- **Edge Function deploy** — Supabase deploys `functions/extraction-worker/` to each branch automatically.
- **`auto_expose_new_tables = true`** (`config.toml [api]`) — restores pre-CLI-v2.106.0 behavior of granting `anon`/`authenticated`/`service_role` on migration tables. Deprecated (removal 2026-10-30); the durable replacement is explicit `GRANT`s in migrations.

## What you must supply per environment

### 1. `GEMINI_API_KEY` (constant across all branches) — via dotenvx

`config.toml [edge_runtime.secrets]` reads `env(GEMINI_API_KEY)`. Supply it with
dotenvx so every branch's function gets it with no dashboard step:

```bash
npm i -D @dotenvx/dotenvx

# Local (plaintext, gitignored):
echo 'GEMINI_API_KEY=<your-local-key>' > supabase/.env.local

# Preview + production (committed ENCRYPTED — dotenvx writes the keypair to
# supabase/.env.keys, which stays gitignored):
npx dotenvx set GEMINI_API_KEY '<key>' -f supabase/.env.preview
npx dotenvx set GEMINI_API_KEY '<key>' -f supabase/.env.production
```

`.gitignore` must ignore `supabase/.env.keys` and `supabase/.env.local`, but
**commit** the encrypted `supabase/.env.preview` and `supabase/.env.production`.
(See the `.gitignore` block at the bottom.)

### 2. Cron → function URL + auth (unique per branch) — via the script

Each branch has its own `https://<ref>.supabase.co` URL and keys, and Supabase
gives SQL no way to learn them. So after a branch exists, point its cron job at
itself by setting two Vault secrets:

```bash
PROJECT_URL=https://<ref>.supabase.co \
SERVICE_ROLE_KEY=<service_role_key> \
DB_URL=postgresql://postgres:<pwd>@<host>:5432/postgres \
./scripts/configure-supabase-branch.sh
```

Get the values from the dashboard or `supabase branches get <name> -o env` /
`supabase projects api-keys --project-ref <ref>`.

> **Ephemeral (per-PR) branches:** this is the one unavoidable per-branch step.
> Until it runs, the cron harmlessly POSTs to the local `kong:8000` default and
> the worker stays idle. To make even ephemeral branches fully hands-off, run
> the script from the branch-creation GitHub Action (it has the Supabase access
> token to fetch branch creds via the Management API). Recommended once the
> manual flow is verified.

## `.gitignore` additions for dotenvx

```gitignore
# dotenvx: ignore the decryption keys and local plaintext, commit encrypted envs
supabase/.env.keys
supabase/.env.local
!supabase/.env.preview
!supabase/.env.production
```
