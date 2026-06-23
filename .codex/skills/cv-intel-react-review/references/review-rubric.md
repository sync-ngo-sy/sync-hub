# CV Intel React Review Rubric

## Architecture

- Verify screens mostly orchestrate and render feature-level components.
- Move feature-specific UI, hooks, mappers, constants, and helpers under `frontend/src/features/<feature>/`.
- For new or substantially changed features, apply `feature-module-guide.md`.
- Keep cross-feature utilities in `frontend/src/lib` only when more than one feature needs them.
- Keep route labels, paths, icons, and navigation metadata centralized in `frontend/src/app/routeRegistry.tsx`.
- Reject new circular dependencies or feature modules importing screen internals.

## React Components And Hooks

- Components should have one clear responsibility and shallow JSX.
- Extract business workflows, data fetching, persistence, and derived state into hooks/helpers.
- Prefer derived values over duplicated state.
- Keep state ownership close to usage.
- Use context only for shared app state, not as a dumping ground.
- Avoid memoization unless it protects a real expensive computation, context churn, or stable callback contract.

## TypeScript

- Reject new `any` unless it is isolated at an external boundary and explained.
- Prefer explicit domain types from `frontend/src/lib/contracts.ts` or focused feature types.
- Avoid repeated type definitions across screens and feature modules.
- Avoid broad type assertions; parse unknown API payloads with helpers in `frontend/src/lib/api/json.ts`.

## API And Mock Boundaries

- React screens/components should call `platformApi` or feature hooks, not import mock fixtures.
- `@/data/mockData` should only be imported by `frontend/src/lib/api/mockPlatformApi.ts`.
- Keep remote mapping code in feature `apiMappers.ts` files or `frontend/src/lib/api/*`.
- Do not add unrelated remote calls back into `platformApi.ts` if they belong in a feature mapper/service.
- Preserve lazy mock loading so production bundles do not eagerly carry demo data.

## CSS And Styling

- `frontend/src/styles/index.css` must remain an import manifest.
- Put design tokens in `tokens.css`, resets/base rules in `base.css`, app shell in `layout/`, reusable controls in `components/`, and feature styles in `features/`.
- Avoid adding large global selector clusters to unrelated CSS files.
- Keep CSS chunks under 500 lines and review anything over 300 lines.
- Prefer stable layout constraints over content-driven layout shifts.
- Maintain visible focus styles and responsive behavior.

## Accessibility

- Interactive elements must be buttons, links, inputs, or have a justified accessible role.
- Dialogs/drawers need labels, escape/close behavior, focus handling, and background interaction control.
- Dropdowns and custom selects need keyboard semantics and visible focus.
- Form controls need labels or explicit `aria-label`.
- Avoid click-only table rows or div-buttons.

## Performance

- Watch for heavy computation in render paths.
- Avoid global state updates that re-render large trees.
- Keep mock/demo data and admin-only diagnostics out of eager production paths when practical.
- Use code splitting or lazy boundaries when a feature is not needed for the first route.

## Testing And Validation

- Require tests or smoke coverage for changed behavior, not just changed files.
- Run TypeScript, format, unit smoke tests, and production build for frontend changes.
- Browser-smoke route, auth, forms, data-loading, error, and loading states when a UI workflow changes.
- Note exactly what could not be run.

## Severity Guide

- P0: security, tenant isolation, data loss, broken auth, or production-blocking build failure.
- P1: behavior regression in core workflows, inaccessible critical flow, broken route, major type/API mismatch.
- P2: maintainability or architecture drift likely to compound, missing tests for meaningful behavior, bundle or performance regression.
- P3: local cleanup, naming, small consistency issues, or follow-up refactors that should not block merge.
