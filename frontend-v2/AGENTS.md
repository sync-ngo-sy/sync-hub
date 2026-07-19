## Required context

Before `/implement`, read the active ticket, `../.scratch/frontend-rewrite/spec.md`, `map.md`, the binding addenda, and ticket 01's standing rules. For UI work, also read `docs/design-system.md`. For API work, read `docs/api-adapters.md` and the relevant compatibility inventory.

## Visual continuity

The old frontend is the reference for what users see: screen composition, panel and control placement, proportions, spacing rhythm, and recognizable brand treatment. Match that visible shape with the new component and token system. Do not copy its CSS, class names, components, state management, helpers, stores, API code, or parsing logic.

## Architecture guardrails

- Parse external values at their owning boundary with a named Zod schema. This includes API responses, local storage, URL state, and MSW request bodies. Do not add generic record/coercion helpers or manually probe unknown properties.
- Before adding a shared helper, identify two current v2 consumers and confirm that the chosen platform or library does not already own the behavior. Prefer a concrete domain operation over a generic `utils` module.
- Keep reusable tokens and utility styles in `src/index.css`; keep component variants with the owning component. Do not export Tailwind class strings from TypeScript utility modules.
- Keep shadcn source in `src/components/ui/` as shipped unless a ticket requires a real behavior or accessibility change. Product styling belongs in tokens, supported variants, or composites—not cosmetic edits to vendored primitives.
- Never delete this file, `docs/design-system.md`, `docs/api-adapters.md`, or `docs/api-compatibility-inventory/` as cleanup. They are implementation inputs.

## Project conventions

Issues and specs live under the repository-level `.scratch/<feature-slug>/` (`../.scratch/` from this directory); see `docs/agents/issue-tracker.md`. Triage labels are documented in `docs/agents/triage-labels.md`. Domain documentation uses `CONTEXT.md` and `docs/adr/`; see `docs/agents/domain.md`.
