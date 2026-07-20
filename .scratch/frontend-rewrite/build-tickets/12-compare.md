# 12 — Compare

**What to build:** the side-by-side comparison screen — pick a few candidates and see a grounded comparison of their overlap and gaps.

**Blocked by:** 11 (uses the shortlist/selection).

**Status:** ready-for-agent

**References:** `../spec.md`, `../gaps-and-recommendations.md` Part 2 §4 (the transient multi-select set is one of the few things allowed in Zustand).
**Standing rules:** see ticket 01.

- [ ] `features/compare/`: the comparison runs against a real Edge Function for a chosen set of candidates
- [ ] The set of candidates being compared is carried in the URL (`?ids=`) so a comparison is shareable/refresh-safe; the transient multi-select set used to build it is the one acceptable small piece of Zustand (losing it on refresh is acceptable, or back it with `sessionStorage`)
- [ ] Compare wire variants are verified and fixture-tested; the private adapter produces only the canonical camelCase comparison schema/type before caching. Malformed/conflicting payloads → error + Retry; loading → skeleton; valid empty/too-few-selected → clear guidance state
- [ ] Query keys start with `scopeKey`
- [ ] Tests via the shared kit + MSW cover a comparison of a selected set and the too-few-selected path
