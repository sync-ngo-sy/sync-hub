# Deployment Guide

This guide describes how to deploy the current **CV Intelligence Platform** in the way the codebase is designed today:

- **Frontend**: static React app on shared hosting
- **Backend**: Supabase cloud project
- **Worker**: offline Python ingestion process on a laptop, desktop, or VM
- **Optional source sync**: Google Drive Desktop synced folder

## 1. Target Deployment Model

Use this deployment shape unless you have a reason to change it:

1. Host the frontend as static files on shared hosting.
2. Use Supabase for:
   - Auth
   - Postgres
   - `pgvector`
   - Storage
   - Edge Functions
3. Run the worker separately from the website.
4. Keep CV ingestion offline-first.

This is the lowest-friction model for the current repo.

## 2. Prerequisites

Required:

- Supabase project
- Node.js `>=16.20.0`
- Python `>=3.9`
- npm

Recommended:

- Supabase CLI
- Google Drive Desktop if CVs will arrive via Drive folders

Optional model providers:

- OpenAI
- Gemini
- Ollama

## 3. Repository Components

- `frontend/`
  - Static recruiter and admin UI
- `supabase/`
  - SQL migrations
  - Edge Functions
- `worker/`
  - Offline ingestion pipeline
- `scripts/tenant_admin.py`
  - Tenant/account bootstrap utility

## 4. Supabase Setup

### 4.1 Create the project

Create one Supabase project for the environment you want to run:

- local
- staging
- production

For production, plan around a paid project if you expect a real corpus such as `6000` CVs.

### 4.2 Apply database migrations

Apply all migrations in order.

Migration inventory:

1. `20260417000100_cv_intelligence_platform.sql`
   - deprecated no-op, keep it for ordering
2. `20260417140000_init.sql`
   - canonical base schema
3. `20260417163000_bootstrap_tenant_v1.sql`
   - self-serve first-tenant bootstrap
4. `20260417173000_search_quality_v2.sql`
5. `20260417174500_search_quality_fix.sql`
6. `20260417193000_parser_profiles_v1.sql`
7. `20260418113000_platform_admins_v1.sql`
8. `20260418123000_platform_scope_search_v1.sql`
9. `20260418143000_tenant_icon_v1.sql`

If using the CLI:

```bash
supabase db push
```

If applying manually, execute the SQL files in migration order.

### 4.3 Deploy Edge Functions

Current functions:

- `search`
- `compare`
- `ask`
- `agent`

Deploy them:

```bash
supabase functions deploy search
supabase functions deploy compare
supabase functions deploy ask
supabase functions deploy agent
```

### 4.4 Set Supabase function secrets

Set only the secrets you actually use.

Base:

```bash
supabase secrets set \
  SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Optional live LLMs:

```bash
supabase secrets set \
  LLM_PROVIDER=openai \
  OPENAI_API_KEY=YOUR_OPENAI_API_KEY \
  OPENAI_MODEL=gpt-4.1-mini
```

or

```bash
supabase secrets set \
  LLM_PROVIDER=gemini \
  GEMINI_API_KEY=YOUR_GEMINI_API_KEY \
  GEMINI_MODEL_ID=gemini-3.5-flash
```

`GEMINI_MODEL_ID` is required for Gemini-backed search, ask, and agent flows. Use a currently supported model such as `gemini-3.5-flash` (Gemini 3 Flash, stable GA). Preview-only IDs like `gemini-3-flash-preview` also work but may be deprecated on short notice. If you previously set `GEMINI_MODEL` (for example to a removed preview model), unset it and set `GEMINI_MODEL_ID` instead, then redeploy edge functions.

Platform administrators can also change non-secret runtime values (model IDs, provider, timeouts) from **Admin → Runtime settings** in the web app after applying migration `20260526130000_platform_runtime_settings_v1.sql`. Database values override Supabase secrets for the same key; API keys always remain in secrets.

or Ollama-compatible:

```bash
supabase secrets set \
  LLM_PROVIDER=ollama \
  OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  OLLAMA_MODEL=qwen3:30b-a3b \
  OLLAMA_EMBEDDING_MODEL=nomic-embed-text \
  OLLAMA_EMBEDDING_VERSION=ollama-nomic-embed-text-v1
