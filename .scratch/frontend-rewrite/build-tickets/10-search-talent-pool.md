# 10 — Search / Talent Pool

**What to build:** the main search screen. A recruiter types a query, applies filters (skills, location, seniority, company), sees ranked results in a proper sortable table, and can preview a candidate — with the filters living in the web address so a search can be shared or refreshed without losing state.

**Blocked by:** 08 (candidate patterns + URL-filter hook established).

**Status:** complete

**References:** `../spec.md`, `../gaps-and-recommendations.md` Part 2 §4, §12. This is a large screen — split into smaller tickets during `/implement` if it doesn't fit one context window.
**Standing rules:** see ticket 01.

- [x] `features/search/`: query + filters run against a real Edge Function and return ranked results
- [x] All filters, sort, and pagination live in the URL via the typed, zod-validated hook — shareable and refresh-safe
- [x] Filter dropdowns use the one shared combobox (no per-domain reimplementation); debounced input tested with fake timers
- [x] Results render in a TanStack-Table-driven table with shadcn markup (sort/paginate); candidate preview opens in the shared Dialog
- [x] CSV export split into a pure `toCsv(rows)` (unit-tested) + a feature-local `downloadCsv()` browser operation — no generic blob helper or inline blob/anchor code
- [x] Search/filter-option wire variants are inventoried, verified, and fixture-tested; private adapters return only canonical camelCase schemas/types before caching. Malformed/conflicting payloads → error + Retry; loading → skeletons; valid empty result → empty state; query keys start with `scopeKey`
- [x] Tests via the shared kit + MSW cover a search, a filter reflected in the URL, sorting, and the empty/error paths
