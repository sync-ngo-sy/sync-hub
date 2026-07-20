# Error handling & observability strategy

Type: grilling
Status: resolved

## Question

Decide the frontend's error-handling and observability strategy. Current state: zero `ErrorBoundary` components exist anywhere in `src/`; no error-reporting tool (Sentry, Datadog, LogRocket, PostHog, etc.) is wired up at all; raw backend/Postgres/Supabase exception text reaches the UI directly in at least three known places — `PublicJobBoardPage.tsx:59`, `Settings.tsx:85`, `AuthGate.tsx:83` — all doing `error instanceof Error ? error.message : String(error)` straight into UI state.

Decide:

- Error boundary placement and strategy (route-level, feature-level, or both).
- A consistent user-facing error UI/component to replace raw exception text.
- Whether to add an error-reporting tool now or defer, and if now, which one.

## Answer

**Scope is broader than the ticket's original three examples.** Grepping directly for `error.message` reaching UI state finds 7 files, not 3: `PublicJobBoardPage.tsx`, `CandidateDossierPage.tsx`, `SignInScreen.tsx`, `lib/auth.tsx`, `SearchDiscoveryPage.tsx`, `CandidateListingPage.tsx`, plus `lib/api/json.ts`'s `errorMessage` helper that several of them lean on (itself retired per [API layer isolation](06-api-layer-isolation.md)). Also confirmed: zero `ErrorBoundary` components anywhere in `src/`, and 3 catch blocks that `console.error` and silently move on. This needs a systemic rule, not per-file patches.

**Error boundaries — two-tier**, via `react-error-boundary` (React's native error boundaries are class-component-only; this is the standard function-component-friendly wrapper, with a documented React Query integration — `resetErrorBoundary` pairs directly with a failed query/mutation's retry):

- One top-level `ErrorBoundary` around the whole router — catches catastrophic crashes, worst-case fallback.
- One per route/page — a broken section doesn't take the nav/app shell down with it.

**User-facing error UI — two-tier, never raw `error.message`**:

- **Blocking errors** (a page/section failed to load): shadcn `Alert`, destructive variant (per ticket 02's component mapping), rendered inside the boundary's fallback.
- **Transient errors** (a mutation failed, page still usable): **Sonner**, not shadcn's own `Toast` — shadcn's docs mark `Toast` deprecated in favor of Sonner (`toast.error(...)`). A `Toaster` mounts once at the app root.
- **Message mapping layer**: known/expected error types (validation errors, not-found, auth failures) get specific, friendly copy written for this app; everything else falls through to one generic message ("Something went wrong. Please try again.") with the real error logged, never displayed. Zod parse failures from [API layer isolation](06-api-layer-isolation.md) are treated as *unexpected* — never shown raw, always logged clearly, since they signal an actual frontend/backend contract break, not a normal user-facing failure.

**Error-reporting tool: deferred**, not added now. Confirmed directly — pre-launch, no live users generating error volume yet, revisit later rather than wiring up Sentry (or similar) as part of this rewrite. The boundary/toast/mapping-layer work above is structured so adding a reporting call later is a small addition (one call in the boundary's fallback and the message-mapping layer's "unexpected" branch), not a redesign.

New dependencies: `react-error-boundary`, `sonner` (via shadcn's `Toaster`).
