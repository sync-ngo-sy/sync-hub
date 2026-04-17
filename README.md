# CV Intelligence Platform

Offline-first CV search, ranking, and candidate analysis for recruiter workflows.

## What this repo contains

- `cvs/`: sample CV files for local development and pipeline validation.
- `supabase/`: online backend layer for auth, Postgres, `pgvector`, RLS, and retrieval APIs.
- `worker/`: offline ingestion and AI processing on a laptop or dedicated operator machine.
- `frontend/`: static React frontend for search, dossiers, comparison, intelligence, analytics, and admin operations.

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
2. Put source CVs into `cvs/` or point the worker at another folder.
3. Apply the canonical Supabase migration in `supabase/migrations/20260417140000_init.sql`.
4. Deploy the three Edge Functions in `supabase/functions/`.
5. Run the worker from `worker/`.
6. Build the static frontend from `frontend/`.
7. For local auth testing, apply `supabase/migrations/20260417163000_bootstrap_tenant_v1.sql` after the canonical init migration.

### Worker commands

```bash
python3 -m unittest discover -s worker/tests -t worker
PYTHONPATH=worker/src python3 -m cv_intelligence_worker discover ./cvs --tenant-id <tenant-id>
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest ./cvs --tenant-id <tenant-id> --no-sync
PYTHONPATH=worker/src python3 -m cv_intelligence_worker compare --tenant-id <tenant-id> --candidate-id <id-1> --candidate-id <id-2> --no-sync
```

### Local Ollama demo profile

For a fully local demo, use Ollama for CV extraction, chunk embeddings, backend intent extraction, and grounded `/ask` synthesis.

Worker-side example:

```bash
CV_MODEL_BASE_URL=http://127.0.0.1:11434
CV_EXTRACTION_PROVIDER=ollama
CV_EXTRACTION_MODEL=qwen2.5:3b
CV_EMBEDDING_PROVIDER=ollama
CV_EMBEDDING_MODEL=nomic-embed-text
CV_EMBEDDING_VERSION=ollama-nomic-embed-text-v1
```

Supabase Edge Function example:

```bash
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_EMBEDDING_VERSION=ollama-nomic-embed-text-v1
```

### Frontend commands

```bash
cd frontend
npm install
npm run dev
npm run build
```

### Local live testing

Use these browser-safe values when pointing the frontend at a local Supabase stack:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key>
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
