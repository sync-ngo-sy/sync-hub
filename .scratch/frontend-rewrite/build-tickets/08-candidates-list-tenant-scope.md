# 08 — Candidates list + tenant-scope switching

**What to build:** the first recruiter feature that needs login — the browsable list of candidates (the recruiter's data records) — plus proving that switching company reloads the right data and the route guards actually work. This establishes the authenticated feature pattern the rest reuse.

**Blocked by:** 07 (reuses its proven full-stack pattern + test kit).

**Status:** complete

**References:** `../spec.md`, `../gaps-and-recommendations.md` Part 2 §1, §4. "Candidate" = the recruiter-side data entity throughout.
**Standing rules:** see ticket 01.

- [x] `features/candidates/`: the candidate list works against a real Edge Function, with browse/filter/group
- [x] Filters, sort, and pagination live in the URL (`searchParams`) via one typed, zod-validated hook — shareable and refresh-safe; not stored in Zustand or `sessionStorage`
- [x] Query keys start with `scopeKey`; switching company or scope automatically refetches the list (verified in a test)
- [x] Reaching the page requires auth; the guard redirects an unauthenticated visitor to sign-in
- [x] Candidate-list wire fields and every accepted legacy alias are verified and fixture-tested; the feature adapter returns only the canonical camelCase schema/type before React Query caches it. Malformed/conflicting payloads → error + Retry; loading → skeletons; valid empty result → empty state
- [x] Any list rendered with stable keys (no `key={index}`); large lists use the shared table where appropriate
- [x] Tests via the shared kit + MSW cover the list, a filter change reflected in the URL, and a scope switch triggering refetch

Implemented on 2026-07-20. Backend source confirms this endpoint has one strict camelCase response shape; the old snake_case/data/rows aliases were speculative and are intentionally rejected.
