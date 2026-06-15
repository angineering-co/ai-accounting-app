# Per-PR ephemeral Supabase branches — an alternative we evaluated

> This is a **design note**, not the current setup. Today we run one persistent
> `staging` branch (see [`STAGING.md`](./STAGING.md)). This file records what it
> would take to instead use the Supabase GitHub integration's **per-PR ephemeral
> branches**, so the tradeoff is captured if we revisit it.

## What it is

With per-PR auto-branching enabled in the Supabase↔GitHub integration, every PR
spawns its **own** Supabase branch on open and tears it down on close/merge. The
opposite of the persistent model, where all PRs share one long-lived `staging`.

## The core shift: config-as-code

This is the thing to internalize before comparing steps.

- The **persistent** model deliberately **ignores `config.toml`** on the remote.
  We only `db push` migrations; auth, secrets, vault, and queue exposure are all
  done by hand per `STAGING.md`.
- The **ephemeral** model is the **opposite**: `config.toml` *is* the deployment
  source. On each branch's creation it applies `config.toml`, runs migrations,
  runs `seed.sql`, and deploys `supabase/functions/`. On merge to `main`, that
  same `config.toml` can also sync to **production**.

That inversion is why most of what's manual in `STAGING.md` becomes automatic or
codifiable here — and it's also the main new risk (prod config now flows through
the file).

## What becomes automatic (free per PR)

| Component | How it's handled |
|---|---|
| Schema | Migrations run automatically on branch create |
| Seed (firm / admin / client) | `seed.sql` auto-loads on branch create — already wired |
| Edge Function | `functions/extraction-worker` auto-deploys |
| `config.toml` settings | `[api].schemas`, `auto_expose_new_tables`, `[edge_runtime]` applied to the branch |
| Vercel env injection | Native integration injects `NEXT_PUBLIC_SUPABASE_URL`, the publishable key, **and `POSTGRES_URL`** + DB vars — so the `POSTGRES_URL` gap we hit on staging is auto-solved here |
| Auth redirect URLs | **If** the allowlist is moved into `config.toml [auth].additional_redirect_urls` + `site_url`, it propagates to every branch automatically |

A pure app/UI PR is then **zero-touch**: open PR → seeded branch + wired preview,
log in, click around.

## What stays manual per branch — only if that PR needs the extraction pipeline

These are **conditional**: skip them on PRs that don't touch extraction.

1. **Expose Queues button** (`pgmq_public` wrappers) — dashboard click, per
   branch. Not codifiable, same reason as the persistent model: it's
   Supabase-generated SQL, and listing `pgmq_public` in `config.toml [api].schemas`
   breaks `supabase start` (PostgREST can't load a schema-cache for a schema that
   doesn't exist yet).
2. **Cron vault secrets** (`project_url`, `service_role_key`) — **the irreducible
   one.** Each branch has its own ref / URL / service-role key; migration
   `20260311090000` seeds *local* values; and SQL can't discover its own URL. So
   for every branch you want extraction on, re-run the vault SQL with *that
   branch's* values (the same SQL as `STAGING.md` step 4). On staging this is a
   one-time cost; here it's per branch.
3. **`GEMINI_API_KEY`** — must exist as a branch/preview edge secret. *Verify*
   whether Supabase lets you set one preview-wide secret shared by all branches;
   if not, it's per branch.

The only **irreducible** per-PR friction is therefore the extraction pipeline's
self-referential URL/key (#2) plus the queue button (#1). Everything else
automates.

## Changes to this repo to adopt the ephemeral route

- **Turn ON** per-PR auto-branching in the Supabase↔GitHub integration (the
  opposite of `STAGING.md`'s "turn off" step).
- **Move the Auth redirect allowlist** from `STAGING.md` prose into
  `config.toml [auth].additional_redirect_urls` + `site_url` so branches inherit
  it automatically. The existing prod wildcard patterns already cover the PR
  preview domains.
- **Keep `pgmq_public` OUT of `config.toml`** — the schema-cache / CI gotcha is
  unchanged, so the queue button stays a manual per-branch step.
- Keep `seed.sql` and `[edge_runtime.secrets]` as they are.
- **Accept that `config.toml` now governs production** auth/config on merge to
  `main`. The `auto_expose_new_tables` and `pgmq_public` issues we hit were
  config-as-code paper cuts; under this model the same file drives prod, so its
  blast radius is larger.

## Tradeoffs vs the persistent `staging` branch

**Ephemeral wins**
- Near-zero setup for app/UI PRs.
- Native Vercel wiring, including `POSTGRES_URL`.
- Per-PR isolation — you can test a migration *before* merge (the thing the
  persistent "staging tracks main" rule gives up).
- More of the setup is codified.
- Cheaper *if* PRs are closed promptly (branches billed only while open).

**Ephemeral loses**
- No data accumulation — every branch resets to `seed.sql`.
- The extraction pipeline needs the manual steps above **every branch** you test
  it on.
- Cost scales with open/forgotten PRs; a stale open PR keeps a branch (≈ a small
  project) running.
- `config.toml` now drives production — bigger blast radius for config mistakes.

## Decision guidance

It comes down to two questions:

1. **Do you test the extraction pipeline on most PRs?**
2. **Do you need accumulated test data?**

If **no** to both, the ephemeral route is genuinely lighter than the persistent
branch and worth adopting. If **yes** to either — which was the original reason
we chose persistent — the shared `staging` branch still wins.
