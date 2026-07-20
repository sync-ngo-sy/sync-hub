# 14 — Jobs: create/edit form + matching runs

**What to build:** creating and editing a job posting (a real, validated form), plus running candidate-matching on a job and viewing the runs. This replaces the current 1,000-line job-edit file with a thin container plus proper form handling.

**Blocked by:** 13 (same jobs domain).

**Status:** ready-for-agent

**References:** `../issues/05-architecture-state-conventions.md` (container/presentational + RHF), `../spec.md`, `../gaps-and-recommendations.md` Part 3 §I. Large — split during `/implement` if needed (e.g. create/edit form vs. matching runs).
**Standing rules:** see ticket 01.

- [ ] `features/jobs/`: create and edit forms built with React Hook Form + Zod via shadcn's Form primitives — the form schema is the source of truth for form input (no `useState`-per-field or hand-written validator); reuse canonical field-schema fragments only where semantics match, never a legacy wire response schema
- [ ] The page is a thin container (wires React Query + the form) delegating to presentational children; keep formatting/transform logic local until it has independent behavior or a second real consumer, then extract a cohesive, specifically named co-located module — no generic helpers/utils dumping ground
- [ ] AI requirement-extraction, matching-run start, and run viewing all go through real Edge Functions; the matching-run detail/list render correctly
- [ ] Save/extract/run failures surface via the message mapper (toast/Alert), never raw text; success is clearly confirmed
- [ ] Job write/matching wire variants are verified and fixture-tested; private adapters produce canonical schemas/types before cache writes and request encoders alone own current backend keys. Missing/conflicting fields fail loudly; query keys start with `scopeKey`
- [ ] Tests via the shared kit + MSW cover form validation (including a rejected submit), a successful save, and starting/viewing a matching run
