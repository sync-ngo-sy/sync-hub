# Contributing Guide

Thanks for helping improve CV Intelligence Platform. This repo combines a React frontend, Supabase Edge Functions and migrations, infrastructure templates, and a Python ingestion worker, so small focused changes are easiest to review.

## Repository Map

- `frontend/`: Vite React app for recruiter and admin workflows.
- `supabase/`: migrations and Edge Functions.
- `worker/`: Python ingestion, parsing, extraction, embeddings, local artifact cache, and sync logic.
- `scripts/`: operator and data-quality utilities.
- `infra/`: local and cloud infrastructure examples.
- `docs/`: architecture notes and engineering review records.

## Local Setup

1. Create `.env.local` from `.env.example` and fill only the values needed for your workflow.
2. Install frontend dependencies:

   ```bash
   cd frontend
   npm install
   ```

3. Install the worker in editable mode with developer tools:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   python -m pip install --upgrade pip
   python -m pip install -e "worker[dev]"
   ```

4. Optional local backend:

   ```bash
   supabase start
   supabase functions serve --no-verify-jwt
   ```

## Quality Gates

Run the relevant checks before opening a pull request:

```bash
node scripts/check-repo-format.mjs
node scripts/check-supabase-migrations.mjs
cd frontend && npm run lint && npm run test && npm run build
python -m ruff check worker/src worker/tests scripts
python -m pytest worker/tests
```

For coverage parity with CI:

```bash
python -m pytest --cov=cv_intelligence_worker --cov-report=term-missing --cov-fail-under=65 worker/tests
```

Security checks used in CI:

```bash
python -m bandit -q -r worker/src scripts -lll
python -m pip_audit --skip-editable
cd frontend && npm audit --audit-level=high
```

## Pull Request Expectations

- Keep PRs focused on one problem or feature.
- Include tests for changed behavior, especially worker ingestion, parsing, search, sync, and auth-sensitive flows.
- Update documentation when behavior, setup, environment variables, or operations change.
- Do not commit secrets, local `.env` files, tenant data, private CVs, generated caches, or Terraform state.
- Use clear PR titles such as `fix(worker): report duplicate ingestion progress`.
- Call out migrations, data backfills, or manual deployment steps in the PR description.
- For frontend PRs, run the Codex review skill in [.codex/skills/cv-intel-react-review](.codex/skills/cv-intel-react-review/SKILL.md). See [docs/codex-react-review-skill.md](docs/codex-react-review-skill.md).

## Coding Standards

- Python code is linted with Ruff.
- Frontend TypeScript must pass strict `tsc` checks.
- Markdown, JSON, YAML, TOML, TypeScript, Python, Terraform, and CSS files should use LF line endings, final newlines, and no trailing whitespace.
- Keep tenant isolation, RLS, and service-role key boundaries explicit in code review.
- Prefer deterministic, evidence-grounded behavior for ranking and retrieval. Use LLMs only where the existing architecture expects them.
- Follow the clean-code guidance in [docs/clean-code-guidelines.md](docs/clean-code-guidelines.md) when refactoring or adding new modules.
- Preserve the frontend architecture captured in the Codex React review skill: feature folders, thin screens, lazy mock/demo data, ordered CSS modules, accessible controls, and file-size review thresholds.
