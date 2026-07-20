# Frontend v2 — Gaps, Decisions, and Cleanup Recommendations

Status: for-agent
For: the AI that will build `frontend-v2/` and split this into tickets.

## How to read this file

The current `frontend/` implementation is treated as **disposable and wrong by default**.
Do not copy its technical patterns. For each existing screen, preserve both *what it does*
and the visible layout users recognize, then rebuild that result on the new stack without
copying old CSS, components, state, helpers, stores, or parsers.

Each item below is written as:
- **Problem** — what is wrong now (with file references).
- **Decision** — do exactly this. These are chosen, not open questions.
- **Delete / replace** — what to remove.

If a Decision truly cannot be applied because it needs backend work that does not exist
yet, stop and ask — do not invent a fake path around it.

---

## Part 0 — Core rules (apply to every screen, every hook)

These are the "normal app" rules. Follow them everywhere.

1. **One real path.** App code always talks to the real backend. No `mock`, no
   `if (!supabase)`, no fake-data branch anywhere in `src/`.
2. **Backend broken → error screen + Retry button.** Use React Query's error state.
   Show one friendly message and a Retry that calls `refetch()`. Never fake data.
3. **No data → empty state.** ("No candidates yet", "No open jobs".) A real empty
   result is not an error.
4. **Bad/malformed response → throw an error** that lands in the error UI. Never
   silently default a missing field (today a missing `role` becomes `"owner"` — this
   class of bug is banned).
5. **Validate every server response with a zod schema** at the moment it arrives.
   Types come from the schema (`type X = z.infer<typeof XSchema>`). No hand-written
   type that can drift from the schema.
6. **Never show raw error text to a user.** No `error.message`, no `String(error)` in
   the UI. All errors go through one small "map error → friendly message" function.
7. **Strict TypeScript.** No `any`, no `as` casting. Today there are **171 `as` casts**
   — target is zero (a handful of unavoidable ones may stay, justified in a comment).
8. **State ownership is fixed:**
   - Server data → **React Query only**.
   - Filters, sort, pagination, selected tab → **the URL** (`searchParams`).
   - Forms → **React Hook Form + zod**.
   - Tiny cross-route UI state (sidebar collapsed, transient multi-select) → **Zustand**,
     and almost nothing else.

---

## Part 1 — Remove all mocking (do this first, it unblocks everything)

**Problem.** Fake data lives inside the app, not the tests.
- Startup switch: `platformApi = hasSupabaseConfig ? createRemoteApi() : createLazyMockApi()`
  (`src/lib/platformApi.ts:1597`). No backend config → the whole app runs on fake data.
- The "real" API also falls back to fake data ~20 times, e.g.
  `src/lib/platformApi.ts:895` returns `mock.listCandidates(...)` when there is no tenant,
  and many `catch` blocks return `mock.X()` or empty values.

**Decision.**
- The app has exactly one runtime path: real backend, always.
- Fake data exists **only in test files**, served through **MSW** (`setupServer` in Vitest).
- No hook, component, or page may import a mock or know a mock exists.
- **Local development runs against a real backend** (local Supabase or a dev project).
  Do **not** ship a browser mock by default. If offline clicking becomes painful later,
  add MSW in the browser behind an explicit `VITE_ENABLE_MSW` flag — but not now.
- Replace every deleted fallback with a real state: empty state, or error + Retry
  (see Part 0 rules 2–4).

**Delete / replace.**
- `src/data/mockData.ts` (1128 lines) — delete.
- `src/lib/api/mockPlatformApi.ts` (725 lines) — delete.
- `src/features/jobs/jobMocks.ts` — delete.
- `createLazyMockApi`, `getMockApi`, `mockApiPromise`, the `Proxy` hack — delete.
- The `hasSupabaseConfig ? real : mock` ternary and every `if (!supabase)` / `mock.X()`
  branch inside `platformApi.ts` — delete.

---

## Part 2 — The cross-cutting gaps (each with the chosen approach)

### 1. Auth + "which company" (tenant scope) state

**Problem.** Almost every request needs `tenantIds` ("current company", or admin's
"all companies"). Today `src/lib/auth.tsx` (388 lines) holds session + memberships +
`isAdmin` + `currentTenant`, `src/lib/platformScope.ts` adds a `current`/`all` mode, and
`tenantIds` is passed by hand into all 51 API methods. On any auth change the code does
`appQueryClient.clear()` (`auth.tsx:161`) — a blunt "forget everything".

