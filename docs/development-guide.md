# Sync Hub Development Guide

### Open-source CV intelligence for talent discovery

Sync Hub is a privacy-conscious platform developed by
[SYNC NGO](https://sync.ngo/) for searching, ranking, and analyzing
candidate profiles.

It combines offline CV processing with tenant-isolated search,
candidate comparison, and recruitment intelligence tools.

## What this repo contains

- `cvs/`: sample CV files for local development and pipeline validation.
- `workspaces/`: git-safe tenant folder skeletons; real CV files placed here stay ignored.
- `supabase/`: online backend layer for auth, Postgres, `pgvector`, RLS, and retrieval APIs.
- `worker/`: offline ingestion and AI processing on a laptop or dedicated operator machine.
- `frontend/`: static React frontend for search, dossiers, comparison, intelligence, analytics, and admin operations.

## Contributor resources

- [Contributing guide](CONTRIBUTING.md): setup, quality gates, PR expectations, and coding standards.
- [Code of conduct](CODE_OF_CONDUCT.md): collaboration expectations and reporting process.
- [Security policy](SECURITY.md): vulnerability reporting and secure development rules.
- [Clean code guidelines](docs/clean-code-guidelines.md): module boundaries and refactoring expectations.
- [Development workflow](docs/development-workflow.md): branch, PR, protection, and dependency update conventions.
- [Release process](docs/release-process.md): deploy order, smoke tests, and rollback guidance.
- [cPanel deployment checklist](CPANEL_DEPLOYMENT_CHECKLIST.md): shared-hosting frontend upload and GitHub Actions FTPS deploy.
- [Data retention](docs/data-retention.md): privacy rules for CVs, caches, and generated artifacts.

## Architecture

The system is intentionally split into two planes:

1. Offline processing
   - Parse CVs locally.
   - Extract structured candidate data.
   - Normalize skills and role signals.
   - Chunk documents semantically.
   - Generate embeddings and grounded summaries.
   - Sync the derived artifacts into Supabase.

2. Online retrieval
   - Frontend stays static on shared hosting.
   - Supabase handles auth, storage, RLS, search data, and read APIs.
   - Search and compare are deterministic and retrieval-first.
   - Live LLM assistance is optional for intent extraction and grounded answer synthesis.
   - Core retrieval and ranking still work without a live model.
   - Local demos can use Ollama for both backend reasoning and query embeddings.

## Product guarantees

- Tenant-scoped data isolation with `tenant_id` and RLS.
- Chunk-level hybrid search, not whole-CV blob search.
- Precomputed candidate dossiers and comparison artifacts.
- Versioned outputs so search results and summaries remain explainable.
- Offline worker owns parsing, embeddings, and reasoning.

## Expected data flow

`CV files -> parse -> extract JSON -> normalize -> chunk -> embed -> summarize -> sync -> search -> rank -> analyze`

## Setup

Recommended local setup:

1. Create a `.env` file from `.env.example`.
2. Put source CVs into `workspaces/<tenant-slug>/` or point the worker at another folder.
3. Apply the canonical Supabase migration in `supabase/migrations/20260417140000_init.sql`.
4. Deploy the three Edge Functions in `supabase/functions/`.
5. Run the worker from `worker/`.
6. Build the static frontend from `frontend/`.
7. For local auth testing, apply `supabase/migrations/20260417163000_bootstrap_tenant_v1.sql` after the canonical init migration.

## Local infrastructure

The current local development environment uses a mix of Docker containers and local processes.

See also:

- [infra/README.md](infra/README.md)

### Docker-backed infrastructure

Supabase local development is running through Docker containers. In practice, this gives you:

- `Postgres` database
- `Kong` API gateway
- `Auth` (`gotrue`)
- `PostgREST`
- `Storage API`
- `Realtime`
- `Studio`
- `Analytics / Logflare`
- `Mailpit`
- `pgvector` support in the database layer

Important local ports:

- `http://127.0.0.1:54321` -> Supabase API gateway
- `postgresql://postgres:postgres@127.0.0.1:54322/postgres` -> local Postgres
- `http://127.0.0.1:54323` -> Supabase Studio
- `http://127.0.0.1:54324` -> Mailpit

This is the core local backend infrastructure for the project.

### Local non-Docker processes

In addition to the Dockerized Supabase stack, local development currently uses:

- `supabase functions serve --no-verify-jwt`
  - runs the Edge Functions locally for endpoints like:
    - `/search`
    - `/search-debug`
    - `/compare`
    - `/ask`
    - `/agent`
- `ollama serve`
  - provides local LLM and embedding endpoints during local AI testing
- `python -m uvicorn cv_intelligence_worker.realtime_extractor:app --host 127.0.0.1 --port 8000`
  - runs the packaged CV extraction API after installing `worker/`
- `npm run dev --host 0.0.0.0 --port 5175`
  - runs the frontend dev server

### Practical local architecture

So the local stack is effectively:

1. Dockerized Supabase services for data/auth/storage/API plumbing
2. Local Edge Function runtime for TypeScript serverless endpoints
3. Local Ollama runtime for optional extraction, embeddings, and local AI demos
4. Local Vite dev server for the frontend

### Useful local inspection commands

```bash
docker ps
supabase status
supabase functions serve --no-verify-jwt
ollama serve
python -m uvicorn cv_intelligence_worker.realtime_extractor:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/health
cd frontend && npm run dev --host 0.0.0.0 --port 5175
```

### Worker commands

```bash
python -m pytest worker/tests
PYTHONPATH=worker/src python3 -m cv_intelligence_worker discover ./workspaces/<tenant-slug> --tenant-id <tenant-id>
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest ./workspaces/<tenant-slug> --tenant-id <tenant-id> --no-sync
PYTHONPATH=worker/src python3 -m cv_intelligence_worker compare --tenant-id <tenant-id> --candidate-id <id-1> --candidate-id <id-2> --no-sync
PYTHONPATH=worker/src python3 -m cv_intelligence_worker public-applications --limit 25
```

Current worker behavior:

- The worker reads from local files/directories for manual ingestion, and can drain queued public application CV uploads from Supabase Storage with `public-applications`.
- It accepts any file/folder path passed to `discover` or `ingest`.
- If you pass a directory, it recursively scans supported files under that directory.
- There is no hard per-run CV limit today. One run processes every supported file discovered under the provided inputs.
- Public application CV uploads are queued by the `public-jobs` Edge Function. The worker is not a daemon by default; run `public-applications` manually or schedule it with your process manager.
- Public application parsing uses the same model configuration as normal CV ingestion. Set `GEMINI_API_KEY` or the `CV_MODEL_*` variables before draining the queue; otherwise queued applications fail closed.
- `CV_INGEST_CONCURRENCY` controls how many CVs are parsed, extracted, and embedded in parallel.
- `CV_BATCH_SIZE` controls how many completed bundles are flushed to Supabase at a time; it is not a run cap.
- `CV_SUPABASE_BATCH_SIZE` controls the maximum row count per Supabase upsert request.

### Tenant admin utility

Use the repo utility below to list workspaces or create a new workspace owner account plus tenant.

```bash
python3 scripts/tenant_admin.py list-tenants
python3 scripts/tenant_admin.py ensure-workspace-folders
python3 scripts/tenant_admin.py create-tenant-account \
  --email owner@example.com \
  --password 'ChangeMe123!' \
  --tenant-name 'Acme Recruiting' \
  --tenant-icon 'https://cdn.example.com/acme.png' \
  --create-folders
python3 scripts/tenant_admin.py bulk-create-from-csv tenants.csv
python3 scripts/tenant_admin.py bulk-add-users-to-tenant-from-csv users.csv \
  --tenant-slug acme-recruiting
```

Requirements:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The create command prints:

- tenant id
- tenant slug
- tenant icon
- recommended folder name
- local workspace folder path when `--create-folders` is used
- recommended Google Drive folder path

Workspace-root options:

- `--workspace-root-path ./workspaces`
  - local repo-safe folder root
- `--drive-sync-path "/path/to/Google Drive"`
  - optional local Google Drive Desktop root; folders are created under `<drive-sync-path>/<drive-root>/<tenant-slug>`

Examples:

```bash
python3 scripts/tenant_admin.py ensure-workspace-folders
python3 scripts/tenant_admin.py ensure-workspace-folders \
  --drive-sync-path "/Users/you/Library/CloudStorage/GoogleDrive-company"
python3 scripts/tenant_admin.py sync-workspaces-to-drive \
  --drive-sync-path "/Users/you/Library/CloudStorage/GoogleDrive-company" \
  --tenant-slug demo \
  --dry-run
python3 scripts/tenant_admin.py create-tenant-account \
  --email owner@example.com \
  --password 'ChangeMe123!' \
  --tenant-name 'Acme Recruiting' \
  --tenant-icon 'https://cdn.example.com/acme.png' \
  --create-folders \
  --drive-sync-path "/Users/you/Library/CloudStorage/GoogleDrive-company"
```

CSV import format:

```csv
email,password,tenant_name,tenant_icon
owner1@example.com,ChangeMe123!,Acme Recruiting,https://cdn.example.com/acme.png
owner2@example.com,ChangeMe123!,Beta Talent,
```

Optional CSV columns also supported:

- `tenant_slug`
- `full_name`
- `role`

For multiple people in one existing company, use the dedicated membership import:

```csv
email,password,full_name,role
alice@acme.com,ChangeMe123!,Alice Founder,owner
bob@acme.com,ChangeMe123!,Bob Manager,admin
charlie@acme.com,ChangeMe123!,Charlie Recruiter,recruiter
```

Run it against a hosted Supabase project:

```bash
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
python3 scripts/tenant_admin.py bulk-add-users-to-tenant-from-csv users.csv \
  --tenant-slug acme-recruiting
```

Use `bulk-create-from-csv` only when each CSV row should create a new tenant.

### Google Drive synced-folder ingestion

The worker does not yet call the Google Drive API directly. The recommended near-term pattern is:

1. Create a shared Drive root such as `CV Intelligence`
2. Create one folder per workspace using the tenant slug
3. Sync that folder locally with Google Drive Desktop
4. Point the worker at the synced local path

Recommended folder convention:

```text
CV Intelligence/<tenant-slug>/
```

Example:

```text
CV Intelligence/acme-recruiting/
```

Then ingest it locally from either:

- `workspaces/acme-recruiting/`
- or the synced Google Drive folder

Examples:

```bash
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest \
  "./workspaces/acme-recruiting" \
  --tenant-id <tenant-id>
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest \
  "/path/to/Google Drive/CV Intelligence/acme-recruiting" \
  --tenant-id <tenant-id>
```

If you want to copy the local tenant workspace folders into the synced Google Drive root instead of creating them manually, use:

```bash
python3 scripts/tenant_admin.py sync-workspaces-to-drive \
  --drive-sync-path "/Users/you/Library/CloudStorage/GoogleDrive-company" \
  --tenant-slug demo \
  --dry-run
python3 scripts/tenant_admin.py sync-workspaces-to-drive \
  --drive-sync-path "/Users/you/Library/CloudStorage/GoogleDrive-company" \
  --tenant-slug demo
```

Notes:

- `--dry-run` previews the copy plan without writing files
- `--delete` makes the Drive destination mirror the local workspace folder exactly
- omitting `--tenant-slug` syncs **all** tenant workspace folders

Sync all tenants example:

```bash
python3 scripts/tenant_admin.py \
  --drive-sync-path "/Users/example/Library/CloudStorage/GoogleDrive-user@example.com/My Drive/cv-intelligence" \
  sync-workspaces-to-drive
```

This creates or updates folders like:

```text
/Users/example/Library/CloudStorage/GoogleDrive-user@example.com/My Drive/cv-intelligence/CV Intelligence/demo
/Users/example/Library/CloudStorage/GoogleDrive-user@example.com/My Drive/cv-intelligence/CV Intelligence/beta
```

### Seeding a workspace from the sample `cvs/` folder

The repo keeps a small local sample corpus in `./cvs` for testing. If you want to seed the `demo` workspace folder with those same files, copy them into `workspaces/demo/`:

```bash
cp -f ./cvs/*.pdf ./workspaces/demo/
```

Then ingest the seeded workspace folder into the local `demo` tenant:

```bash
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest \
  "./workspaces/demo" \
  --tenant-id <tenant-id>
```

The copied PDFs under `workspaces/demo/` are ignored by git.

For a large hosted demo sync, prefer the LLM-only Gemini worker profile, keep original-file storage disabled unless you explicitly need it, and raise concurrency to match the quota you are comfortable spending:

```bash
set -a
source .env.local
set +a
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest ./workspaces/demo \
  --tenant-id "$CV_WORKER_TENANT_ID" \
  --concurrency 16 \
  --sync-batch-size 32 \
  --supabase-row-batch-size 50
```

The worker refuses to extract without `CV_EXTRACTION_MODEL`. Supabase capacity warnings are emitted on stderr and in the final JSON payload when usage approaches `CV_SUPABASE_LIMIT_WARNING_THRESHOLD` of the configured database or storage limit. The capacity RPC is created by `supabase/migrations/20260503010000_ingestion_capacity_snapshot_v1.sql`; without it, the worker falls back to table counts and warns that exact byte usage is unavailable.

### Default Gemini worker profile

The default worker profile now targets Gemini Flash extraction plus Gemini 768-dimension embeddings. Set a Gemini API key in your shell and the worker will use these defaults automatically.

Worker-side example:

```bash
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
CV_MODEL_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
CV_EXTRACTION_PROVIDER=openai-compatible
CV_EXTRACTION_MODEL=gemini-2.5-flash
CV_EMBEDDING_PROVIDER=openai
CV_EMBEDDING_MODEL=gemini-embedding-001
CV_EMBEDDING_DIMENSION=768
CV_EMBEDDING_VERSION=gemini-embedding-001-768-v1
CV_INGEST_CONCURRENCY=8
CV_SUPABASE_BATCH_SIZE=50
CV_SUPABASE_LIMIT_WARNING_THRESHOLD=0.85
CV_SYNC_ORIGINALS_TO_STORAGE=false
CV_PUBLIC_SOURCE_URI=https://drive.google.com/drive/folders/YOUR_DRIVE_FOLDER_ID
CV_DEDUPE_SOURCE_DOCUMENTS=true
CV_WORKER_CACHE_DIR=./tmp/cv_intelligence_worker
CV_DELETE_SYNCED_BUNDLES=true
```

Supabase Edge Function example:

```bash
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen3:30b-a3b
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_EMBEDDING_VERSION=ollama-nomic-embed-text-v1
```

Ollama is still supported if you explicitly set the worker env vars back to an Ollama model profile.

### Frontend commands

```bash
cd frontend
npm install
npm run lint
npm run test
npm run dev
npm run build
```

### Repository quality checks

```bash
node scripts/check-repo-format.mjs
node scripts/check-supabase-migrations.mjs
python -m ruff check worker/src worker/tests scripts
python -m pytest worker/tests
```

### Local live testing

Use these browser-safe values when pointing the frontend at a local Supabase stack:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key>
VITE_API_BASE_URL=/functions/v1
VITE_ENABLE_LOCAL_SUPABASE_PROXY=true
```

For a fully local job-board smoke test, run the database reset and functions runtime first:

```bash
supabase start
supabase db reset
supabase functions serve
cd frontend && VITE_ENABLE_LOCAL_SUPABASE_PROXY=true npm run dev -- --host 127.0.0.1 --port 5175
```

`supabase/seed.sql` inserts a local public job and one sample application. The frontend calls local Supabase REST RPCs for `/careers`, with the local `public-jobs` Edge Function kept as a fallback; it should not need the mock job fixtures when the Supabase env vars are present.

Run the public job RPC regression smoke test after `supabase db reset`:

```bash
node scripts/check-public-jobs-rpc.mjs
```

Run the upload queue smoke test while `supabase functions serve` is running:

```bash
node scripts/check-public-jobs-upload.mjs
```

What the frontend now expects in live mode:

- Sign in or create a local auth user through Supabase Auth.
- If the user has no tenant memberships yet, the app calls `bootstrap_tenant_v1` to create the first workspace and owner membership.
- After that, search, compare, ask, and dossier reads use the signed-in Supabase session instead of mock data.

### Supabase contents

- `supabase/migrations/20260417140000_init.sql`: canonical schema, RLS, search RPC, dossier view, and evidence RPC.
- `supabase/migrations/20260417163000_bootstrap_tenant_v1.sql`: self-service tenant bootstrap RPC for local and self-serve onboarding.
- `supabase/functions/search`: `/search`
- `supabase/functions/compare`: `/compare`
- `supabase/functions/ask`: `/ask`
- `supabase/functions/_shared/llm.ts`: optional OpenAI/Gemini structured-output adapter for backend intent extraction and grounded answer synthesis
- `supabase/functions/_shared/queryEmbedding.ts`: backend query embedding helper with Ollama or deterministic fallback
- `frontend/`: shared-hosting-friendly static app with mock fallback, Supabase Auth session handling, and live adapters for search, compare, ask, and dossier reads

## Operational flow

### Ingestion

- A source document is registered with a stable document hash.
- The worker parses text and extracts structured candidate fields.
- Skills, titles, and seniority are normalized deterministically.
- The document is chunked by section and embedded.
- Candidate summaries and comparison artifacts are persisted for the frontend.

### Search

- The frontend sends a natural language query plus filters.
- Supabase optionally uses an online LLM to extract structured intent from the natural language query.
- Supabase applies tenant-scoped filtering and hybrid retrieval.
- Ranking fuses lexical and vector signals over chunks.
- The response includes candidate scores, evidence, and version metadata.

### Candidate dossier

- A dossier is served from stored structured data and precomputed artifacts.
- The UI can render profile, timeline, skills, summary, and evidence without live reasoning.

## Environment variables

See [`.env.example`](.env.example) for the expected variables.

## Notes

- Do not place the Supabase service role key in frontend code.
- Do not place the Supabase service role key on a laptop worker in production.
- Do not require live inference to render core screens.
- If you enable backend LLMs, use them for intent extraction and grounded synthesis only, not for primary candidate ranking.
- Keep AI-generated outputs grounded in stored evidence.
- Keep `supabase/migrations/20260417140000_init.sql` as the source of truth for the online schema.
