# 11 — Shortlist

**What to build:** the saved shortlist — add/remove candidates and view the list — that persists across the search, compare, and shortlist views. It is real backend data, handled as backend data, not as a special app-only store.

**Blocked by:** 08.

**Status:** complete

**References:** `../issues/05-architecture-state-conventions.md` amendment, `../spec.md`, `../gaps-and-recommendations.md` Part 3 §A (the 220-line hand-rolled hook is the anti-pattern this replaces).
**Standing rules:** see ticket 01.

- [x] `features/search/` (or a `features/shortlist/` area): shortlist read/add/remove/clear all go through real Edge Functions
- [x] The shortlist is a **React Query resource** — not Zustand. Add/remove use optimistic updates via `onMutate`/`onError`/`onSettled` with rollback, using React Query's own `isPending`/`error`/`variables` (no manual pending-set, no copy-pasted try/catch, no `String(error)` in state)
- [x] Clearing the shortlist uses the shared AlertDialog confirmation (not a native `window.confirm`)
- [x] Errors go through the message mapper to a toast/Alert; raw error text never shown
- [x] Shortlist read/mutation responses use verified wire schemas and adapters that return canonical schemas/types before cache updates; request encoders own current backend key naming; every accepted variant and malformed/conflicting case has a raw fixture test; query keys start with `scopeKey`
- [x] Tests via the shared kit + MSW cover add/remove (including the optimistic update and its rollback on failure) and clear-with-confirmation

## Comments

Implemented on 2026-07-20. The saved shortlist is a scope-keyed React Query resource with strict
snake_case wire parsing, canonical camelCase cache data, exact mutation encoders, optimistic add/remove/clear,
rollback, mapped query/toast errors, a responsive saved-list drawer, and AlertDialog-gated clearing. Search
results expose accessible add/remove actions; CSV export and signed CV opening remain available from the
shortlist UI; the resource is reusable by the later Compare and Chat tickets.

Verified the desktop and 390px tray/drawer renders against the old Search shortlist components. The v2 render
keeps the sticky tray, right-edge full-height drawer, candidate-card composition, and responsive action flow
while using the current semantic tokens and shadcn primitives. Full verification: ESLint passed, all 117 tests
passed, and the production build passed. The repo-wide Prettier check still reports four pre-existing untouched
files; every file changed by this ticket passes Prettier.
