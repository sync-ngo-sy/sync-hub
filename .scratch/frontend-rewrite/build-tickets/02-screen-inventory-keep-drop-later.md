# 02 — Screen inventory: keep / drop / later table

**What to build:** a verified checklist of every screen and capability in the current `frontend/`, each marked **keep** (routed and backed by a real backend endpoint — port it), **drop** (dead code, nothing links to it — delete, do not port), or **later** (only ever shows fake data because the backend piece doesn't exist yet — do not rebuild against a mock). This is the porting map the feature tickets follow so we never rebuild a dead or fake-only screen.

**Blocked by:** None — can start immediately (parallel to ticket 01).

**Status:** ready-for-agent

**References:** `../spec.md`, `../gaps-and-recommendations.md`, and `../additional-scan-findings.md` (all binding); the delete list in `gaps-and-recommendations.md` Part 4 and the inventory guidance in Part 2 §10 are the starting point — verify each row against the actual backend, don't just copy.
**Standing rules:** see ticket 01.

- [x] Every current screen/route listed with a keep/drop/later verdict, each verified against the real backend (a routed screen with a real Edge Function/RPC → keep; unreferenced/unrouted → drop; fake-data-only with no real endpoint → later)
- [x] Confirmed-dead files explicitly named for deletion (e.g. the unrouted analytics/access-management/data-management/indexing-workbench/system-health screens, the dev page switcher, the re-export shim pages)
- [x] Fake-only capabilities with no backend (analytics, data connectors, indexing workbench, access roster) marked "later" with the missing backend endpoint noted
- [x] Capabilities currently served by direct table reads flagged as "needs an Edge Function" (a backend task), not silently ported as direct reads
- [x] Asset inventory records every referenced asset needed by a kept screen; only referenced custom assets are ported, ported filenames are kebab-case, dead/redundant assets are excluded, and Lucide replaces custom icons where equivalent
- [x] Output saved as a durable table in the feature folder so later feature tickets and the cutover ticket can read it

## Comments

Implemented on branch `frontend-refactor`. Full output at `../screen-inventory.md` (verified 2026-07-19 against `routeRegistry.tsx`, `src/screens/`, `src/features/*/pages/`, `platformApi.ts`, and every `action` branch in `supabase/functions/platform/index.ts`).

Two headline findings, both explicitly justified rather than left as gaps:
- **Zero "later" rows.** The four fake-only `platformApi` methods (`getAnalytics`, `getDataConnectors`, `getIndexingWorkbench`, `getAccessRoster`) only back screens that are already unrouted dead code — nothing routed is fake-data-only.
- **Zero "needs an Edge Function" rows.** The direct-table-reads problem was already fixed by commit `4c05ba1` (#42) before this audit ran; a repo-wide grep for `supabase.from(`/`.from("` found no hits.

Also found 3 additional dead files beyond the original 6 named in `gaps-and-recommendations.md`: a `CandidateListingPage.tsx` re-export shim, the `ParsingLabPage.tsx`/`ParsingDetailPage.tsx` shims, and an orphaned `localStorage`-based `ShortlistPage.tsx`. Asset inventory: 46 of 61 assets in `src/assets/` are referenced and ported (kebab-cased, Lucide substituted where equivalent); 15 unreferenced ones dropped.
