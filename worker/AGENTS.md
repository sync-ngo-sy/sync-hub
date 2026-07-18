# Worker Engineering Rules

Apply these rules to every change under `worker/`.

## Change Discipline

- Keep each PR focused on one behavior boundary. Do not mix runtime refactors, broad formatting, policy changes, and dependency cleanup.
- Inspect callers, tests, configuration, and existing abstractions before editing.
- Preserve CLI flags, environment variables, persisted JSON, and external API behavior unless the change explicitly migrates them.
- When touching a large legacy file, avoid adding another concern. Extract the changed boundary when safe and defer independent cleanup.

## Architecture

- Keep domain transformations deterministic and separate from network, filesystem, database, and process I/O.
- Put Supabase, Storage, GCS, Manatal, and model transport behind dedicated clients or adapters.
- Pass dependencies explicitly where tests or provider substitution need a seam.
- Reuse shared configuration, schemas, identifiers, serialization, and retry policies. Search before creating a helper.
- Avoid import-time I/O, hidden mutable globals, and circular imports.

## LLM Integration

- Route LLM calls through one shared OpenAI-compatible SDK client. Do not call model endpoints with `urllib`, raw `httpx`, or `requests`.
- Define structured output with strict Pydantic models, forbid unknown fields, and validate every response at runtime.
- Use the same Pydantic model for provider schema generation and application validation.
- Configure timeouts and transient retries once in the client. Do not add retry loops at call sites.
- Treat refusals, missing output, malformed fields, and invalid enum values as explicit failures.
- Never log credentials, raw CV content, or unredacted provider payloads.

## Failure Behavior

- Fail closed for authentication, authorization, tenant isolation, data integrity, and fraud or trust validation.
- Catch `Exception` only at an orchestration boundary that must isolate per-item failures. Preserve context and include the failure in the run result.
- Make retryable writes idempotent and bound every retry.
- Do not silently substitute heuristic or default data after a required extraction or validation step fails.

## Maintainability

- Target production modules under 250 lines. Review files over 300 lines and do not grow files over 400 lines without an explicit reason.
- Exempt generated files, static taxonomies, schemas, and fixtures from mechanical line limits when their ownership remains clear.
- Keep functions cohesive and names explicit. Prefer early validation and shallow control flow.
- Add comments only for non-obvious intent, constraints, or tradeoffs. Do not narrate what the code already says.

## Tests

- Add a regression test for every production bug.
- Test malformed inputs, provider failures, partial batch failures, idempotency, and tenant scoping where relevant.
- Mock at the external SDK or HTTP boundary, not above the behavior being tested.
- Assert returned or persisted shapes when a change can affect the frontend or database.
- Keep live tests opt-in, use synthetic data, clean up created state, and never print secrets.

## Required Loop

1. Run focused tests for the changed behavior.
2. Run the full worker checks.
3. Review the final diff for duplication, broad exceptions, weak tests, dead code, accidental behavior changes, and unrelated formatting.
4. Fix every actionable finding.
5. Rerun all affected checks.

From the repository root, use `worker/.venv/bin/python` when it exists; otherwise replace it with the active `python` executable:

```bash
python -m ruff check worker/src worker/tests scripts
python -m pytest --cov=cv_intelligence_worker --cov-report=term-missing --cov-fail-under=65 worker/tests
python -m bandit -q -r worker/src scripts -lll
python -m pip_audit --skip-editable
```
