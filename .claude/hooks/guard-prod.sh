#!/usr/bin/env bash
#
# guard-prod.sh — PreToolUse(Bash) guardrail for the SnapBooks staging workflow.
#
# Hard-blocks the two things we must never do by accident:
#   1. Push or commit to the `main` branch (always go through a PR).
#   2. Write to a REMOTE Supabase database that is NOT staging — i.e. prod or any
#      ambiguous target — via db push, db pull, remote db reset, link, branches,
#      migration up.
#
# Staging is allowed automatically: any remote command whose text references the
# staging project ref (STAGING_REF below) is permitted with no flag, so pushing
# a migration to staging during PR review just works. Local development is never
# blocked: `supabase start/stop/status`, a local `migration up` / `db reset`,
# `db diff`, `gen types --local`, etc.
#
# Escape hatch for a DELIBERATE, reviewed PROD (or other non-staging) write —
# prefix the command:  ALLOW_PROD=1 <command>
# Setting it is a conscious "yes, I verified this is prod and I mean it" step.
#
# Protocol: read tool call JSON on stdin; exit 2 + message on stderr to block.

# Staging Supabase project ref — PUBLIC (it appears in the anon SUPABASE_URL),
# safe to commit. Used only to recognize staging-targeted commands as allowed.
STAGING_REF="ffyrocdufpxubvjlewze"

set -uo pipefail

input="$(cat)"

# --- pull the command string out of the tool input (jq, then python fallback) ---
cmd=""
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
fi
if [ -z "$cmd" ]; then
  cmd="$(printf '%s' "$input" | python3 -c 'import sys,json;
try:
    print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except Exception:
    print("")' 2>/dev/null)"
fi
[ -z "$cmd" ] && exit 0

deny() {
  printf '%s\n' "$1" >&2
  exit 2
}

# --- escape hatch for PROD: env var, or inline `ALLOW_PROD=1 <cmd>` prefix ---
allow_prod=0
if [ "${ALLOW_PROD:-}" = "1" ] || printf '%s' "$cmd" | grep -Eq 'ALLOW_PROD=1'; then
  allow_prod=1
fi

# ====================== Supabase: protect non-staging remotes ======================
if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])supabase(@[^[:space:]]+)?([[:space:]]|$)'; then
  # help/version output executes nothing against any DB — never guard it
  printf '%s' "$cmd" | grep -Eq '\-\-help\b|\-\-version\b' && exit 0
  remote_op=0
  # write/mutating subcommands that hit a remote project
  printf '%s' "$cmd" | grep -Eq '\bdb[[:space:]]+push\b|\bdb[[:space:]]+pull\b|\blink\b' && remote_op=1
  # branch mutations are guarded; read-only `branches get`/`list` are NOT
  printf '%s' "$cmd" | grep -Eq '\bbranches[[:space:]]+(create|delete|disable|update)\b' && remote_op=1
  # `db reset` and `migration up` default to LOCAL; only remote when pointed at one
  if printf '%s' "$cmd" | grep -Eq '\bdb[[:space:]]+reset\b|\bmigration[[:space:]]+up\b' && printf '%s' "$cmd" | grep -Eq '\-\-linked|\-\-db-url|\-\-project-ref'; then
    remote_op=1
  fi

  if [ "$remote_op" = 1 ]; then
    # Staging is allowed when the command references the staging ref directly,
    # or uses the designated STAGING_DB_URL var (defined as staging in .env.local
    # — lets us push without putting the DB password in the command text).
    if printf '%s' "$cmd" | grep -qF "$STAGING_REF" || printf '%s' "$cmd" | grep -q 'STAGING_DB_URL'; then
      :  # explicitly targets the staging project — allowed
    elif [ "$allow_prod" != 1 ]; then
      deny "BLOCKED: this Supabase command writes to a remote DB that is NOT staging
(it doesn't reference the staging ref $STAGING_REF) — likely prod or an
ambiguous/linked target.

What to do instead:
  • Test schema/migration changes LOCALLY first:
      supabase migration up    (applies pending migrations, keeps local data)
      supabase start / status
  • To push to STAGING, use its connection string from .env.local — referencing
    the STAGING_DB_URL var keeps the password out of the command:
      supabase db push --db-url \"\$STAGING_DB_URL\"
  • A real PROD write is a separate, reviewed step. Only if you have verified
    the target is prod and you mean it:  ALLOW_PROD=1 <the same command>
See supabase/STAGING.md."
    fi
  fi
fi

# =========================== Git: protect the main branch ===========================
if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])git([[:space:]])'; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

  # committing while sitting on main
  if printf '%s' "$cmd" | grep -Eq '\bgit[[:space:]]+commit\b' && [ "$branch" = "main" ]; then
    deny "BLOCKED: you are on the 'main' branch — don't commit here.

Create a feature branch first, then commit:
  git switch -c <short-name>     (e.g. fix-invoice-total)
  git commit -m \"...\"
Then push the branch and open a PR. Nothing reaches main without review."
  fi

  # any push that would land on main (bare push on main, origin main, HEAD:main, :main)
  if printf '%s' "$cmd" | grep -Eq '\bgit[[:space:]]+push\b'; then
    if [ "$branch" = "main" ] || printf '%s' "$cmd" | grep -Eq '(:|[[:space:]])main([[:space:]]|$)|HEAD:main\b'; then
      deny "BLOCKED: this would push to 'main'. main is updated only by merging a PR.

Push your feature branch and open a PR instead:
  git push -u origin <your-branch>
  gh pr create --fill
Vercel will build a preview from the PR (wired to the staging DB)."
    fi
  fi
fi

exit 0