```

### 4.5 Create the storage bucket

If you want original CVs stored in Supabase Storage, create:

- bucket: `cv-originals`

If you do **not** want to keep originals in Supabase, leave bucket usage disabled operationally and only store source metadata.

## 5. Frontend Deployment

### 5.1 Configure frontend environment

The frontend only needs public-safe values.

Create environment values equivalent to:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_API_BASE_URL=https://YOUR_PROJECT.supabase.co/functions/v1
```

### 5.2 Build the frontend

```bash
cd frontend
npm install
npm run build
```

Output:

- `frontend/dist/`

### 5.3 Upload to shared hosting

Upload the contents of `frontend/dist/` to your static hosting directory.

Important:

- this app uses a **hash router**
- you do **not** need server-side SPA rewrite rules for the current routing model

### 5.4 Frontend smoke check

Verify:

- login page loads
- search page loads
- dossier page opens
- admin routes load for admins

## 6. Worker Deployment

The worker is the offline ingestion plane. It should not run inside shared hosting.

### 6.1 Configure the worker environment

Typical worker env:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ACCESS_TOKEN=YOUR_WORKER_TOKEN
SUPABASE_STORAGE_BUCKET=cv-originals

CV_SOURCE_DIR=./cvs
CV_WORKER_TENANT_ID=YOUR_TENANT_ID
CV_WORKER_UPLOADED_BY=ops@example.com

CV_MODEL_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
CV_MODEL_API_KEY=YOUR_GEMINI_API_KEY
CV_EXTRACTION_PROVIDER=openai-compatible
CV_EXTRACTION_MODEL=gemini-2.5-flash
CV_EMBEDDING_PROVIDER=openai
CV_EMBEDDING_MODEL=gemini-embedding-001
CV_EMBEDDING_DIMENSION=768
CV_EMBEDDING_VERSION=gemini-embedding-001-768-v1
CV_WORKER_CACHE_DIR=./tmp/cv_intelligence_worker
CV_DELETE_SYNCED_BUNDLES=true
CV_ALLOW_HEURISTIC_FALLBACK=false
```

If you do not yet have a worker access token, you can use a service role key temporarily for local/admin environments, but avoid that on laptops in production.

### 6.2 Worker commands

Discovery:

```bash
PYTHONPATH=worker/src python3 -m cv_intelligence_worker discover ./cvs --tenant-id <tenant-id>
```

Ingest:

```bash
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest ./cvs --tenant-id <tenant-id>
```

Compare artifact:

```bash
PYTHONPATH=worker/src python3 -m cv_intelligence_worker compare \
  --tenant-id <tenant-id> \
  --candidate-id <candidate-1> \
  --candidate-id <candidate-2>
```

### 6.3 Current worker behavior

Today, the worker:

- reads **local files/folders only**
- recursively scans supported files from the path you provide
- supports:
  - `.pdf`
  - `.docx`
  - `.txt`
- has **no hard per-run document limit**

Important nuance:

- `CV_BATCH_SIZE` exists in config
- the current ingestion loop still processes discovered documents sequentially
- it is **not** a hard run cap

## 7. Google Drive Source Strategy

The worker does **not** currently ingest from the Google Drive API directly.

The recommended deployment pattern is:

1. Create a Drive root folder
2. Create one tenant folder per workspace
3. Sync the Drive locally with Google Drive Desktop
4. Point the worker at the synced local tenant folder

Recommended folder convention:

```text
CV Intelligence/<tenant-slug>/
```

Example:

```text
CV Intelligence/acme-recruiting/
```

Example worker command:

```bash
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest \
  "/Users/you/Library/CloudStorage/GoogleDrive-you@example.com/My Drive/CV Intelligence/acme-recruiting" \
  --tenant-id <tenant-id>
