#!/usr/bin/env bash
#
# Configure the cron -> Edge Function extraction pipeline for a Supabase
# environment (an ephemeral preview branch, a persistent branch, or prod).
#
# WHY THIS EXISTS
# ---------------
# The `process-extraction-jobs` pg_cron job calls the extraction-worker Edge
# Function via pg_net, reading the target URL + auth from two Vault secrets:
#   - project_url       e.g. https://<ref>.supabase.co
#   - service_role_key  the environment's service role key
# Migration 20260311090000 seeds these with LOCAL values (http://kong:8000 +
# the demo key), which is correct for local dev but wrong on every hosted
# branch. Supabase exposes no way for SQL to learn its own branch URL/keys, and
# ephemeral branches get a fresh ref per PR, so these two values must be set
# per environment after the branch exists. This script does exactly that.
#
# GEMINI_API_KEY is handled separately (config.toml [edge_runtime.secrets] +
# dotenvx) and does NOT need this script. See supabase/PREVIEW_BRANCHING.md.
#
# USAGE
# -----
#   PROJECT_URL=https://<ref>.supabase.co \
#   SERVICE_ROLE_KEY=<service_role_key> \
#   DB_URL=postgresql://postgres:<pwd>@<host>:5432/postgres \
#   ./scripts/configure-supabase-branch.sh
#
# Get DB_URL / SERVICE_ROLE_KEY for a branch from the Supabase dashboard or:
#   supabase branches get <branch-name> -o env
#   supabase projects api-keys --project-ref <ref>
#
# Idempotent: safe to re-run.

set -euo pipefail

: "${PROJECT_URL:?Set PROJECT_URL, e.g. https://<ref>.supabase.co}"
: "${SERVICE_ROLE_KEY:?Set SERVICE_ROLE_KEY (the environment's service role key)}"
: "${DB_URL:?Set DB_URL (a postgres connection string for the target branch DB)}"

if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql not found on PATH" >&2
  exit 1
fi

echo "Configuring extraction-pipeline Vault secrets for: ${PROJECT_URL}"

# delete-then-create keeps this idempotent (vault.secrets.name is unique).
psql "${DB_URL}" -v ON_ERROR_STOP=1 \
  -v url="${PROJECT_URL}" -v key="${SERVICE_ROLE_KEY}" <<'SQL'
delete from vault.secrets where name in ('project_url', 'service_role_key');
select vault.create_secret(:'url', 'project_url');
select vault.create_secret(:'key', 'service_role_key');
SQL

echo "Done. The process-extraction-jobs cron job will now POST to:"
echo "  ${PROJECT_URL}/functions/v1/extraction-worker"
