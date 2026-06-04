# Feature Module Guide

Use this guide when creating, extending, or reviewing a frontend feature in CV Intel.

## Default Shape

Create or extend a feature under `frontend/src/features/<feature>/`:

```text
features/<feature>/
├── pages/
├── components/
├── hooks/
├── apiMappers.ts
├── utils/
├── types.ts
├── constants.ts
└── <feature>.helpers.ts
```

Only create folders/files that the feature actually needs. Prefer a few focused modules over one large catch-all file.

## Ownership Rules

- `pages/`: route-level feature pages composed by thin files in `frontend/src/screens`.
- `components/`: feature-specific presentational components.
- `hooks/`: data loading, workflow state, persistence, subscriptions, and side effects.
- `apiMappers.ts` or `services/`: remote payload mapping, request payload builders, and feature API helpers.
- `utils/`: pure feature-local transformations.
- `types.ts`: feature-local types that are not shared platform contracts.
- `constants.ts`: feature-local options, labels, thresholds, and static config.
- Shared UI primitives belong in `frontend/src/components`.
- Shared contracts and cross-feature helpers belong in `frontend/src/lib`.

## Screen And Route Rules

- Keep `frontend/src/screens/<Screen>.tsx` as a compatibility shell or thin route component.
- Put route metadata and navigation labels in `frontend/src/app/routeRegistry.tsx`.
- Do not let feature modules import from `frontend/src/screens/*`.
- Do not duplicate route labels, icons, or path checks in sidebars/topbars.

## Data And Mock Rules

- Feature components should call feature hooks or `platformApi`.
- Feature mappers should parse remote payloads with typed helpers from `frontend/src/lib/api/json.ts`.
- Keep mock/demo data behind `frontend/src/lib/api/mockPlatformApi.ts`.
- Do not import `@/data/mockData` in React screens, feature components, or hooks.
- Preserve both Supabase-backed and no-Supabase demo behavior unless the task explicitly removes demo mode.

## CSS Rules

- Put feature styles under `frontend/src/styles/features/<feature>.css` or `frontend/src/styles/features/<feature>/<area>.css`.
- Add imports to `frontend/src/styles/index.css` in cascade order.
- Keep `index.css` as imports only.
- Move reusable controls to `frontend/src/styles/components/*`.
- Keep CSS files under 500 lines and review files over 300 lines.

## Component Rules

- Components should render one concept.
- Keep business rules, persistence, and API orchestration outside render components.
- Prefer explicit props and typed event handlers.
- Avoid passing entire remote payloads through multiple layers when a narrow view model is clearer.
- Extract repeated JSX into named components before a page becomes hard to scan.

## Hook Rules

- Hooks should have one responsibility and a stable return shape.
- Use hooks for data fetching, debounced input, URL/session state, form workflows, and multi-step operations.
- Derive state instead of storing duplicate values.
- Keep browser APIs and side effects inside effects or explicit handlers.

## Accessibility Rules

- Feature work must include labels for controls, keyboard-accessible interactions, visible focus states, and semantic HTML.
- Drawers/modals need `role="dialog"`, `aria-modal`, a label, close behavior, and focus/background handling.
- Custom dropdowns and multi-selects must preserve keyboard and screen-reader semantics.

## Feature Review Checklist

- Does the feature live under the right `features/<feature>` boundary?
- Are screens thin and route metadata centralized?
- Are API/mapping concerns outside components?
- Are mocks isolated behind the mock API?
- Are CSS files owned by the feature and imported in order?
- Are files under target sizes, or is there a documented reason?
- Are loading, error, empty, and permission states handled?
- Are validation commands and relevant smoke paths run?
