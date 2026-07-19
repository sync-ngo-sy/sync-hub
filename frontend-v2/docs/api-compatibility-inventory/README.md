# API compatibility inventory

Durable, evidence-based record of every response alias/fallback chain the current `frontend/`
mappers accept, seeded ahead of the per-feature adapter work (ticket 05 checklist). Each entry
records: canonical field name, accepted wire names in precedence order, evidence (frontend +
backend source citations), required/nullable/optional semantics, null/absence handling, and
retirement notes. Speculative aliases — ones the audit couldn't confirm the current backend still
emits — are flagged, not carried forward.

Split into three files by domain, each produced by an independent static-analysis + backend
cross-verification pass:

- [`candidates-search.md`](./candidates-search.md) — candidates, search, compare, candidate
  shortlist. Includes a flagged backend/frontend field mismatch on `candidate_detail` that needs
  live-payload verification before that feature's adapter ships.
- [`jobs-insights.md`](./jobs-insights.md) — job postings, matching runs, job shortlists, job
  applications, public-jobs, insights dashboard/gap-analysis/report runs.
- [`admin-ops-parsing-misc.md`](./admin-ops-parsing-misc.md) — parsing-lab, parser profiles,
  tenant/admin provisioning, platform runtime config, workspace stats, system health, ops alerts,
  ask/agent, plus a full accounting of `lib/api/json.ts`'s coercion helpers (none of which survive
  into `frontend-v2`).

## How to use this when building a feature's `api/` folder

1. Find the endpoint/operation in the relevant file above.
2. For each canonical field, use the recorded **accepted wire names** as the private wire schema's
   accepted keys — nothing beyond what's listed without new evidence (a captured real response or
   backend source citation).
3. Anything flagged **speculative/dead** here is not a reason to add an alias; if backend behavior
   turns out to differ from what this audit found (e.g. a live payload shows a field this doc
   didn't expect), treat that as new evidence and update the entry, not as license to hedge broadly.
4. Every "banned pattern" section (silent defaults, blanket coercion, fail-open/fail-closed
   defaults on required or security-sensitive fields) describes a bug class ticket 05's rules
   forbid reproducing — fail loud instead (missing required field, invalid enum, or conflicting
   alias values all reject parsing).
5. Once a feature's adapter and fixture tests are in place for an endpoint, that endpoint's old
   `map*`/`apiMappers` function can be deleted — but only after every retained response case here
   has a corresponding fixture, per ticket 05.

This inventory is a snapshot of `frontend/` as of this audit, not a live contract — when the
backend changes, update the relevant entry rather than trusting it blindly.