**Decision.**
- Keep a **small** auth context: `session`, `user`, `memberships`, `isPlatformAdmin`,
  `currentTenant`, selected tenant id, and scope mode. This is genuinely global; a React context is correct. But rewrite it
  much smaller — the current file has redundant state syncing and manual token juggling.
- Put scope mode (`current` / `all`) and the current tenant id in that same context. Persist
  them as one concrete auth-preferences record with an exact versioned Zod schema (never
  trust raw `localStorage`, and do not create a generic storage abstraction).
- Expose one hook `useTenantScope()` that returns `resolvedTenantIds` and a stable
  `scopeKey` string.
- **Every feature query key starts with the scope key**, e.g.
  `["candidates", scopeKey, filters]`. When the user switches company/scope, the key
  changes and React Query refetches automatically. **Delete the manual
  `queryClient.clear()`** on tenant switch.
- Keep `queryClient.clear()` for **sign-out only** (so one user never sees another user's
  cached data). That is a security requirement, not a convenience.

### 2. What "the transport" actually is

**Problem.** The spec says the transport is "a thin layer that adds the auth header".
Reality: the Supabase client does **four different things** —
Edge Function calls (`supabase.functions.invoke`), **direct table reads**
(`supabase.from(...).select()`, e.g. `platformApi.ts:433`, `countRows.ts`,
`platformRows.ts`), **Storage signed URLs** (`platformApi.ts:1056`), and the **whole auth
lifecycle** (`supabase.auth`, token refresh, password recovery via URL). Also, auth is a
stateful client that MSW cannot cleanly intercept.

**Decision.**
- **Route all data through Edge Functions** (the `platform` aggregator function plus named
  functions). **Stop reading tables directly from the frontend.** One kind of call = one
  boundary = one place to validate and one place to mock in tests.
  - This deletes `src/lib/api/countRows.ts`, `src/lib/api/platformRows.ts`,
    `fetchCandidateDetailDirect`, `fetchManatalSyncStatusDirect`, and the direct
    `.from(...)` chains.
  - Where a needed Edge Function does not exist yet, that is a **backend task** — flag it,
    do not re-add a direct table read as a workaround.
  - Signed file URLs: the backend should return the URL from an Edge Function; the frontend
    just receives a string (see point 12). Move the GCS-vs-Supabase branching to the backend.
- **Transport = one small file** `src/lib/api/client.ts` (~100–150 lines): wrap
  `functions.invoke`, attach nothing extra (supabase-js already sends the auth token),
  normalize the error shape, and return successful JSON as `unknown`. It has no generic
  `<T>` cast, global key-casing conversion, domain schema, or fallback value. Feature-owned
  compatibility adapters parse the payload. Nothing domain-specific lives here.
- **Auth is not mocked via MSW.** In tests, render with a test provider that injects a fake
  session + memberships. That is the normal, honest approach. Say this out loud in the
  testing ticket: *"one network seam (MSW) for data; auth state is injected at the provider
  in tests."*

### 3. Silent fallbacks become real error / empty states

**Problem.** Many methods hide failure. Examples:
- Insights falls Edge Function → direct RPC → search cache (`platformApi.ts:1372`).
- `getSearchFilterOptions` returns empty options on any failure (`platformApi.ts:936`).
- `getWorkspaceStats` returns zeros on failure.
So a real outage looks like "empty" and nobody notices.

**Decision.**
- **Delete every multi-path fallback and every catch-that-returns-empty.** One request,
  one path.
- On failure: React Query surfaces the error → show "Something went wrong" + Retry.
- On genuinely empty data: show the empty state.
- This is the behavior the app owner explicitly wants (broken backend = a clear "try again"
  screen). It also removes the "Function → RPC → cache" branching, which was frontend code
  compensating for backend uncertainty.

### 4. Filters: URL vs. store (they conflict today)

**Problem.** Story 9 (filters survive navigation) and story 12 (shareable/refreshable URLs)
pull opposite ways, and the code is inconsistent: candidate filters in the URL
(`candidateListState.ts`), search filters in `sessionStorage`
(`searchState.ts:19`), compare/chat scope in URL params (`?ids=`).

