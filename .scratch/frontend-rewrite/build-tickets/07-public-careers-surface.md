# 07 — Public careers surface (tracer bullet)

**What to build:** the public, job-seeker-facing pages — browse open jobs, view a job, apply — built completely front to back. This is the first full feature and it proves the whole foundation works end to end: fetch from a real Edge Function, validate with zod, render with the shared pieces, route it, and test it. Complete the shared render/test kit begun by ticket 05 only as real route and feature needs appear. Because it's unauthenticated, it proves the stack without the login/company complexity.

**Blocked by:** 06. (Read ticket 02's inventory first.)

**Status:** complete

**References:** `../issues/08-routing-and-recruiter-candidate-separation.md` (the careers naming/separation), `../spec.md`, `../gaps-and-recommendations.md` Part 2 §7, §11, §12.
**Standing rules:** see ticket 01.

- [x] `features/careers/` (its own clearly-named area — never uses the word "Candidate", which is reserved for the recruiter-side data entity): job list, job detail, and application submission all working against real Edge Functions
- [x] Every endpoint follows ticket 05's private wire-schema → compatibility-adapter → canonical camelCase schema flow before React Query caches it; exported types derive from canonical schemas only, and malformed/conflicting payloads throw into error UI rather than silently defaulting
- [x] Data via React Query hooks in the feature's `api/` folder; loading shows skeletons; failure shows "something went wrong" + Retry; empty shows an empty state
- [x] The application form is built with React Hook Form + Zod; canonical field-schema fragments may be reused where semantics match, but the form never imports a legacy wire schema. A request encoder owns current backend keys; CV upload is a mutation with visible progress and clear success/error
- [x] SEO for the 2 public routes only: per-page `<title>` + meta description, JSON-LD `JobPosting` on the detail page, a build-generated `sitemap.xml`
- [x] **Shared test kit created here** (and reused by all later features): `renderWithProviders` (Router + QueryClient + injected fake auth), MSW server + per-feature handler pattern, fake timers, jsdom/matchMedia setup — all in test files only, no fake data in app code
- [x] Raw fixture tests cover every verified response variant plus malformed/conflicting cases; MSW tests cover the list/detail/apply happy paths and an error path through the real adapter/query flow

Implemented on 2026-07-20. The build-time sitemap degrades to the careers index when the configured public-jobs function is unavailable; verified slugs are included whenever that endpoint responds successfully.
