# CV Intelligence Platform

Offline-first CV search, ranking, and candidate analysis for recruiter workflows.

## What this repo contains

- `cvs/`: sample CV files for local development and pipeline validation.
- `supabase/`: online backend layer for auth, Postgres, `pgvector`, RLS, and retrieval APIs.
- `worker/`: offline ingestion and AI processing on a laptop or dedicated operator machine.

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
   - No live LLM generation is required to serve the product.

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

### Worker commands

```bash
python3 -m unittest discover -s worker/tests -t worker
PYTHONPATH=worker/src python3 -m cv_intelligence_worker discover ./cvs --tenant-id <tenant-id>
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest ./cvs --tenant-id <tenant-id> --no-sync
PYTHONPATH=worker/src python3 -m cv_intelligence_worker compare --tenant-id <tenant-id> --candidate-id <id-1> --candidate-id <id-2> --no-sync
```

### Supabase contents

- `supabase/migrations/20260417140000_init.sql`: canonical schema, RLS, search RPC, dossier view, and evidence RPC.
- `supabase/functions/search`: `/search`
- `supabase/functions/compare`: `/compare`
- `supabase/functions/ask`: `/ask`

## Operational flow

### Ingestion

- A source document is registered with a stable document hash.
- The worker parses text and extracts structured candidate fields.
- Skills, titles, and seniority are normalized deterministically.
- The document is chunked by section and embedded.
- Candidate summaries and comparison artifacts are persisted for the frontend.

### Search

- The frontend sends a natural language query plus filters.
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
- Keep AI-generated outputs grounded in stored evidence.
- Keep `supabase/migrations/20260417140000_init.sql` as the source of truth for the online schema.