**Decision.**
- **The URL is the single source of truth for filters, sort, and pagination.** Read/write
  `searchParams` through a typed, zod-validated hook (`useSearchFilters`). This gives
  persistence-across-navigation *and* shareable/refreshable URLs for free — one mechanism,
  both stories satisfied.
- **Do not put filters in Zustand.** Delete the `sessionStorage` search-state blob
  (`searchState.ts`) and the ad-hoc `localStorage` filter juggling.
- Zustand shrinks to almost nothing:
  - sidebar collapsed (or just `localStorage`),
  - the transient multi-select set used for Compare (lost on refresh is acceptable; if you
    want it to survive, back it with `sessionStorage`).
- The **shortlist is server data** (saved in the backend) → **React Query, not Zustand.**

### 5. Charts / data-visualization

**Problem.** Insights pages (pyramid, gap, skills, overview) draw charts by hand in
SVG/CSS (`pyramid.css`, `<svg>` in `InsightsOverviewTab.tsx`). No chart library exists.
The spec only picked chart *colors*, not *how to draw*.

**Decision.**
- Use **Recharts via shadcn's `chart` component** (shadcn ships a Recharts wrapper that
  reads the `--chart-1..8` tokens). It is the conventional React choice and composes with
  the rest of the stack.
- Delete the hand-rolled SVG/pyramid CSS.
- Give each chart a text alternative / accessible label (a table or `aria-label`) so charts
  are not invisible to screen readers.
- (Only reach for `visx`/`d3` if a specific chart is impossible in Recharts — unlikely here.)

### 6. Route-level authorization (missing today)

**Problem.** All `/admin/*` routes are registered with no role check
(`routeRegistry.tsx`), and `AuthGate` only checks *session + has-any-membership*, not
admin. A normal logged-in user who types `/admin/accounts` reaches the admin page. The menu
only hides the link.

**Decision.**
- Three route groups with guards:
  - **public** (`/careers/*`) — no auth.
  - **authenticated** (recruiter app) — wrapped in `<RequireAuth>` (redirect to sign-in).
  - **admin** (`/admin/*`) — wrapped in `<RequireAdmin>` (redirect / show 403 if
    `!isAdmin`).
- Do not rely on hiding nav items. The backend must still enforce its own rules — the guard
  is UI defense, not the only defense.
- Handle the "access pending" state (logged in, no membership, not admin) as its own screen.

### 7. Public careers pages — SEO / page metadata

**Problem.** The public jobs surface is a client-only SPA with one static `<title>`
(`index.html`). It is not indexable by search engines, has no per-page title/preview tags,
no structured data, no sitemap.

**Decision (pragmatic default — revisit only if organic job traffic becomes a goal).**
- Stay a client-side SPA. Do **not** add SSR/Next.js for this.
- Add, for the 2 public routes only:
  1. **Per-page `<title>` + meta description** (React 19 supports `<title>`/`<meta>` in
     components natively; otherwise `react-helmet-async`).
  2. **JSON-LD `JobPosting` structured data** on the public job detail page (this is what
     Google for Jobs reads; you can get listed without SSR).
  3. A **`sitemap.xml`** generated at build listing the public job URLs.
- Note honestly in the ticket: without SSR, ranking is weaker than a server-rendered site.
  If real SEO becomes a priority, the follow-up is to prerender **only** the 2 public routes
  (a build-time prerender step), not to rewrite the whole app.

### 8. Performance / loading (story 13 has no plan)

**Problem.** `routeRegistry.tsx` imports all ~30 pages eagerly. Vite v8 speeds the build,
not the runtime bundle.

**Decision.**
- **Lazy-load every route** with `React.lazy` + a route-level `<Suspense>` fallback. Each
  page becomes a dynamic import → smaller first load.
- **Loading UI = React Query `isPending` + skeleton components.** The current skeleton
  components are a good pattern — keep that style. Do **not** adopt Suspense-for-data yet;
  it complicates the error boundaries. Use Suspense only for route code-splitting.
- Every error state has a Retry (`refetch`).
- Keep the existing `manualChunks` vendor split — it is fine.
- Import icons/components **directly**, not through barrel files, to keep bundles small.

### 9. Dark-only vs. dark + light

