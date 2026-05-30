# Clean Code Guidelines

These guidelines make the repository easier for multiple contributors to change safely.

## Core Principles

- Keep orchestration separate from implementation details. Command handlers, pipelines, and UI screens should read as a sequence of domain steps.
- Prefer small named functions over nested closures when state or branching grows.
- Keep external IO behind narrow collaborators so business logic remains easy to test.
- Make tenant, auth, sync, and storage boundaries explicit in names and function arguments.
- Add tests at the same abstraction level as the behavior being changed.
- Avoid broad cleanup mixed with feature work. Leave large mechanical refactors for dedicated PRs.

## Python Worker

- `cli.py` should parse arguments and delegate to command handlers.
- `pipeline.py` should orchestrate ingestion and comparison; parsing, extraction, embedding, storage, and Supabase sync should stay in collaborators.
- Long dictionaries such as skill aliases should be treated as data. Prefer generated or isolated data modules before adding more logic around them.
- Functions that perform network or filesystem IO should return plain data structures or dataclasses and avoid printing directly.
- Catch broad exceptions only at operational boundaries where the run can continue and the error is returned to the caller.

## Frontend

- Screen files should compose feature components and hooks rather than owning all data loading, transformation, and rendering logic inline.
- Shared domain transformations belong under `frontend/src/lib`; presentational components belong under `frontend/src/components`.
- Keep live Supabase behavior and mock/demo behavior behind the same contracts so UI code does not branch repeatedly.
- When a screen grows beyond roughly 300-400 lines, extract the next change into a focused component or hook instead of extending the file.

## Supabase

- Migrations should be small, timestamped, and reversible by an explicit follow-up migration when needed.
- Edge Functions should keep request validation, auth/context resolution, domain logic, and response formatting separate.
- Shared Edge Function helpers should stay in `supabase/functions/_shared` and should not depend on a specific endpoint unless named that way.
