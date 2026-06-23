---
name: cv-intel-react-review
description: Review or guide CV Intel React/frontend changes and enforce this repository's feature architecture, modularity, styling, accessibility, type-safety, mock-data, and validation standards. Use when asked to review a PR, build or extend a frontend feature, audit frontend changes, prevent regressions after refactors, assess new contributor changes, or verify that React, TypeScript, CSS, and API-boundary changes match the CV Intel project style.
---

# CV Intel React Review

## Purpose

Use this skill as the default review and feature-authoring lens for `frontend/` changes in CV Intel. Treat it as a merge-readiness gate, not as general advice.

## Quick Workflow

1. Inspect the changed files before judging the code.
2. Read `references/review-rubric.md` for the detailed checklist.
3. For new or expanded features, read `references/feature-module-guide.md` before proposing structure.
4. Produce findings first, ordered by severity, with file and line references.
5. Verify architecture, file size, mock-data boundaries, CSS ownership, accessibility, type safety, and behavior preservation.
6. Run the relevant validation commands when local context allows.
7. End with residual risk and missing validation only after findings.

## Project Invariants

- Keep React screens thin. Screens compose feature pages, hooks, and components.
- Keep feature code under `frontend/src/features/<feature>/` unless it is truly shared.
- Give each feature clear subfolders for `pages`, `components`, `hooks`, `apiMappers` or services, `utils`, `types`, and constants as needed.
- Keep feature exports intentional; do not use catch-all barrels that hide ownership or create cycles.
- Keep shared UI in `frontend/src/components`, shared domain/API helpers in `frontend/src/lib`, and route metadata in `frontend/src/app/routeRegistry.tsx`.
- Keep `frontend/src/styles/index.css` as an ordered import manifest only. Put styles in tokens, base, layout, components, or feature CSS files.
- Keep mock/demo data behind `frontend/src/lib/api/mockPlatformApi.ts`. React screens/components must not import `@/data/mockData` directly.
- Preserve live Supabase behavior and no-Supabase demo behavior behind `platformApi`.
- Prefer simple composition, custom hooks, typed helpers, and named functions over clever patterns.

## File Size Targets

- Components and hooks: target under 150 lines.
- Utilities: target under 200 lines.
- Files over 300 lines require explicit review.
- Files over 500 lines are automatic refactor candidates unless they are generated, type-contract, or data-fixture files.
- `platformApi.ts`, `contracts.ts`, and `mockData.ts` are allowed to exceed normal limits only as consciously managed boundary files; do not add unrelated concerns to them.

## Validation Commands

From the repo root:

```bash
node scripts/check-repo-format.mjs
```

From `frontend/`:

```bash
npm run lint
npm run test
npm run build
```

For file-size review:

```bash
find frontend/src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) -print0 | xargs -0 wc -l | sort -nr | head -50
```

If `npm` is unavailable but dependencies are installed, use the local package binaries:

```bash
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json --pretty false
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --pretty false
node ../scripts/check-repo-format.mjs .
node scripts/test.mjs
node node_modules/vite/bin/vite.js build --outDir /tmp/cv-intel-frontend-smoke-dist --emptyOutDir
```

## Review Output

Use a code-review stance:

- Findings first, ordered by severity.
- Each finding must include a concrete file/line reference.
- Explain the user-visible or maintenance risk, not just the rule violation.
- Include open questions or assumptions only after findings.
- Include validation run and residual risk at the end.
- If there are no findings, say so clearly and list any validation gaps.