**Problem.** The app is dark-only today (`tokens.css` `color-scheme: dark`, neutral
anchored on `#39393a`). shadcn ships light + dark.

**Decision.**
- **Ship dark-only for now.** No theme toggle. It matches the brand and halves the token /
  QA work.
- But structure tokens the shadcn way (semantic tokens, `:root` + `.dark`) so a light theme
  *can* be added later without a rewrite. Set `color-scheme: dark` and define the dark
  values as the active set.

### 10. Screen inventory + cutover criteria

**Problem.** The user stories are themes, not a screen checklist. Some screens are backed
only by fake data and are not even routed. A parallel rewrite silently loses real screens or
rebuilds dead ones.

**Decision — build this table before porting, verify each row against the backend:**

Dead code found now (0 references, not routed) → **delete, do not port:**
- `src/screens/AnalyticsInsightsPage.tsx`
- `src/screens/admin/AccessManagementPage.tsx`
- `src/screens/admin/DataManagementPage.tsx`
- `src/screens/admin/IndexingWorkbenchPage.tsx`
- `src/screens/admin/SystemHealthPage.tsx`
- `src/components/DevPageSwitcher.tsx`

Fake-data-only capabilities (no real backend) → **do not port unless the backend endpoint
exists; otherwise mark "later":** `getAnalytics`, `getDataConnectors`,
`getIndexingWorkbench`, `getAccessRoster`.

Everything else that is routed and backed by a real Edge Function/RPC → **port.** For each,
write it down as keep/drop/later.

**Cutover checklist (define "v2 is ready"):**
- All "keep" routes work against the real backend.
- Brand/visual parity holds (screen composition and control placement, colors, button feel).
- `lint`, `test`, `build` all green; no `any`, no `as` beyond justified exceptions.
- The cPanel SPA rewrite rule (`.htaccess`) is added for clean URLs.
- **Drift policy:** freeze feature work on old `frontend/`; only ship critical fixes there,
  and port each one to `frontend-v2/` so the two do not diverge.

### 11. Test seams beyond the network

**Problem.** "Only fake the network" is not enough. Tests also touch auth, browser storage,
file download, timers, env, and `matchMedia`.

