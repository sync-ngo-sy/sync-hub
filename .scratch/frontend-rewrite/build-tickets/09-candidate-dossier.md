# 09 — Candidate dossier

**What to build:** the full profile view of a single candidate — timeline, skills, supporting evidence — opened from the list or search. A recruiter can see the complete grounded profile of one candidate.

**Blocked by:** 08 (same candidate domain and patterns).

**Status:** complete

**References:** `../spec.md`, `../gaps-and-recommendations.md` Part 2 §12 (signed file URLs).
**Standing rules:** see ticket 01.

- [x] `features/candidates/`: the dossier page loads one candidate from a real Edge Function and renders the full profile
- [x] Dossier alias chains such as title and years-experience variants are inventoried, backend-verified, and fixture-tested; a private wire adapter produces the canonical camelCase candidate schema before caching. Malformed/conflicting payloads → error + Retry; loading → skeleton; not-found → clear not-found state
- [x] Any original-document/signed-URL access goes through an Edge Function that returns a URL string the frontend just opens (backend owns storage-provider branching); if that Edge Function is missing, flag it as a backend task
- [x] Query keys start with `scopeKey`
- [x] Tests via the shared kit + MSW cover the loaded profile and the not-found path

Implemented on 2026-07-20. The existing `candidate_detail` action requested two columns that do not exist on `candidate_dossier_v1`; its query was repaired with user approval and now returns a real 404 for an absent candidate. The worker source verifies one snake_case `profile_json` contract, so the speculative title/experience aliases from the old mapper are intentionally rejected.