```

This is the cleanest first deployment because it uses the current worker exactly as written.

## 8. Tenant and Account Bootstrap

### 8.1 Self-serve first tenant

The frontend can bootstrap the first tenant for a signed-in user through:

- `bootstrap_tenant_v1`

That is good for a single manual workspace setup.

### 8.2 Admin utility

For operations/admin setup, use:

- [scripts/tenant_admin.py](./scripts/tenant_admin.py)

It supports:

- `list-tenants`
- `create-tenant-account`
- `bulk-create-from-csv`
- `bulk-add-users-to-tenant-from-csv`

### 8.3 List tenants

```bash
python3 scripts/tenant_admin.py list-tenants
```

### 8.4 Create one tenant + owner account

```bash
python3 scripts/tenant_admin.py create-tenant-account \
  --email owner@example.com \
  --password 'ChangeMe123!' \
  --tenant-name 'Acme Recruiting' \
  --tenant-icon 'https://cdn.example.com/acme.png'
```

The script prints:

- user id
- tenant id
- tenant slug
- folder name
- recommended Google Drive folder path

### 8.5 Bulk create from CSV

CSV format:

```csv
email,password,tenant_name,tenant_icon
owner1@example.com,ChangeMe123!,Acme Recruiting,https://cdn.example.com/acme.png
owner2@example.com,ChangeMe123!,Beta Talent,
```

Optional extra columns:

- `tenant_slug`
- `full_name`
- `role`

Run it:

```bash
python3 scripts/tenant_admin.py bulk-create-from-csv tenants.csv
```

This creates:

- auth user
- tenant
- owner membership

### 8.6 Bulk add users to one existing tenant

CSV format:

```csv
email,password,full_name,role
alice@acme.com,ChangeMe123!,Alice Founder,owner
bob@acme.com,ChangeMe123!,Bob Manager,admin
charlie@acme.com,ChangeMe123!,Charlie Recruiter,recruiter
```

Run it against your hosted Supabase project:

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY \
python3 scripts/tenant_admin.py bulk-add-users-to-tenant-from-csv users.csv \
  --tenant-slug acme-recruiting
```

This creates:

- auth user
- tenant membership

## 9. Platform Admin Bootstrap

To grant platform-wide admin access:

1. Ensure `20260418113000_platform_admins_v1.sql` is applied
2. Insert the user into `public.platform_admins`

Example:

```sql
insert into public.platform_admins (user_id, note)
select id, 'Initial platform admin'
from auth.users
where email = 'admin@example.com'
on conflict (user_id) do nothing;
```

## 10. Recommended Production Sequence

Use this order:

1. Create Supabase project
2. Apply migrations
3. Deploy Edge Functions
4. Set function secrets
5. Create storage bucket if required
6. Build and upload frontend
7. Create initial platform admin
8. Create tenant accounts
9. Create tenant Drive folders
10. Run worker ingestion for each tenant
11. Verify search, dossier, compare, and admin screens

## 11. Validation Checklist

### Platform

- Supabase Auth login works
- frontend can sign in using anon key
- `search`, `compare`, `ask`, and `agent` functions respond

### Tenant bootstrap

- owner account can log in
- workspace exists
- tenant folder slug is known

### Ingestion

- worker discovers expected CV files
- worker ingests without sync failures
- candidate rows are created
- chunk rows are created
- search returns results

### Admin

- platform admin can access:
  - `/admin`
  - `/admin/parsing`
  - `/admin/parsing/lab`

## 12. Security Notes

- Never put the service role key in the frontend.
- Prefer worker/device tokens over service role keys on laptops.
- Keep LLM usage restricted to:
  - intent extraction
  - grounded synthesis
- Keep primary retrieval and ranking deterministic.
- Store originals in Supabase Storage only if you actually need in-product original-file access.

## 13. Operational Notes

- Current chat history is not persisted server-side.
- Current worker is local-folder based.
- Google Drive support is currently by synced local folder, not Drive API ingestion.
- The canonical schema starts at `20260417140000_init.sql`.
- `20260417000100_cv_intelligence_platform.sql` is a deprecated no-op and should remain in migration order.

## 14. Suggested Next Improvements

If you want to productionize further, next best items are:

1. direct Google Drive API connector
2. persistent chat threads
3. worker queue / experiment execution from admin UI
4. worker device registration and token issuance flow
5. deployment automation for migrations + functions + frontend build
