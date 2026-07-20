# Architecture & state-management conventions

Type: grilling
Status: resolved
Blocked by: 02

## Question

Decide the target frontend architecture, building on the UI library choice from [UI library & component approach](02-ui-library-component-approach.md) (shadcn's CLI has its own opinion on where `components/ui/` lives, which feeds this).

Current state: `components/` vs. `screens/` vs. `features/` is a half-finished migration — e.g. `screens/admin/ParsingLabPage.tsx` is now just a 1-line re-export shim pointing at `features/parsing/pages/ParsingLabPage.tsx`, so two parallel organizational schemes coexist. No container/presentational separation exists — e.g. `JobPostingEditPage.tsx` is 1,012 lines mixing string-formatting helpers, ~8+ `useState` calls, `useEffect` data loading, and full JSX in one file. 52 files each define their own local `XxxProps` type inline with no shared convention. A `@/` path alias exists in `tsconfig.app.json` but 12+ files still use `../../../` relative chains instead. No global client-state library exists today beyond `@tanstack/react-query` for server state.

Decide:

- Finish or reverse the `components/`/`screens/`/`features/` migration into one convention.
- A container/presentational separation convention.
- Formalize React Query as the standard data-fetching approach everywhere.
- Scope client-state adoption — standing preference (see map Notes) is to lean toward **Zustand**: what moves to it (e.g. modal-open state, filters, theme) vs. what stays as local component state.
- Settle the `@/` alias vs. relative-import convention.

**Standing constraint from [UI library & component approach](02-ui-library-component-approach.md):** the container/presentational split must line up with the styling discipline settled there — presentational components own page layout and compose stock shadcn primitives plus shared composites; containers pass data and select semantic variants, never construct or pass down styling APIs.

## Answer

**Folder structure**: `screens/` is dropped entirely (confirmed) — it was already dying, and greenfield in `frontend-v2/` there's no reason to keep two parallel schemes. Three tiers:

- `components/ui/` — shadcn primitives only, owned by the shadcn CLI (per ticket 02).
- `components/` — shared, domain-agnostic composites used by 2+ features (`StatCard`, `EmptyState`, `PageHeader`, etc. — the ones ticket 02 identified as compositions on top of shadcn primitives, not primitives themselves).
- `features/<domain>/{pages, components, hooks, api, types}` — everything feature-specific. The `api/` folder is new relative to the current partial pattern: React Query hooks live there instead of data-fetching calls scattered inline in components/pages.

**Container/presentational convention**: formalized, not just recommended. A "page" file wires up data (React Query hooks, Zustand selectors, `useForm`) and renders presentational children — it does not itself contain form-field-level JSX or ad hoc state beyond what's needed to wire the above together. `JobPostingEditPage.tsx` is the concrete counter-example this fixes: its 1,012 lines mixing string formatting + ~15 `useState`/`useEffect` calls + full JSX collapses to a thin container once form state moves to React Hook Form. Keep formatting and transforms local until they have independently testable behavior or two real consumers; then extract a cohesive, specifically named co-located module such as `jobForm.ts`. Generic `*.logic.ts`/`*.utils.ts` dumping grounds are not an architecture.

**React Query**: formalized as the only server-state mechanism — no raw `useEffect` + fetch. Every feature's `api/` folder holds its query/mutation hooks (e.g. `useJobPosting(id)`, `useSaveJobPosting()`). Currently only 12 files use `useQuery`/`useMutation` despite the library being installed; this closes that gap as a hard rule, not a preference.

**Forms — React Hook Form + Zod, fully adopted** (per your steer, researched against the official docs): every form uses `useForm({ resolver: zodResolver(schema) })`, wired through shadcn's own `Form`/`FormField`/`FormControl`/`FormMessage` primitives (shadcn ships this integration natively — consistent with ticket 02's "maximize shadcn coverage" rule). The Zod form schema is the single source of truth for form input, replacing both manual `useState` fields and hand-written validators like `validateJobForm`. Canonical domain field-schema fragments may be reused when their semantics match, but forms never depend on a legacy wire response schema; [API layer isolation](06-api-layer-isolation.md) owns wire parsing and request encoding.

**Tables — TanStack Table, fully adopted**: headless (`useReactTable` supplies sorting/filtering/pagination/selection logic), rendered through shadcn's `<Table>` markup primitive via `flexRender` — the standard pairing per TanStack's and shadcn's own docs. Replaces hand-rolled table logic (e.g. `CandidateResultTable.tsx`) the same way ticket 02's combobox consolidation replaced hand-rolled dropdown logic. New dependencies for this ticket's decisions: `react-hook-form`, `zod`, `@hookform/resolvers`, `@tanstack/react-table` — none currently in `package.json`.

**Zustand — scoped, not global-by-default**: only cross-route/cross-component UI state that doesn't belong to the server moves here — candidate shortlist/selection state (currently `useCandidateShortlist.ts`, needs to persist across search → compare → shortlist), active search filters (persist across navigation), and sidebar/nav collapse state. Everything else stays local or moves to the mechanisms above: form state → React Hook Form, tab selection → local `useState`, single-component modal open/closed → local `useState`, table sort/filter state → TanStack Table.

**`@/` alias**: mandatory everywhere in `frontend-v2/`; no `../../../` relative chains. Not a preference, a lint-enforced rule (ties into [Testing, lint, prettier & build tooling](04-testing-lint-prettier-build-tooling.md)).

**Local `XxxProps` types** (finding #19): not banned outright — colocating a component's prop type above its definition is a normal, idiomatic React/TS pattern. The actual problem finding #19 pointed at (same shape redeclared everywhere) is resolved as a side effect of the shared `components/` composite layer and the shadcn primitive layer existing at all — there's no separate rule needed here.

## Amendment — state-ownership reversal (from the gaps-and-recommendations review)

The Zustand scoping above was **narrowed further** after a later review (`gaps-and-recommendations.md`). Two things move OUT of Zustand:

- **Filters, sort, pagination, and selected tab → the URL** (`searchParams`), via one typed, zod-validated hook — not Zustand. This single mechanism satisfies both "filters survive navigation" and "shareable/refreshable URLs," which pulled against each other under the original plan. The current `sessionStorage`/`localStorage` filter-juggling is deleted, not migrated.
- **The shortlist → React Query**, not Zustand. It is persisted in the backend, so it is server data by definition — a React Query resource with optimistic updates via `onMutate`/`onError`/`onSettled`, not a client-state store. (The current `useCandidateShortlist.ts` — a 220-line hand-rolled optimistic layer on top of React Query with a manual pending-set and raw `String(error)` leaks — is the specific anti-pattern this replaces.)

**Zustand's remaining scope shrinks to almost nothing**: the sidebar-collapsed flag (or just `localStorage`) and the transient multi-select set used for Compare. Any hand-rolled global store (e.g. the `useSyncExternalStore`-based chat store) is also deleted — chat state is not cross-route, so it lives in the chat feature (React Query for the request/response, local state for the composer).

Also added in that review and folded into the spec, not re-litigated here: types derived from zod via `z.infer` (no standalone hand-written contract types); a small rebuilt auth/tenant-scope context with a `scopeKey` that prefixes every query key (replacing the blunt cache-clear-on-any-auth-change; full clear retained for sign-out only); three guarded route groups (public / authenticated / admin) closing the current missing-admin-route-guard security gap; all data through Edge Functions (no direct table reads); Recharts via shadcn's chart component; per-route lazy loading; and the file/binary flow shapes. See `spec.md` and `gaps-and-recommendations.md` for the full set.
