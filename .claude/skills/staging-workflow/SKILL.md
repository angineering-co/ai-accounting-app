---
name: staging-workflow
description: Safely test and ship changes to the SnapBooks codebase — for changes that touch the app/UI, database migrations, or both. Use whenever someone wants to try out a change, test it, push it, open a PR, run a migration, or check it on staging / a preview deployment. Walks through branch → local test → PR → Vercel preview (wired to the staging Supabase DB), and keeps changes off main and off the production database. Especially for non-developer contributors who want to be comfortable making and verifying changes.
---

# Staging workflow — test changes safely

This skill is for contributors (including non-developers, e.g. an accountant
partner) who want to make a change and **see it working** without risking the
live product. Your job is to make that comfortable and safe.

**Speak Traditional Chinese (繁體中文)** with the person, in plain language —
assume they are not a developer. Explain *why* a step matters, not just the
command. Avoid jargon where a plain phrase works. Run the git/Supabase/npm
commands for them rather than asking them to type commands.

## The two rules we never break

1. **Never put code on `main` without a PR.** Always work on a feature branch
   and open a pull request. main only changes by merging a reviewed PR.
2. **Never write to the production database.** Pushing schema to **staging** is
   fine and expected (see Workflow B); prod is off-limits from this workflow.

These are also enforced by a guard hook (`.claude/hooks/guard-prod.sh`), so a
dangerous command will be blocked with an explanation. The hook is a safety net,
not a substitute — follow the workflow below and you won't hit it.

## What's safe vs. what's guarded

- **Always safe (local):** `npm run dev`, `npm run lint`, `npm test`,
  `supabase start` / `stop` / `status`, **local** `supabase migration up`,
  `supabase db diff`, `supabase gen types --local`. Local lives in Docker on
  this machine.
- **Allowed — staging:** any Supabase command that targets the **staging** project
  (its ref `ffyrocdufpxubvjlewze`, or the `$STAGING_DB_URL` connection from
  `.env.local`). Pushing a migration to staging needs no special flag.
- **Guarded (blocked):** remote Supabase writes that are **not** staging —
  `db push` / `link` / `db pull` / `branches` / remote `migration up` / `db reset`
  pointed at prod or an ambiguous `--linked` target; plus `git push` /
  `git commit` to `main`. A genuine prod write requires `ALLOW_PROD=1` (confirm
  with Ang first).

## Workflow A — app / UI change (no database change)

This is the common case. The Vercel + GitHub integration does the heavy lifting:
every PR gets a **preview deployment**, already wired to the **staging** Supabase
database, so the change can be clicked through with real-ish data.

1. **Start a feature branch** (never work on main):
   `git checkout -b <short-name>` (e.g. `fix-invoice-total`).
2. **Make the change**, then check it locally if useful: `npm run dev`
   (localhost:3000), `npm run lint`.
3. **Commit** with a clear message describing the change.
4. **Push the branch and open a PR:**
   `git push -u origin <branch>` then `gh pr create --fill`.
5. **Wait for the Vercel preview**, then give them the URL to click through:
   `gh pr view --json statusCheckRollup` / `gh pr checks` surface the preview
   link, or it's posted as a comment on the PR. The preview talks to staging, so
   logins and data work like the real app.
6. They review on the preview; iterate by pushing more commits to the same
   branch (the preview redeploys automatically). Merge only when happy.

## Workflow B — database / migration change

Prove the migration **locally** first, then push it to **staging** so the change
can be tried together in the PR's preview deployment. (This intentionally lets
staging run a not-yet-merged migration during review — see the caution in step 5.)

1. **Feature branch** as above.
2. **Write the migration** as a new timestamped `.sql` file in
   `supabase/migrations/`. Author the SQL yourself; don't blindly regenerate
   types.
3. **Apply it locally** with `supabase migration up` — it applies only the new,
   pending migration and **keeps your local data**. Prefer this over
   `supabase db reset`, which wipes the local DB.
   - **Regenerate types:** run `npm run db:gen-types` so both the Drizzle and
     Supabase types reflect the new schema (it does drizzle-kit pull + supabase
     gen types in one step). Do this whenever the migration changed the schema.
   - Then `npm run dev` and exercise the feature.
   - For local pieces Supabase owns (the queue's `pgmq_public` wrappers), see
     `supabase/STAGING.md` — those come from a Studio button, not a migration.
4. **Open the PR** as in Workflow A, noting it contains a migration.
5. **Push the migration to staging so you can both test it in the preview.**
   Use the staging connection string from `.env.local` — referencing the
   `$STAGING_DB_URL` var (not the literal URL) keeps the DB password out of the
   command. The guard recognizes this as staging and allows it with no flag:

   ```bash
   supabase db push --db-url "$STAGING_DB_URL"
   ```

   If `$STAGING_DB_URL` isn't set in `.env.local`, fetch it yourself — this needs
   `supabase login` and access to the **prod** project that owns the branch
   (`<prod-ref>` is the ref in prod's `NEXT_PUBLIC_SUPABASE_URL`). Two fix-ups are
   required on the fetched value, both handled by the command below:
   `branches get -o env` wraps the URL in **double quotes** (strip them, or
   `$STAGING_DB_URL` expands with literal quotes and the connection fails), and it
   returns the **transaction** pooler (port `6543`). A migration needs **session
   mode**, so rewrite the port to `5432` on the same pooler host:

   ```bash
   supabase branches get staging -o env --project-ref <prod-ref> \
     | grep '^POSTGRES_URL=' \
     | sed -E 's/^POSTGRES_URL="?//; s/"$//' \
     | sed 's/:6543/:5432/' \
     | sed 's#^#STAGING_DB_URL=#' >> .env.local
   ```

   `branches get` is read-only so the guard allows it, and prod's own URL is
   intentionally not retrievable this way. (No prod access? Ask Ang for the
   value.) The value written above is already unquoted and in session mode, so
   `supabase db push --db-url "$STAGING_DB_URL"` works directly. If you got the
   string another way and `db push` complains about pooler / transaction mode,
   apply the same two fix-ups: drop surrounding quotes and use the **session**
   pooler port `5432` (not `6543`). Once it succeeds, the PR's preview deployment —
   already wired to staging — reflects the new schema and you can both click
   through it.

   ⚠️ Caution: staging now runs a migration that isn't in `main` yet. If you
   **edit the migration `.sql` during review**, `supabase db push` won't re-apply
   an already-applied version — coordinate with Ang (re-test locally, then have
   him reset/re-push staging) rather than hand-editing the live DB. Keep staging
   and the PR in sync; once the PR merges, staging matches `main` again.

## Production

Production database changes are **out of scope** for this workflow — a separate,
reviewed, maintainer-driven step. The guard blocks any remote DB write that
isn't staging; a genuine prod write needs `ALLOW_PROD=1`. If a task seems to
require touching prod, **stop and confirm with Ang** rather than overriding it.

## If the guard hook blocks something

Read its message — it names the safe alternative. For staging, target it
explicitly via `$STAGING_DB_URL` (or the staging ref) and it goes through. Don't
reflexively re-run with `ALLOW_PROD=1` — that's only for a prod write you've
verified and discussed with Ang. When unsure, explain the situation to the
person and ask before overriding.
