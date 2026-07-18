---
name: cv-intel-worker-engineering
description: Review, design, implement, or refactor CV Intel Python worker changes using the repository's reliability, modularity, validation, testing, and small-PR standards. Use for changes under worker/, including CV parsing and extraction, LLM integrations, embeddings, Manatal sync, Supabase sync, public applications, candidate drafts, pipelines, CLI behavior, worker tests, and reviews of worker pull requests.
---

# CV Intel Worker Engineering

Use this skill as the engineering and merge-readiness workflow for `worker/` changes.

## Workflow

1. Read `worker/AGENTS.md` and follow its scoped rules.
2. Inspect the relevant production code, tests, configuration, and callers before proposing a change.
3. Read `references/review-rubric.md` and identify the affected boundaries.
4. Define one reviewable PR concern and state what will remain for follow-up PRs.
5. Reuse an existing abstraction before adding a new client, parser, retry loop, schema, or helper.
6. Add or update tests that exercise behavior at the lowest meaningful boundary, including malformed and failure cases.
7. Run focused tests first, then the full worker quality gate.
8. Review the diff for duplication, accidental behavior changes, weak tests, broad exceptions, dead code, and unrelated formatting.
9. Fix every actionable finding and rerun the affected checks.

## Hard Gates

- Keep external I/O behind a client or adapter and domain transformations pure where practical.
- Use provider SDKs instead of handwritten HTTP for LLM calls.
- Define LLM structured outputs once with Pydantic and validate them at runtime.
- Delegate transient retry policy to the shared client or SDK; do not add call-site retry loops.
- Reject malformed boundary data before it reaches persistence or API responses.
- Do not silently fail open for authorization, integrity, fraud, or validation decisions.
- Catch broad exceptions only at an orchestration boundary that must isolate per-item failures; preserve context and test the behavior.
- Keep comments for non-obvious intent, constraints, or tradeoffs; do not narrate the code.
- Keep the PR focused. Move independent cleanup to a named follow-up PR.

## Validation

Run from the repository root with the active Python environment. Prefer `worker/.venv/bin/python` when it exists; otherwise replace it with the active `python` executable:

```bash
python -m ruff check worker/src worker/tests scripts
python -m pytest --cov=cv_intelligence_worker --cov-report=term-missing --cov-fail-under=65 worker/tests
python -m bandit -q -r worker/src scripts -lll
python -m pip_audit --skip-editable
```

Run a live smoke test only when credentials are authorized and the changed boundary cannot be validated locally. Use synthetic data and never print secrets or real CV content.

## Review Output

For reviews, report findings first in severity order with file and line references. Explain the runtime, data-integrity, security, or maintenance impact. End with commands run and residual risk.

For implementation, summarize the behavior change, PR scope, validation evidence, and explicitly deferred follow-ups.
