# Screen Inventory — Keep / Drop / Later (Ticket 02)

Status: for-agent — binding porting map for every feature ticket and the cutover ticket (19).
Also the layout-parity reference required by ticket 01's standing rules: each row's
`Screen (file)` column is the exact old-app file whose real CSS layout the corresponding
new-stack screen must be built to match (see `issues/01-rewrite-strategy.md`, "Layout,
specifically").

Verified against the actual backend on 2026-07-19: every route in
`src/app/routeRegistry.tsx`, every screen file under `src/screens/` and
`src/features/*/pages/`, every method on `platformApi` (`src/lib/platformApi.ts`),
and every `action` branch actually implemented in `supabase/functions/platform/index.ts`
(plus the standalone functions `search`, `search-debug`, `compare`, `ask`, `agent`,
`public-jobs`, confirmed to exist as their own `supabase/functions/*` directories).

**Headline finding:** the "direct table reads" problem described in
`gaps-and-recommendations.md` Part 2 §2 / Part 6 is **already fixed** in the current
`frontend/` — commit `4c05ba1` ("route data access through Edge Functions only", #42)
removed `countRows.ts`/`platformRows.ts` `.from(...)` calls before this audit ran. A
repo-wide grep for `supabase.from(`/`.from("` across `src/` turned up zero hits. **No row
below is flagged "needs an Edge Function"** — every kept capability already goes through
either a named Edge Function (`invokeFunction`) or the `platform` aggregator Edge Function
(`invokePlatform`, single POST with `{action, ...body}`, dispatched in
`supabase/functions/platform/index.ts`). `platformRows.ts` today only holds row *types*, not
queries — still fine to delete per the God-Object cleanup, just not for the "direct read"
reason originally given.

**Second headline finding:** no currently-*routed* screen is fake-data-only. The four
fake-only `platformApi` methods (`getAnalytics`, `getDataConnectors`,
`getIndexingWorkbench`, `getAccessRoster`) only back screens that are already unrouted
dead code, so there are **zero "later" rows** — everything is a clean keep or a clean drop.
That said, if any of those four capabilities are wanted in v2, they need a real backend
endpoint first (none exists today, not even a stub action in `platform/index.ts`).

---

## Keep — routed, backed by a real Edge Function

Every row's backend column names the exact `action` (dispatched in
`supabase/functions/platform/index.ts`) or the standalone Edge Function
(`supabase/functions/<name>/`) the screen depends on.

### Search / Talent pool (ticket 10)

| Route | Screen (file) | Backend |
|---|---|---|
| `/search` | `src/screens/search-discovery/SearchDiscoveryPage.tsx` | `search` fn; `search_filter_options`, `workspace_stats` actions |
| `/admin/search-simulator` | `src/screens/SearchConfigurationPage.tsx` (data via `src/features/search-configuration/hooks/useSearchSimulator.ts`) | `search-debug` fn; `search_filter_options` action |

### Candidates (tickets 08/09)

| Route | Screen (file) | Backend |
|---|---|---|
| `/candidates` | `src/features/candidates/pages/CandidateListingPage.tsx` (imported via `@/features/candidates`) | `candidates_list` action |
| `/dossier/:candidateId` | `src/screens/CandidateDossierPage.tsx` | `candidate_detail` action (also feeds `getManatalCandidateId`, `getOriginalDocumentUrl` → `original_document_url` action) |

### Shortlist (ticket 11 — embedded, not a standalone route)

| Capability | Current home (file) | Backend |
|---|---|---|
| Add/remove/clear/view shortlist, used from Search, Compare, and Chat scoping | `src/features/search/hooks/useCandidateShortlist.ts` (+ `ShortlistDrawer.tsx`, `ShortlistTray.tsx`) | `shortlist_items`, `save_shortlist_item`, `delete_shortlist_item`, `clear_shortlist_items` actions |

The **anti-pattern hook itself** (`useCandidateShortlist.ts`, 220 lines, manual
`pendingKeys`/`try-catch`/`setError(String(...))`) is real data and must be ported as a
*capability*, but per `gaps-and-recommendations.md` Part 3 §A the implementation is
rebuilt on React Query mutations, not copied.

### Jobs (tickets 13/14)

| Route | Screen (file) | Backend |
|---|---|---|
| `/jobs` | `src/screens/JobPostingsPage.tsx` → `JobPostingsPage` | `job_postings` action |
| `/jobs/new` | → `JobPostingCreatePage` | `save_job_posting`, `extract_job_posting` actions |
| `/jobs/:jobId/edit` | → `JobPostingEditPage` | `job_posting`, `save_job_posting` actions |
| `/jobs/:jobId` | → `JobPostingDetailPage` | `job_posting`, `job_applications`, `update_job_application_status`, `job_shortlists`, `job_shortlist`, `save_job_shortlist` actions |
| `/jobs/:jobId/runs/:runId` | → `JobMatchingRunPage` | `start_job_matching_run`, `matching_runs`, `matching_run` actions |

### Compare (ticket 12)

| Route | Screen (file) | Backend |
|---|---|---|
| `/compare` | `src/screens/IntelligentComparisonPage.tsx` | `compare` fn |

Note: `compare` and `ask` (below) both have a **silent mock fallback on any Edge Function
error** in `platformApi.ts` today — real path exists and is the one to port; the fallback
is exactly the "Part 0 rule 2" violation to delete, not a sign the capability is fake.

### Chat / SYNC AI (ticket 16)

| Route | Screen (file) | Backend |
|---|---|---|
| `/chat` | `src/screens/sync-ai/index.tsx` → `IntelligenceHubPage` | `ask` fn, `agent` fn |

`public/ai-answer-done.mp3` is a referenced asset (played via `new Audio(...)` in
`src/screens/sync-ai/index.tsx:175`) — port as-is alongside this screen.

### Insights (ticket 15)

| Route | Screen (file) | Backend |
|---|---|---|
| `/insights` | `src/screens/InsightsDashboardPage.tsx` | `insights_dashboard`, `insights_gap_analysis`, `start_insight_report`, `insight_report_runs`, `insight_report_run` actions |

**Do not confuse this with the dead `AnalyticsInsightsPage.tsx`** (see Drop, below) — the
old `/analytics` path now redirects here (`routeRegistry.tsx`); "Insights" (real) and
"Analytics" (dead+fake) are two differently-named things that happen to sound alike.
`startInsightReport` also has a client-side heuristic fallback
(`buildMockInsightReport`) when the real call fails — same "delete the silent fallback"
rule as Compare/Ask above.

### Public careers (ticket 07)

| Route | Screen (file) | Backend |
|---|---|---|
| `/careers` | `src/screens/PublicJobBoardPage.tsx` | `public-jobs` fn, action `list` |
| `/careers/:slug` | `src/screens/PublicJobBoardPage.tsx` → `PublicJobDetailPage` | `public-jobs` fn, actions `detail`/`apply` |

### Settings (ticket 17)

| Route | Screen (file) | Backend |
|---|---|---|
| `/settings` | `src/screens/Settings.tsx` | Supabase auth session/membership state via `useAuth` (`src/lib/auth.tsx`) — not `platformApi` |

### Admin suite (ticket 18)

| Route | Screen (file) | Backend |
|---|---|---|
| `/admin`, `/admin/dashboard` | `src/screens/admin/PlatformAdminDashboardPage.tsx` | `workspace_stats`, `parsing_overview`, `parser_profiles` actions |
| `/admin/accounts` | `src/screens/admin/AccountProvisioningPage.tsx` | `list_admin_tenants`, `create_tenant_account`, `add_user_to_tenant` actions (platform-admin gated server-side) |
| `/admin/settings` | `src/screens/admin/PlatformRuntimeSettingsPage.tsx` | `get_platform_runtime_config`, `save_platform_runtime_config` actions (platform-admin gated) |
| `/admin/alerts` | `src/screens/admin/OpsAlertsPage.tsx` | `ops_alerts`, `ops_ack_alert` actions |
| `/admin/manatal-sync` | `src/screens/admin/ManatalSyncStatusPage.tsx` | `manatal_sync_status` action |
| `/admin/parsing` | `src/screens/admin/ParsingOverviewPage.tsx` | `parsing_overview` action |
| `/admin/parsing/lab` | `src/features/parsing/pages/ParsingLabPage.tsx` (imported via `@/features/parsing`) | `parser_profiles`, `save_parser_profile`, `publish_parser_profile` actions |
| `/admin/parsing/:documentId` | `src/features/parsing/pages/ParsingDetailPage.tsx` (imported via `@/features/parsing`) | `parsing_document` action |

Route-level admin authorization is genuinely missing today (no `RequireAdmin` guard in
`routeRegistry.tsx` — see `gaps-and-recommendations.md` Part 2 §6); that's a build
requirement for ticket 06/18, not a keep/drop question — all these screens are otherwise
real and are ported.

### Auth screens (not in `routeRegistry` — rendered directly by `AuthGate`, ticket 06)

| Screen (file) | Role |
|---|---|
| `src/screens/auth/SignInScreen.tsx` | No session |
| `src/screens/auth/PasswordRecoveryScreen.tsx` | `passwordRecovery` state |
| `src/screens/auth/AccessPendingScreen.tsx` | Session but no membership and not admin |
| `src/screens/auth/LoadingScreen.tsx` | Auth state resolving |
| `src/screens/auth/AuthShell.tsx` | Shared layout used by the three screens above (not standalone) |

**Redirect aliases only, not distinct screens** (keep the redirects, nothing to port beyond
the route the alias points at): `search-config → /admin/search-simulator`,
`intelligence → /chat`, `analytics → /insights`.

---

## Drop — confirmed dead, delete rather than port

The six files `gaps-and-recommendations.md` Part 2 §10 / Part 4 already named, all
re-confirmed unrouted and unreferenced:

- `src/screens/AnalyticsInsightsPage.tsx` — unrouted; only backed by `getAnalytics`, which is
  mock-only (no Edge Function action exists for it at all)
- `src/screens/admin/AccessManagementPage.tsx` — unrouted; `getAccessRoster` is mock-only
- `src/screens/admin/DataManagementPage.tsx` — unrouted; `getDataConnectors` is mock-only
- `src/screens/admin/IndexingWorkbenchPage.tsx` — unrouted; `getIndexingWorkbench` is mock-only
- `src/screens/admin/SystemHealthPage.tsx` — unrouted. Note: unlike the three above, its
  backend action (`system_health`) **is real and implemented** server-side
  (`supabase/functions/platform/index.ts` case `"system_health"`) — but zero screens or nav
  items call `getSystemHealth()`, so it's still dead UI. If system health monitoring is
  wanted in v2, the backend piece already exists; only the screen needs building (a "later"
  case would not apply — flag as a possible future feature request to the user, don't
  silently rebuild it).
- `src/components/DevPageSwitcher.tsx` — unrouted, already commented out in
  `src/app/layout/AppShell.tsx` (`DEV_JOB_PAGES` block)

**Two additional dead files found in this audit, not in the original six** (same
half-migration re-export-shim pattern gaps-and-recommendations.md Part 3 §J already named
for Parsing — it exists in two more places):

- `src/screens/CandidateListingPage.tsx` — a 1-line shim (`export { CandidateListingPage }
  from "@/features/candidates"`) that nothing imports; `routeRegistry.tsx` imports the real
  component directly from `@/features/candidates`. Delete the shim; the real page (listed
  under Keep, above) is unaffected.
- `src/screens/admin/ParsingLabPage.tsx` and `src/screens/admin/ParsingDetailPage.tsx` — the
  two shims Part 3 §J already flagged; re-confirmed unreferenced (`routeRegistry.tsx` imports
  both directly from `@/features/parsing`).

**One further dead file, a full orphaned screen, not previously found:**

- `src/screens/shortlist/ShortlistPage.tsx` (249 lines) — a standalone shortlist page using
  `localStorage` (`sync-shortlist-ids`) via its own `getShortlistIds`/`saveShortlistIds`
  helpers. Zero references anywhere in `src/` — not routed, and its helpers are not imported
  by the real shortlist implementation (`useCandidateShortlist.ts`, which is backend-backed
  and is the one to port — see Keep → Shortlist, above). This is a leftover from before the
  shortlist moved to real backend storage; delete it, do not port any part of it.

---

## Later — fake-data-only capability, no backend, not currently routed

None. The four fake-only `platformApi` methods (`getAnalytics`, `getDataConnectors`,
`getIndexingWorkbench`, `getAccessRoster`) only back the dead pages listed under Drop, so
there is nothing routed left in "later" limbo. If a future ticket wants any of these four
capabilities in v2, treat it as net-new scope requiring a net-new backend endpoint — do not
resurrect the deleted mock or the deleted page as a starting point.

---

## Needs an Edge Function (direct table reads)

None. See the headline finding at the top of this document — commit `4c05ba1` already
migrated every capability off direct `supabase.from(...)` reads before this audit ran.

---

## Asset inventory

`src/assets/` has 61 files today; a repo-wide reference check (every `.ts`/`.tsx` import of
an `assets/*` path, cross-checked against the Drop list above — none of the dead screens
reference any asset) found exactly **46 referenced**, matching
`additional-scan-findings.md` §2's count. **Port only the 46 referenced ones**, renamed to
kebab-case; the 15 unreferenced ones below are dropped, not ported "just in case."

### Port (46, referenced by a kept screen) — rename to kebab-case, replace with Lucide where equivalent

Every one of these is a generic UI icon with a direct `lucide-react` equivalent except the
one raster brand mark — per `gaps-and-recommendations.md` Part 2 §2, prefer Lucide over a
bespoke SVG wherever the icon isn't the brand itself. Exact Lucide icon choice is a
feature-ticket-level detail (pick the closest semantic match when building each screen); the
inventory obligation here is just: don't reflexively port an icon Lucide already covers.

| Current filename | Kebab-case rename | Lucide replaces it? |
|---|---|---|
| `ai_filled.svg` / `ai_outlined.svg` | `ai-filled.svg` / `ai-outlined.svg` | Yes (e.g. `Sparkles`/`Bot`) |
| `arrow_drop_down.svg` | `arrow-drop-down.svg` | Yes (`ChevronDown`) |
| `arrow_up.svg` | `arrow-up.svg` | Yes (`ArrowUp`/`ChevronUp`) |
| `card_view.svg` / `card_view_filled.svg` / `card_view_outlined.svg` | `card-view.svg` / `card-view-filled.svg` / `card-view-outlined.svg` | Yes (`LayoutGrid`) — collapse the filled/outlined/plain triplet to one Lucide icon |
| `check.svg` / `check_circle_primary.svg` | `check.svg` / `check-circle-primary.svg` | Yes (`Check`/`CheckCircle2`) |
| `chevron_up.svg` | `chevron-up.svg` | Yes (`ChevronUp`) |
| `circle_down.svg` | `circle-down.svg` | Yes (`ChevronDown`/`ArrowDownCircle`) |
| `clock.svg` | `clock.svg` | Yes (`Clock`) |
| `close.svg` | `close.svg` | Yes (`X`) |
| `company.svg` | `company.svg` | Yes (`Building2`) |
| `delete.svg` | `delete.svg` | Yes (`Trash2`) |
| `draft.svg` | `draft.svg` | Yes (`FileEdit`/`FileText`) |
| `edit_note.svg` | `edit-note.svg` | Yes (`PenLine`) |
| `find_matches.svg` | `find-matches.svg` | Yes (`Target`/`Sparkles`) |
| `group_filled.svg` / `group_outlined.svg` | `group-filled.svg` / `group-outlined.svg` | Yes (`Users`) |
| `insights.svg` | `insights.svg` | Yes (`LineChart`/`BarChart3`) |
| `job-posting.svg` variants used: `job-posting-filled.svg`, `job-posting-outlined.svg` | already kebab-case | Yes (`Briefcase`/`BriefcaseBusiness`) |
| `language.svg` | `language.svg` | Yes (`Globe`) |
| `list_view.svg` variants used: `list_view_filled.svg`, `list_view_outlined.svg` | `list-view-filled.svg` / `list-view-outlined.svg` | Yes (`List`) |
| `location_filled.svg` / `location_outlined.svg` | `location-filled.svg` / `location-outlined.svg` | Yes (`MapPin`) |
| `logo-white2-scaled.png` | `logo.png` (or re-export as brand SVG if design provides one) | **No** — brand mark, keep as a real asset |
| `mail.svg` | `mail.svg` | Yes (`Mail`) |
| `network_error.svg` | `network-error.svg` | Yes (`WifiOff`) |
| `open_link.svg` | `open-link.svg` | Yes (`ExternalLink`) |
| `password.svg` | `password.svg` | Yes (`Lock`) |
| `remove.svg` | `remove.svg` | Yes (`Minus`) |
| `save.svg` | `save.svg` | Yes (`Save`) |
| `search.svg` | `search.svg` | Yes (`Search`) |
| `seniority_filled.svg` / `seniority_outlined.svg` | `seniority-filled.svg` / `seniority-outlined.svg` | Yes (`TrendingUp`/`Star`) — also fixes the `senirotiy` typo for free since only the dead misspelled duplicate is dropped |
| `shield.svg` | `shield.svg` | Yes (`Shield`/`ShieldCheck`) |
| `skills_filled.svg` / `skills_outlined.svg` | `skills-filled.svg` / `skills-outlined.svg` | Yes (`GraduationCap`/`Award`) |
| `status.svg` | `status.svg` | Yes (`Activity`/`CircleDot`) |
| `thread.svg` | `thread.svg` | Yes (`MessageSquare`) |
| `visibility_off.svg` / `visibility_on.svg` | `visibility-off.svg` / `visibility-on.svg` | Yes (`EyeOff`/`Eye`) |
| `workspace.svg` | `workspace.svg` | Yes (`Building`/`LayoutDashboard`) |

Also referenced, outside `src/assets/` (served from `public/`, no rename needed — already
flat public paths, not imports):

| File | Used by |
|---|---|
| `public/favicon.svg` | `index.html` |
| `public/ai-answer-done.mp3` | `src/screens/sync-ai/index.tsx` (Chat / SYNC AI, ticket 16) |

### Drop (15, unreferenced anywhere in `src/`, `public/`, or `index.html`)

- `bookmark_filled.svg`, `bookmark_outlined.svg`
- `dashboard_filled.svg`, `dashboard_outlined.svg`
- `job-posting.svg` (the un-suffixed triplet member; the filled/outlined variants above are
  the ones actually used)
- `list_view.svg` (same pattern — only the filled/outlined variants are used)
- `logo-scaled.png` (superseded by `logo-white2-scaled.png`, the one actually referenced)
- `logout.svg`
- `mic.svg`
- `panel_close.svg`, `panel_open.svg`
- `senirotiy_outlined.svg` (the misspelled dead duplicate of `seniority_outlined.svg`)
- `settings_filled.svg`, `settings_outlined.svg`
- `sync-logo.svg` (superseded by `logo-white2-scaled.png`)

---

## Cutover checklist

Unchanged from `gaps-and-recommendations.md` Part 2 §10 — repeated here so this file is a
complete, standalone reference for ticket 19:

- All "keep" routes above work against the real backend.
- Brand/visual parity holds (colors, button feel).
- `lint`, `test`, `build` all green; no `any`, no `as` beyond justified exceptions.
- The cPanel SPA rewrite rule (`.htaccess`) is added for clean URLs.
- **Drift policy:** freeze feature work on old `frontend/`; only ship critical fixes there,
  and port each one to `frontend-v2/` so the two do not diverge.
