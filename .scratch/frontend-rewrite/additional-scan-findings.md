# Additional Scan Findings — Frontend

Status: binding-for-agent
Binding companion to `gaps-and-recommendations.md`. These are issues found in a fresh pass that
are **not** already captured there. Same operating stance: current `frontend/` is
disposable; each item is a pattern to fix across the whole codebase, not just the named file.

> **API response compatibility is not blocked on a backend cleanup.** `frontend-v2` uses
> canonical camelCase frontend schemas and types. Each feature's private `api/` adapter owns
> the backend's verified current wire shape, including necessary snake_case/camelCase or
> legacy-name variants, and transforms it before React Query caches the result. The shared
> transport stays domain-blind and returns `unknown`; it never performs global key conversion.
> Every accepted alias requires an inventory entry, defined conflict/null semantics, and a
> raw fixture test. Later backend cleanup changes only wire schemas, transforms, request
> encoders, and fixtures.

---

## 1. File naming has no standard

**Problem.** Three unrelated conventions coexist and no rule is written down.
- `.ts`/`.tsx` files (excluding assets): **97 PascalCase, 52 camelCase, 0 kebab-case**.
- A third, dot-segmented convention for helper/constant modules:
  `SearchDiscoveryPage.helpers.tsx`, `searchSimulator.constants.ts`,
  `searchSimulator.helpers.ts`, `insightReport.helpers.ts`, `insightsDashboard.helpers.ts`.
- Directories mix kebab-case (`search-configuration`, `search-discovery`, `sync-ai`,
  `search-simulator`) with single-word (`candidates`, `jobs`, `insights`, `parsing`).

The existing docs lock the `@/` alias and the `features/<domain>/{pages,components,hooks,api,types}`
folder shape, but never pick a **file**-naming rule.

**Decision (accepted).**
- **Component files** (anything default-exporting a React component): `PascalCase.tsx`.
- **Everything else** (hooks, helpers, api, stores, types, utils): `camelCase.ts`.
  - Hooks keep the `useX.ts` form (already camelCase).
- **Directories**: `kebab-case` everywhere, including multi-word domains.
- **Kill the dot-segment suffix.** `Foo.helpers.ts` → a `helpers.ts` module (or split into
  named modules) inside the feature folder. No `.constants.`/`.helpers.` infixes.
- Enforce mechanically once ESLint is in (issue 04): `eslint-plugin-unicorn`'s
  `filename-case` (or `check-file`) so drift can't come back.

---

## 2. Assets: a typo, mixed casing, and ~15 dead files

**Problem.**
- **Typo, and it's dead:** `assets/senirotiy_outlined.svg` (misspelling of "seniority") —
  **0 references** in the codebase.
- **Mixed casing:** 36 `snake_case` assets (`ai_filled.svg`, `list_view_outlined.svg`)
  vs. 6 `kebab-case` (`job-posting-outlined.svg`, `sync-logo.svg`, `logo-scaled.png`).
- **Dead files:** 61 asset files exist; only **46 are referenced** → ~15 unused, e.g.
  `list_view.svg` (0 refs) and redundant `card_view.svg` / `card_view_filled.svg` /
  `card_view_outlined.svg` triplets where only some are used.

**Decision.**
- Port **only referenced** assets into the rewrite; drop the ~15 dead ones (do not port,
  do not "just in case" them).
- Rename all ported assets to one convention — **`kebab-case`** to match the directory
  rule above (`ai-filled.svg`, `seniority-outlined.svg`).
- Fix the `senirotiy` spelling as part of the rename (it's dead, so this is free).
- Prefer `lucide-react` icons over bespoke SVGs where an equivalent exists (issue 02 already
  standardizes on lucide); only keep custom SVGs that lucide can't cover (brand marks, the
  logo).

---

## 3. Inline styles and hardcoded colors are a codebase-wide pattern, not one file

**Problem.** `gaps-and-recommendations.md` item G names only `AppShell.tsx`, and the token
ticket (issue 03) cites "219 hex values" as a general colors problem. The actual scope in
component code (`.tsx`/`.ts`, not CSS) is much larger:
- **210 inline `style={{…}}`** usages.
- **198 hardcoded hex colors** sitting directly in TS/TSX (separate from the CSS tree the
  token migration already addresses).

**Decision.**
- **Ban inline `style` for anything non-dynamic** across the rewrite (genuinely dynamic
  values — bar widths, computed avatar hue — are the only exceptions, and even those go
  through a CSS custom property where practical).
- **Zero hardcoded hex in components.** All color comes from the semantic tokens defined in
  issue 03. A hex literal in a `.tsx`/`.ts` file is a lint failure.
- Enforce mechanically: an ESLint rule (e.g. a `no-restricted-syntax` for hex literals in
  JSX/`style`, plus `react/forbid-dom-props` / `react/no-unknown-property` where it fits).
  This makes issue 03's token system actually stick instead of being bypassed inline.

---

## 4. `lucide-react` is pinned to a stale exact version

**Problem.** `package.json`: `"lucide-react": "0.378.0"` — an **exact** pin (no `^`) on a
version that is roughly two years old. (The already-noted `framer-motion` is a separate,
unused-dependency issue.)

**Decision.** During the scaffold, take `lucide-react` to a current version under a normal
caret range (`^`), and re-verify the icon set the rewrite actually uses. Audit the rest of
the deps for other stale exact pins at the same time.

---

## 5. `key={index}` and a raw `window.confirm`

**Problem.** Surfaced only as a one-line triage aside in `map.md`; quantified here:
- **13** `key={index}` / `key={i}` list keys (unstable keys → reconciliation bugs on
  reorder/insert/delete).
- **1** `window.confirm(...)` gating a destructive action (blocking, unstyled, untestable).

**Decision.**
- Every list key is a **stable domain id** (`candidate.id`, `job.id`, …), never the array
  index. If no natural id exists, derive a stable one at the data-mapping layer.
- Replace the `window.confirm` with shadcn's **`AlertDialog`** (already the chosen primitive
  in issue 02) so the confirm is styled, accessible, and testable.

---

## Cross-check: confirmed already-covered (no new action)

Re-verified during this scan and already documented — listed so the coverage is auditable:
mock/real switch, all `apiMappers.ts` → zod, `contracts.ts` split, `json.ts` coercers,
`platformApi.ts` God object, raw-error-text leaks, `chatStore.ts`, the `routeRegistry`
hand-matcher, the `screens/`↔`features/` half-migration, missing route guards, and the
missing ESLint/Prettier config (planned in issue 04). Measured cast count: **122 `as` +
7 `as any`/`as unknown as`** (docs cite ~169; same order of magnitude, all slated for
removal).
