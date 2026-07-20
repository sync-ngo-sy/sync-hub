# Routing structure: clean URLs & recruiter/candidate naming separation

Type: grilling
Status: resolved

## Question

Two related routing/structure problems surfaced after the map's original seven tickets, not part of the initial charting:

1. The app is hash-routed (`createHashRouter`, URLs like `/#/candidates`) rather than clean URLs (`createBrowserRouter`, `/candidates`).
2. Recruiter-facing and candidate/public-facing code and naming are indistinguishable at a glance — is this actually two separate apps, or one app with unclear naming?

## Answer

**Not two apps.** Checked `routeRegistry.tsx` and `router.tsx` directly: only 2 routes are candidate/public-facing (`/careers`, `/careers/:slug`) versus 20+ recruiter/internal routes (search, candidates, job postings, job matching, insights, chat, compare, settings, the whole `/admin/*` section). The router already treats them as structurally separate — public routes render standalone, everything else is wrapped in `AuthGate` + `AppShell`. A full separate build/deploy target was considered and explicitly rejected as overkill for a 2-route public surface — confirmed with the effort's owner.

**Root cause of the naming confusion**: the word "Candidate" is overloaded. `CandidateListingPage`, `CandidateDossierPage`, `features/candidates/`, `CandidateSearchFacetRow` — all of these are the *recruiter's* view of candidate data records, not anything the actual job-seeker sees. The real public-facing pages are named `PublicJobBoardPage`/`PublicJobDetailPage`. Nothing marks the distinction between "the recruiter's view of candidate data" and "the candidate's own experience," which is exactly the confusion reported.

**Resolution — naming and folder separation, no infrastructure split**:

- **Domain naming** (a `/domain-modeling` glossary entry, not just a rename): "Candidate" is reserved exclusively for the recruiter-side data entity — that's already ~90% of the app's usage, left as-is. The public job-seeker-facing surface gets an unambiguous, distinct term (e.g. "Careers"/"Applicant") and never uses "Candidate" in its naming, so the two can't drift back into collision.
- **Folder structure**: the public surface gets its own clearly-named top-level home — `features/careers/` — physically separate from every recruiter-facing feature domain, with zero shared "Candidate"-named imports between them. This slots into the three-tier structure from [Architecture & state-management conventions](05-architecture-state-conventions.md) as just one more feature domain, not a special case.

**Resolution — clean URLs**: switch to `createBrowserRouter`. This has a real deployment-side dependency, not just a one-line router swap: the current hash-router choice was deliberate (`CPANEL_DEPLOYMENT_CHECKLIST.md`: *"this app uses a hash router, so no SPA rewrite rules are required"*), specifically to avoid needing server-side config on cPanel hosting. Going to clean URLs requires a catch-all SPA fallback rewrite (`.htaccess` + `mod_rewrite` on Apache/cPanel — standard and well-supported, not exotic) so a direct request to e.g. `/candidates` serves `index.html` instead of 404ing. Whoever executes the actual `frontend-v2` cutover needs to add that `.htaccess` rule and update `CPANEL_DEPLOYMENT_CHECKLIST.md`/`DEPLOYMENT_GUIDE.md` accordingly — noted here as a required follow-up, not silently assumed to just work.
