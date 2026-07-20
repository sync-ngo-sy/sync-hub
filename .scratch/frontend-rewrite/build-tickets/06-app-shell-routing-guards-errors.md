# 06 — App shell + routing + guards + error boundaries

**What to build:** the frame every page lives inside. Clean web addresses, the side menu and top bar, real access control (a normal user can't reach admin pages by typing the URL), and a safety net so one broken page doesn't take down the whole app and users never see a raw error.

**Blocked by:** 04 (uses the shared UI pieces), 05 (guards need the auth/scope logic).

**Status:** complete

**References:** `../issues/07-error-handling-observability.md` and `../issues/08-routing-and-recruiter-candidate-separation.md` (decisions), `../spec.md`, `../gaps-and-recommendations.md` Part 2 §6, §8, §13 and Part 3 §E, §G, §H.
**Standing rules:** see ticket 01.

- [x] `createBrowserRouter` with clean URLs (no hash routing); route `title`/`subtitle` attached via each route's `handle` and read with `useMatches` (delete the hand-written route-matcher pattern)
- [x] Three guarded route groups: public (`/careers/*`, no auth), authenticated (recruiter app, redirect to sign-in), admin (`/admin/*`, redirect or 403 if not admin). Guards are UI defense; backend still enforces its own rules
- [x] AppShell layout (side nav, top bar) built from shared components; inline layout styles replaced by token-based CSS classes
- [x] Every route lazy-loaded (dynamic import + route-level Suspense fallback); Suspense used for code-splitting only, not data
- [x] Two-tier error boundaries: one around the whole app, one per route — a crash in one section leaves the shell and nav working
- [x] One message-mapper turns errors into friendly copy (known errors → specific message, everything else → one generic message with the real error logged, never shown); Sonner Toaster mounted for transient errors, shadcn Alert for blocking ones
- [x] The five auth screens `screen-inventory.md` assigns here (`SignInScreen`, `PasswordRecoveryScreen`, `AccessPendingScreen`, `LoadingScreen`, `AuthShell`) are built against their real old files for layout parity (ticket 01's standing rules), not just linked to as a route destination
- [x] "Access pending" screen (logged in, no membership, not admin) and "app is not configured" screen (missing dev config) both exist
- [x] No raw `error.message`/`String(error)` reaches the UI anywhere

## Comments

Implemented on `frontend-refactor`. Verification: focused route/error/auth tests, ESLint, and production build all pass. The sign-in screen was rendered at 1440×1000 and compared side-by-side with the old frontend; its header, centered title/form, and three-card lower composition preserve the old layout using the v2 tokens and shared components.