**Decision.** Provide one shared test kit:
- `test/setup.ts` — jsdom, `matchMedia` polyfill, reset storage between tests.
- `renderWithProviders(ui, { route, auth })` — wraps in Router + QueryClient + a **test
  AuthProvider that injects a fake session/memberships** (auth is not MSW'd).
- MSW `server` with per-feature handlers for all network data.
- Vitest **fake timers** for debounce and cache-TTL logic.
- Make file download testable: a pure `toCsv(rows)` function + a concrete `downloadCsv()` browser operation
  you can spy on — do not assert on a real `<a>` click.

### 12. File / binary flows

**Problem.** CV upload, signed-URL fetch (with GCS-vs-Supabase branching,
`platformApi.ts:1022`), and CSV download are not "get JSON + parse with zod" calls, so they
do not fit the standard hook shape.

**Decision.**
- **Signed URLs:** a query/mutation hook calls an Edge Function that returns a URL string;
  the frontend just opens it. Backend owns the GCS-vs-Supabase logic.
- **Uploads:** a mutation hook (`useUploadCv`) posting multipart to an Edge Function or
  Storage; show progress; show clear success/error.
- **CSV export:** split into a **pure** `toCsv(rows)` (unit-tested) and a concrete `downloadCsv()`
  browser operation. Keep both feature-local unless a second real consumer establishes a broader contract. Delete the inline blob/anchor code in `searchState.ts`.

### 13. Config / how to run

**Problem.** Deleting the fake-vs-real switch removes today's "run with no backend" story,
and the required `VITE_*` variables are undocumented. (There is a known trap: `envDir`
points at the repo root, not the frontend folder.)

**Decision.**
- Add a `README` + `.env.example` listing required vars: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, and any real ones kept (`VITE_MANATAL_APP_BASE_URL`). Delete
  dead flags like `VITE_USE_INSIGHTS_PLATFORM_API` (its whole fallback branch is being
  removed).
- Document that `.env` lives at the **repo root** (`envDir: '..'`), because it has bitten
  before.
- If required config is missing in **dev**, show a clear "app is not configured" screen — do
  not silently fall back to anything. In production the config is always present.

### Minor — kill dead dependencies and dead code

- **`framer-motion`** is in `package.json` but **imported nowhere** — delete it. Use
  `tailwindcss-animate` (ships with shadcn) + CSS for animation. Add a motion library again
  only if a specific animation truly needs it.
- Delete the commented-out `DevPageSwitcher` / `DEV_JOB_PAGES` block in
  `src/app/layout/AppShell.tsx`.
- Audit for other unused deps during the scaffold.

---

## Part 3 — Deep-dive cleanups found in the code (patterns to ban)

These are concrete examples of "the current code is wrong". Fix the pattern everywhere, not
just the named file.

### A. Hand-rolled state on top of React Query — `useCandidateShortlist.ts`
This 220-line hook is the anti-pattern to avoid. It has: a manual `pendingKeys` `Set` for
loading state, three near-identical `try/catch/finally` blocks, manual `setQueryData`
optimistic updates copy-pasted three times, `useEffect`s syncing an `error` string, and
`setError(String(nextError))` (raw error leak).
**Decision:** use what React Query already gives — `mutation.isPending`,
`mutation.error`, `mutation.variables`, and optimistic updates via
`onMutate`/`onError`/`onSettled` with rollback. Errors go to the toast/Alert via the message
mapper, never a `String(error)` in state. This hook should lose ~70% of its lines. Apply the
same rule to every feature.

### B. Domain UI grab-bag — `src/components/ui.tsx`
Map each export onto shadcn and delete the hand-rolled versions:
`Panel → Card`, `Tag → Badge`, `ProgressBar → Progress`, `Avatar → Avatar`,
`EmptyState → compose on Card`. Keep `StatCard`, `ScorePill`, `TenantBadge`, `MetricBars`
as small compositions on shadcn primitives, driven by `variant` props — no inline
`style={{...}}` for anything but genuinely dynamic values (bar width, avatar hue).

### C. Boundary-coercion toolkit — `src/lib/api/json.ts`
`asRecord`, `asArray`, `toNumber`, `toStringArray`, `nullableString`, `errorMessage` — this
whole file is the "hedge instead of validate" pattern. **Delete it.** Endpoint-specific Zod
wire schemas replace the coercers; explicit, tested compatibility adapters replace fallback
chains; the message mapper replaces `errorMessage`. The old `mapRemoteX` functions go away,
but necessary legacy translation remains quarantined in feature `api/` folders rather than
being spread through a generic JSON toolkit.

### D. One giant types dump — `src/lib/contracts.ts` (1122 lines)
Split per feature into `features/<domain>/types.ts`, and **derive exported canonical frontend
types from canonical Zod schemas** (`z.infer`). Private wire-schema types may exist inside
`features/<domain>/api/` but never escape into hooks, pages, forms, or components. No
standalone hand-written contract types.

### E. Router chrome hand-matcher — `routeRegistry.tsx`
Delete the hand-written `matchRoutePattern` + `routeChromeForPath` + the parallel
`protectedRoutes.find(...)`. React Router already matches routes; attach `title`/`subtitle`
via each route's `handle` and read them with `useMatches`. Move to `createBrowserRouter`
with nested layout routes and the three guarded groups from point 6.

### F. Hand-rolled global store — `screens/sync-ai/chatStore.ts`
The `useSyncExternalStore` + manual listener set is a tiny reinvented store. Chat state is
**not** cross-route — keep chat messages in the chat feature (React Query for the
request/response, local state for the composer). The only cross-route bit is the sidebar
"unread answer" dot — make that one small Zustand flag or derive it. Delete the custom store.

### G. Inline layout styles — `src/app/layout/AppShell.tsx`
`marginLeft`/`transition` inline styles → CSS classes using spacing/duration tokens.
Ban inline `style` for layout across the rewrite (dynamic values excepted).

### H. Raw error text reaching the UI (7+ places)
`error instanceof Error ? error.message : String(error)` and `String(nextError)` appear in
`PublicJobBoardPage`, `Settings`, `SignInScreen`, `auth.tsx`, `SearchDiscoveryPage`,
`CandidateListingPage`, and the shortlist hook. **All** go through the message mapper. Raw
text is logged, never shown.

### I. God pages (container/presentational split)
`JobPostingEditPage.tsx` (1012 lines) and `JobPostingCreatePage.tsx` (802) mix data
fetching, ~8 `useState` calls, effects, string formatting, and full JSX. Split: a thin
container page (wires React Query + React Hook Form) + presentational children that only
receive props and render. Formatting/transform helpers move to co-located modules.

### J. Half-finished folder migration (`screens/` vs `features/`)
`screens/admin/ParsingLabPage.tsx` and `screens/admin/ParsingDetailPage.tsx` are 1-line
re-export shims pointing at `features/parsing/`. Drop `screens/` entirely; everything lives
in `features/<domain>/{pages,components,hooks,api,types}` or `components/` (shared) or
`components/ui/` (shadcn). Fix the 12+ `../../../` relative imports to the `@/` alias.

---

## Part 4 — Concrete delete list (safe to remove in v2)

Files (dead or fully replaced):
- `src/data/mockData.ts`, `src/lib/api/mockPlatformApi.ts`, `src/features/jobs/jobMocks.ts`
- `src/lib/api/json.ts`, `src/lib/api/countRows.ts`, `src/lib/api/platformRows.ts`
- `src/lib/platformApi.ts`, `src/lib/platformApiTypes.ts` (God Object + its interface)
- `src/lib/contracts.ts` (split into per-feature zod schemas/types)
- `src/components/DevPageSwitcher.tsx`
- `src/screens/AnalyticsInsightsPage.tsx`, `src/screens/admin/AccessManagementPage.tsx`,
  `src/screens/admin/DataManagementPage.tsx`, `src/screens/admin/IndexingWorkbenchPage.tsx`,
  `src/screens/admin/SystemHealthPage.tsx`
- `src/screens/admin/ParsingLabPage.tsx`, `src/screens/admin/ParsingDetailPage.tsx` (shims)
- All `apiMappers.ts` / `reportApiMappers.ts` `mapRemoteX` files (replaced by zod)
- `src/features/search/searchState.ts` storage blob (filters move to URL; keep only `toCsv`)
- The whole `src/styles/` hand-written CSS tree (28 files) → replaced by Tailwind v4 +
  tokens + shadcn.

Dependencies: remove `framer-motion` (unused); remove `pnpm-lock.yaml` (keep npm only).

---

## Part 5 — Recommended target shape (summary)

- **Transport:** `src/lib/api/client.ts` — one wrapper over `functions.invoke`, error
  normalization, successful payload returned as `unknown`. Everything else is per-feature.
- **Per feature:** `features/<domain>/{pages, components, hooks, api, types}`; `api/` holds
  private wire schemas for verified current payloads, explicit wire-to-canonical transforms,
  request encoders, and small React Query modules. Parse and transform inside the query
  function before caching; never normalize wire data in React Query `select` or UI code.
- **Compatibility coverage:** inventory every current alias/fallback chain per endpoint,
  verify variants against backend source or captured responses, define conflict/null rules,
  and test every accepted raw fixture plus malformed/conflicting fixtures. Unknown or
  hypothetical variants fail.
- **Query keys:** always `[domain, scopeKey, ...params]` so tenant/scope changes refetch
  automatically.
- **Forms:** React Hook Form + Zod. Reuse canonical field-schema fragments when semantics
  match; do not couple a form directly to a legacy wire response schema.
- **Tables:** TanStack Table + shadcn table markup.
- **Filters/sort/pagination:** URL `searchParams`, typed + zod-validated.
- **Server state:** React Query. **Forms:** RHF. **Tiny UI state:** Zustand (sidebar +
  transient selection). Nothing else global.
- **Errors:** two error boundaries (app + per route) + one message-mapper + Sonner for
  transient + shadcn `Alert` for blocking. No raw error text, ever.
- **Routing:** `createBrowserRouter`, three guarded groups (public / auth / admin).

---

## Part 6 — Depends on the backend (flag, do not work around)

These need a real endpoint to exist. If it does not, that is a backend ticket — do not add a
direct table read or a fake fallback to paper over it:
- Any capability currently served by a **direct `supabase.from(...)` table read** now needs
  an Edge Function (candidate detail, manatal sync counts, workspace stats, filter facets,
  storage signed URLs).
- Capabilities that are **fake-only today** (analytics, data connectors, indexing workbench,
  access roster) need real endpoints before their screens can be ported — otherwise mark the
  screen "later".
