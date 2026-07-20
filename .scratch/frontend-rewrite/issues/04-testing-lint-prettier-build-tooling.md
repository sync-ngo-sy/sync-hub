# Testing, lint, prettier & build tooling

Type: grilling
Status: resolved

## Question

Design this project's testing and code-quality tooling from scratch, scoped to this project only — the outer-repo CI pipeline is explicitly out of scope (see map Notes).

Current state: zero test files in the entire frontend (`npm test` runs a custom `scripts/test.mjs`, not a real test framework); no ESLint config at all (`npm run lint` is literally `tsc --noEmit`, so nothing catches unused vars, hooks-rules violations, or dead code); no Prettier; two lockfiles committed (`package-lock.json` and `pnpm-lock.yaml`); Vite is on 6.4.3, latest major is v7.

Decide:

- Test framework (Vitest + React Testing Library is the likely default) and initial coverage expectations.
- An ESLint flat config — which rule sets (hooks rules, unused vars, etc.).
- Prettier setup and how it reconciles with ESLint.
- Which package manager to standardize on, and how to remove the other lockfile.
- Upgrade Vite from 6.4.3 to the latest v7 (small, folded in here rather than its own ticket).

## Answer

**Test framework**: Vitest + React Testing Library, confirmed. **Coverage convention** (not a hard percentage gate — those get gamed): business logic (zod schemas, API-layer functions, custom hooks, Zustand stores) gets tests as it's written; purely presentational components don't need dedicated tests unless they carry real conditional logic. Mirrors the discipline `/tdd` already assumes for later feature work, named explicitly here rather than left implicit.

**ESLint**: flat config (`eslint.config.mjs`) via `typescript-eslint`, using `recommendedTypeChecked` + `stylisticTypeChecked` (type-aware linting, via `projectService: true`) — costs some lint speed but catches real bugs (unsafe `any`, floating promises) that the current zero-lint setup has been missing entirely. Plus `eslint-plugin-react-hooks` (rules-of-hooks), `eslint-plugin-react-refresh` (Vite fast-refresh compliance), and `eslint-plugin-jsx-a11y` — the last one chosen deliberately: it directly catches the accessibility gaps from the original audit (missing `alt` attributes, `onClick` on non-interactive elements) at lint time instead of relying on manual review.

**Prettier**: added as the formatter, reconciled via `eslint-config-prettier` (turns off ESLint's stylistic rules that would conflict with Prettier) — not `eslint-plugin-prettier` (running Prettier as an ESLint rule is the older, now-discouraged pattern; formatting and linting stay as two separate tools/commands).

**Package manager**: **npm**, not pnpm — this was a fact to check, not a decision. `package-lock.json` is the actively updated lockfile (modified 2026-07-12); `pnpm-lock.yaml` is stale (untouched since the initial commit, 2026-07-11) and `CONTRIBUTING.md` already documents `npm install` / `npm run lint && npm run test && npm run build` as the official workflow. `pnpm-lock.yaml` gets deleted, not reconciled.

**Vite upgrade — v8, not v7** (corrected mid-resolution: v7 was "latest" when this map was charted, but Vite has since released v8). Confirmed going with v8 despite it being a bigger jump than a routine bump — v8 merges in Rolldown (a Rust-based bundler) replacing esbuild/Rollup as the default, plus: default `build.target` raised to newer browser baselines (Chrome 111, Firefox 114, Safari 16.4), Node 20.19+/22.12+ required, CJS build removed. All folded into this ticket rather than split out — still too small on its own to warrant a separate ticket, just a bigger jump than originally scoped.

**Strict TypeScript — added after initial resolution, per standing map principle.** Current codebase: 169 `as` casts (7 of them `as unknown as`/`as any`), 12 files with explicit `any`, despite `tsconfig.app.json` already having `strict: true`. Base `strict` mode alone doesn't stop any of that, so it's enforced mechanically:

- `@typescript-eslint/no-explicit-any`: `error` — not just the `recommendedTypeChecked` unsafe-usage rules (which catch unsafe *use* of already-`any`-typed values from untyped sources), but banning the annotation outright.
- `@typescript-eslint/consistent-type-assertions`: `error`, configured to disallow type assertions except where genuinely unavoidable (narrowing after a runtime check) — `as unknown as X` and `as any` specifically are never acceptable, no exceptions.
- `@typescript-eslint/no-unnecessary-type-assertion`: `error` — catches redundant `as` casts the type checker would've inferred anyway.
- `@typescript-eslint/no-inferrable-types`: `error` — no explicit annotation where the compiler already infers the correct type (idiomatic TypeScript, not maximal annotation).
- `tsconfig.app.json` gains `noUncheckedIndexedAccess: true` on top of the existing `strict: true` — catches unsafe array/object index access that silently types as non-`undefined` when it can, in fact, be `undefined`.
- **Process rule, not a lint rule**: when a type isn't obvious (a third-party package, an API response shape), check that package's actual shipped types or the relevant schema — never guess and never fall back to `any` to move past a type error. This applies to every future `/implement` session working off this map, not just to `frontend-v2`'s initial scaffolding.
