# frontend-v2

Full rewrite of `../frontend/` on a modern stack: Vite 8, React 19, TypeScript
(strict, no `any`/`as` casting), Tailwind v4, shadcn/ui, React Query, React
Hook Form + Zod, TanStack Table, Zustand (scoped narrowly).

The rationale, architecture decisions, and full ticket breakdown live in
`../frontend/.scratch/frontend-rewrite/` (`spec.md`, `map.md`,
`build-tickets/`). Read `spec.md` before starting any feature work here.

## Getting started

```bash
npm install
npm run dev
```

## Required environment variables

Vite's env file must live at the **repo root** (`../.env`), not inside this
directory — see `envDir` in `vite.config.ts`, which points one level up so
this app shares the same `.env` as `worker/`, `supabase/`, and `infra/`. Copy
the repo root's `.env.example` (or this directory's `.env.example`, which
lists only the vars this app reads) to `../.env` and fill in:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — typecheck + production build
- `npm run lint` — ESLint (strict TypeScript, react-hooks, jsx-a11y, file-naming rules)
- `npm run format` / `npm run format:check` — Prettier
- `npm test` — Vitest + React Testing Library

## Conventions

- Component files: `PascalCase.tsx`. Everything else: `camelCase.ts`. Directories: `kebab-case`.
- Import other modules via the `@/` alias — parent-relative (`../`) imports are a lint error.
- No hardcoded hex colors or non-dynamic inline styles — use Tailwind classes / design tokens.
- Invoke the `react-best-practices` skill at least once per `/implement` session.
- The repo's issue tracker / triage-label / domain-doc config (`AGENTS.md`, `docs/agents/`)
  is mirrored here from `../frontend/` — see those files for conventions.
