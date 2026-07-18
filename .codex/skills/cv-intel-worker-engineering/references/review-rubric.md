# Worker Review Rubric

Apply the sections relevant to the change. Treat correctness, tenant isolation, security, data integrity, and silent failure as merge-blocking concerns.

## Change Scope

- Confirm the PR has one primary concern and a clear behavior boundary.
- Flag unrelated formatting, renaming, dependency upgrades, or opportunistic refactors.
- Preserve CLI arguments, environment variables, persisted shapes, and external API contracts unless the PR explicitly migrates them.
- Require a follow-up list when a large legacy module cannot be safely decomposed in one PR.

## Architecture

- Separate orchestration, domain transformations, external clients, schemas, and configuration.
- Keep parsing, normalization, and mapping functions deterministic where possible.
- Pass dependencies explicitly when tests or alternate providers need substitution.
- Search for an existing helper before introducing another client, serializer, retry policy, validator, or identifier function.
- Reject circular imports, hidden global state, and import-time network or database work.

## LLM Boundaries

- Use the shared OpenAI-compatible SDK client for OpenAI, Gemini compatibility, and Ollama compatibility paths.
- Define each structured output as a strict Pydantic model with unknown fields forbidden.
- Use the same model to generate the provider schema and validate the runtime response.
- Cover missing fields, misspelled fields, invalid enum values, refusal, empty output, timeout, and provider errors.
- Configure timeout and retries once in the client. Preserve the exception cause and avoid logging credentials or CV content.
- Do not repair malformed model JSON with regular expressions or silently coerce an invalid response into a valid profile.

## Persistence and External Services

- Keep Supabase, Storage, GCS, and Manatal transport details inside dedicated clients.
- Validate row shapes before persistence and check response cardinality where requests map one-to-one to inputs.
- Preserve tenant and user scoping in every query and write.
- Make retries idempotent. Test duplicate delivery, stale work recovery, partial batch failure, and terminal failure.
- Do not catch and discard HTTP errors. Attach operation and resource context without exposing tokens or candidate data.

## Failure Semantics

- Decide explicitly whether an operation fails closed, fails open, retries, skips one item, or aborts the run.
- Fail closed for authorization, tenant isolation, integrity, and fraud or trust decisions.
- Allow per-item isolation only at batch orchestration boundaries and include the failure in the run result.
- Avoid fallback behavior that makes a failed LLM call look like a successful validated extraction.
- Use bounded retries with SDK backoff and retry only transient failures.

## Tests

- Test observable behavior rather than only helper call counts.
- Mock at the external SDK or HTTP boundary, not above the code whose behavior is under test.
- Include negative contract tests for malformed input and malformed provider output.
- Assert persisted or returned shapes when schema changes can affect the frontend or database.
- Keep networked end-to-end tests explicit about credentials, cleanup, timeouts, and skip conditions.
- Require a regression test for every fixed production bug.

## Maintainability

- Target production modules under 250 lines and review any file over 300 lines for extraction opportunities.
- Do not grow files over 400 lines without documenting why decomposition is unsafe in this PR.
- Exempt generated files, static taxonomies, schemas, and test fixtures from mechanical line targets, but keep ownership clear.
- Prefer cohesive names and small functions over comments that explain tangled control flow.
- Remove dead helpers and obsolete tests when an abstraction replaces them.

## Validation Evidence

- Run focused tests during iteration.
- Prefer `worker/.venv/bin/python` when the repository-local environment exists.
- Run Ruff, the full worker test suite with coverage, Bandit, and the dependency audit before handoff.
- Inspect `git diff --check` and the final diff after tests pass.
- Rerun affected checks after every review fix.
