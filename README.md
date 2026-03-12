# SnapBooks.ai (記帳事務所)

AI-powered accounting SaaS for Taiwan-based accounting firms. Firms manage clients; clients upload invoices (統一發票) and allowances (折讓證明單) which are processed by the Gemini AI API to extract structured data for tax filing.

## Prerequisites

- **Node.js** 18+ with npm
- **Docker** (for local Supabase)
- **Supabase CLI** (installed automatically via `npx supabase@latest`)

## Local Development Setup

### 1. Install dependencies

```bash
git clone <repo-url> && cd ai-accounting-app
npm install
```

### 2. Start Supabase

```bash
npm run supabase:start
```

This starts PostgreSQL, Auth, Storage, Studio, and Edge Runtime in Docker. Once ready, it prints your local API keys — you'll need these for the next step.

- **Studio**: http://localhost:54323
- **API**: http://localhost:54321

### 3. Create `.env.local`

Copy `.env.example` and fill in the values printed by `supabase start`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT from supabase start>
GEMINI_API_KEY=<your Google Gemini API key>
```

### 4. Enable the message queue (one-time setup)

The bulk AI extraction feature uses pgmq. After Supabase starts, you must expose the queue API:

1. Open **Supabase Studio** → http://localhost:54323
2. Go to **Integrations** → **Queues**
3. Click **"Expose Queues via PostgREST"**
4. Restart Supabase:
   ```bash
   npm run supabase:stop && npm run supabase:start
   ```

> **Note**: `config.toml` already includes `pgmq_public` in the schemas list. You only need to do the Studio toggle + restart. This step is required after every `supabase db reset` since it recreates the database from scratch.

### 5. Serve the Edge Function (for bulk AI extraction)

Create the Edge Function env file and start serving:

```bash
echo "GEMINI_API_KEY=<your key>" > supabase/functions/.env
npx supabase functions serve extraction-worker --env-file supabase/functions/.env
```

The pg_cron job (configured in migrations) triggers this function every 10 seconds to process queued extraction jobs.

### 6. Start the dev server

```bash
npm run dev
```

App runs at http://localhost:3000.

## Environment Variables Reference

| Variable | Used by | Required | Description |
|----------|---------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Next.js | Yes | Supabase publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Next.js (server) | Yes | Service role key for admin operations |
| `GEMINI_API_KEY` | Next.js + Edge Fn | Yes | Google Gemini 2.5 Flash API key |
| `DATABASE_URL` | Tests | For tests | PostgreSQL connection string |
| `NEXT_PUBLIC_EARLY_ADOPTER_FORM_URL` | Next.js (client) | No | Google Forms URL for early adopter signup |
| `RESEND_API_KEY` | Next.js (server) | No | Resend email API key |

## Vault Secrets

The migration `20260311090000_create_extraction_queue.sql` seeds two Vault secrets used by pg_cron to trigger the Edge Function:

| Secret name | Local default | Description |
|-------------|--------------|-------------|
| `project_url` | `http://kong:8000` | Internal Docker URL for the Supabase API gateway |
| `service_role_key` | Standard demo JWT | Service role JWT for authenticating the Edge Function call |

These work out of the box for local development. For production, update them in the **Supabase Dashboard** → **Settings** → **Vault** with your real project URL and service role key.

## Production Deployment

### Vercel (Next.js)

Set these environment variables in **Vercel** → **Project Settings** → **Environment Variables**:

- `NEXT_PUBLIC_SUPABASE_URL` — your hosted Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — your publishable key
- `SUPABASE_SERVICE_ROLE_KEY` — your service role key
- `GEMINI_API_KEY` — your Gemini API key

### Supabase (Hosted)

1. **Push migrations**: `npx supabase db push`
2. **Enable queues**: Dashboard → **Integrations** → **Queues** → **Expose Queues via PostgREST**
3. **Update Vault secrets**: Dashboard → **SQL Editor**, run:
   ```sql
   SELECT vault.update_secret(
     (SELECT id FROM vault.secrets WHERE name = 'project_url'),
     'https://<your-project-ref>.supabase.co'
   );
   SELECT vault.update_secret(
     (SELECT id FROM vault.secrets WHERE name = 'service_role_key'),
     '<your real service role key>'
   );
   ```
4. **Deploy Edge Function**:
   ```bash
   npx supabase functions deploy extraction-worker
   npx supabase secrets set GEMINI_API_KEY=<your key>
   ```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (localhost:3000) |
| `npm run build` | Production build |
| `npm run lint` | TypeScript type-check + ESLint |
| `npm run type-check` | TypeScript check only |
| `npm test` | Run tests in watch mode (Vitest) |
| `npm run test:run` | Run tests once (CI mode) |
| `npm run supabase:start` | Start local Supabase (Docker) |
| `npm run supabase:stop` | Stop local Supabase |
| `npm run supabase:status` | Check Supabase status |

Run a single test file:

```bash
npx vitest run lib/domain/roc-period.test.ts
```

## Architecture Overview

```
Next.js App Router (app/)
├── (landing)/          Public marketing pages
├── auth/               Auth flows (login, sign-up, etc.)
├── dashboard/          Post-login redirect / firm selection
└── firm/[firmId]/      Main app shell
    ├── client/[clientId]/period/[periodYYYMM]/  Tax filing period
    ├── dashboard/      Firm dashboard
    └── invoice/        Firm-level invoice management

lib/
├── domain/             Zod schemas, types, ROC period utilities
├── services/           Server Actions — Gemini AI, CRUD, reports
├── supabase/           Client factories (server, client, admin)
└── utils.ts            Shared helpers

supabase/
├── functions/extraction-worker/   Edge Function (Deno) — bulk AI extraction
├── migrations/                    Database migrations
└── config.toml                    Local Supabase configuration
```

**Data flow**: Firm → Clients → Tax Filing Periods → Invoices/Allowances → AI Extraction (Gemini) → Reports (TET_U format)

**AI extraction flow**: Upload → pgmq queue → Edge Function (pg_cron triggered) → Gemini 2.5 Flash → extracted_data JSONB → staff review → confirmed

See `CLAUDE.md` for detailed architecture documentation.
