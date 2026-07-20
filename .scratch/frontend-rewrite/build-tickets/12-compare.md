# 12 — Compare

**What to build:** the side-by-side comparison screen — pick a few candidates and see a grounded comparison of their overlap and gaps.

**Blocked by:** 11 (uses the shortlist/selection).

**Status:** complete

**References:** `../spec.md`, `../gaps-and-recommendations.md` Part 2 §4 (the transient multi-select set is one of the few things allowed in Zustand).
**Standing rules:** see ticket 01.

- [x] `features/compare/`: the comparison runs against a real Edge Function for a chosen set of candidates
- [x] The set of candidates being compared is carried in the URL (`?ids=`) so a comparison is shareable/refresh-safe; the transient multi-select set used to build it is the one acceptable small piece of Zustand (losing it on refresh is acceptable, or back it with `sessionStorage`)
- [x] Compare wire variants are verified and fixture-tested; the private adapter produces only the canonical camelCase comparison schema/type before caching. Malformed/conflicting payloads → error + Retry; loading → skeleton; valid empty/too-few-selected → clear guidance state
- [x] Query keys start with `scopeKey`
- [x] Tests via the shared kit + MSW cover a comparison of a selected set and the too-few-selected path

## Comments

Implemented on 2026-07-20 on branch `frontend-refactor`.

The comparison is a scope-keyed React Query resource (`[scopeKey, 'comparison', {…}]`) hitting the real
`compare` Edge Function; the silent mock fallback from the old `platformApi.ts` was deliberately **not**
ported (screen-inventory Part 0 rule 2). The private adapter (`compareApi.ts`) parses both **verified**
wire variants via a `source` discriminated union — the flat `deterministic_fallback` path and the nested
`cached_artifact` path — and emits only canonical camelCase (`comparisonSchema`) before caching. The
cached-artifact body was verified against where it is actually written
(`worker/.../supabase.py` → `dataclass_to_dict(ComparisonArtifact)`), which confirmed cached items carry
**no** dossier detail; the canonical model makes that explicit as `item.detail: null` instead of inventing
`"Unknown candidate"` values the way the old mapper did. `recommended_candidate_id: ""` maps to `null`.
Conflicting/unknown-source/malformed payloads throw → mapped error + Retry. The compatibility inventory's
`compare` section was updated to record this verification.

Both the compared set (`?ids=`) and the required skills (`?skills=`) live in the URL, so a comparison is
fully shareable and refresh-safe. The transient multi-select set used to build a new comparison is
component-local `useState` in the selection dialog (lost-on-refresh is acceptable per §4) — this satisfies
the "one acceptable small piece of transient UI state" intent without pulling in Zustand at all.

States: skeleton while loading, mapped error + Retry on failure, clear guidance empty states for
too-few-selected (backend not called below two) and for a comparison that returns too few comparable
candidates. Layout parity checked against `frontend/src/screens/IntelligentComparisonPage.tsx`: required-
skills panel, primary-colored recommended hero banner, responsive candidate grid, and the overlap /
decision-support pair, rebuilt on the token + shadcn stack.

Verification: ESLint, all 140 tests (33 files), production build, and Prettier all pass. Ran `/code-review`
(Standards + Spec). Spec axis: clean. Standards axis: fixed the real duplication it found — extracted the
comma-separated URL splitter to `lib/url/commaSeparatedValues.ts` (now shared by search + compare),
extracted the candidate role label to `features/search/candidateRoleLabel.ts` (shared by search results,
the shortlist drawer, and the compare dialog — removing a drifted placeholder string), and de-duplicated
the chat-href builder within the page.
