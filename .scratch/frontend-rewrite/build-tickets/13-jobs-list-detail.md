# 13 — Jobs: postings list + detail

**What to build:** the internal job postings — see the list of roles and open one to view its full detail. A recruiter can browse and read job postings.

**Blocked by:** 07 (independent feature domain; needs the proven foundation, not the candidate area).

**Status:** ready-for-agent

**References:** `../spec.md`, `../gaps-and-recommendations.md`.
**Standing rules:** see ticket 01.

- [ ] `features/jobs/`: postings list and job detail work against real Edge Functions
- [ ] Job-list/detail wire variants are inventoried, backend-verified, and fixture-tested; private adapters return canonical camelCase job schemas/types before caching. Malformed/conflicting payloads → error + Retry; loading → skeletons; valid empty/not-found → explicit states
- [ ] List filters/sort/pagination in the URL where relevant; query keys start with `scopeKey`
- [ ] Any list uses stable keys; a job list of rows uses the shared table where appropriate
- [ ] Tests via the shared kit + MSW cover the list, a detail load, and the empty/not-found paths
