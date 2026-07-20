# UI library & component approach

Type: grilling
Status: resolved

## Question

Confirm and detail the UI component library and CSS framework. Standing preference (see map Notes): **shadcn/ui on Tailwind's latest major version (v4)**, replacing the current Tailwind 3.4.19 setup, the 12 hand-rolled exports in `components/ui.tsx` (none of which is a Button), the 9 duplicated modal implementations (`CandidatePreviewModal.tsx`, `SelectedCandidatesModal.tsx`, `FilterSelectionModalBase.tsx`, `ComparePickerModal.tsx`, and others sharing the exact same copy-pasted backdrop string and Escape-key handler), the 6+ independent dropdown/picker implementations (`PickerDropdown.tsx`, `FilterMultiSelect.tsx`, plus each selection modal reimplementing its own list/search/select logic), and the 144 raw `<button>` elements each hand-writing their own className.

Nail down:

- The Tailwind 3→4 migration mechanics (breaking changes, the new CSS-first config approach) — likely needs a `/research` pass against the official migration guide.
- Which shadcn primitives replace which existing hand-rolled components (Button, Dialog/Modal, dropdowns/Select/Combobox, etc.).
- Migration scope and order for the 144 buttons, 9 modals, and 6+ dropdowns specifically — full replacement up front, or incremental per-feature.

**Standing constraint from [Rewrite strategy](01-rewrite-strategy.md):** this is a re-implementation, not a redesign. The rewrite happens in a fresh `frontend-v2/` directory in this repo, and the new components must preserve the current app's **core visual identity** — button look/feel and brand colors carry over, reimplemented with shadcn primitives rather than replaced with a new visual style. This does not mean replicating implementation detail 1:1: the 219 hardcoded colors and 144 one-off button className strings are the mess being fixed, not a spec to match line-for-line — see [Design token system](03-styling-system-token-rebuild.md) for how the actual color set gets distilled down.

This ticket blocks [Design token system](03-styling-system-token-rebuild.md) and [Architecture & state-management conventions](05-architecture-state-conventions.md) — both depend on this choice.

## Answer

**Confirmed: shadcn/ui on Tailwind v4**, on top of Vite's native plugin (not PostCSS).

**Tailwind v3→v4 migration mechanics** (researched against the official docs):

- `tailwind.config.js` is replaced by CSS-first config: a `@theme` block directly in CSS, defining colors (in OKLCH), fonts, breakpoints, etc. as CSS custom properties.
- `@tailwind base/components/utilities` directives are replaced by a single `@import "tailwindcss";`.
- Since this project is Vite-based, install via `@tailwindcss/vite` (not the PostCSS plugin path) — add it to `vite.config.ts`. This makes `autoprefixer` and `postcss-import` unnecessary; both get dropped from `postcss.config.js`.
- Deprecated utilities go away: `bg-opacity-*`/`text-opacity-*` are replaced by the `/50`-style opacity modifier syntax (e.g. `bg-black/50`) — the same modifier convention the token system ticket will standardize on for color variants instead of one-off hex values.

**shadcn/ui mechanics**: it isn't an npm dependency — its CLI (`npx shadcn add <component>`) copies component source directly into the repo (e.g. `src/components/ui/button.tsx`). Keep that generated source aligned with upstream unless a real behavior or accessibility requirement demands a change; product styling alone is not a reason to fork a primitive. It's built on Radix UI primitives, so keyboard navigation, focus trapping, and ARIA semantics come for free — this directly fixes the accessibility gaps from the original audit (`onClick` on `<div>`s, no keyboard access on custom dropdowns), not just the duplication. Theming is CSS custom properties in OKLCH, mapped through a `@theme inline` block, with light/dark handled via a `.dark` class variant.

**Component mapping**:

- The 144 raw `<button>` elements → shadcn `Button`.
- The 9 duplicated modals (`CandidatePreviewModal`, `SelectedCandidatesModal`, `FilterSelectionModalBase`, `ComparePickerModal`, etc.) → shadcn `Dialog`.
- `window.confirm()` (the destructive shortlist-clear action) → shadcn `AlertDialog`.
- The 6+ dropdown/picker implementations (`PickerDropdown.tsx`, `FilterMultiSelect.tsx`, plus the four separate selection modals for skills/location/company/seniority) → **consolidated into one shared searchable-select component** (shadcn's Popover+Command "combobox" pattern), parameterized by data source and labels, rather than kept as four+ separate reimplementations of the same list/search/select logic. This directly retires finding #17 from the original audit instead of just modernizing each copy in place.
- The 12 domain-specific exports in `components/ui.tsx` (`Panel`, `StatCard`, `Tag`, `ScorePill`, `Avatar`, `TenantBadge`, `EmptyState`, etc.) are not a 1:1 shadcn replacement — some (`Panel`→`Card`, `Tag`→`Badge`, `Avatar`→`Avatar`) map onto shadcn primitives directly; the rest (`StatCard`, `ScorePill`, `TenantBadge`, `EmptyState`) are genuinely domain-specific and get rebuilt as small compositions on top of the shadcn primitives, not replaced wholesale.

**Migration scope/order**: moot as originally framed (it assumed retrofitting old code in place) now that [Rewrite strategy](01-rewrite-strategy.md) settled on a full parallel rewrite. The shadcn primitives get added once as the foundational component layer at the start of `frontend-v2/`, before feature work begins; features are then built against them incrementally as work proceeds — not a separate scope decision.

## Implementation conventions (added after initial resolution)

Three non-negotiable rules for how shadcn actually gets used in `frontend-v2/`, not just which components map to which:

1. **Maximize shadcn coverage.** Not limited to the components explicitly named above (Button, Dialog, AlertDialog, the combobox). Wherever a shadcn primitive exists for a UI pattern in this app — form inputs, checkboxes/radios/switches, tabs, tooltips, badges, avatars, separators, skeleton/loading states, progress indicators, tables, accordions, etc. — it must be used instead of a hand-rolled equivalent. Treat the original 26-point audit as a floor, not the full list of what needs replacing; the token-system and architecture tickets should also scan for hand-rolled patterns that map onto shadcn components not yet named here.
2. **Centralized product styling without primitive forks.** Global brand styling lives in semantic tokens; recurring domain patterns live once in shared composites. Page-specific layout stays in its owning presentational component. Do not scatter named feature CSS classes or edit a shadcn primitive for cosmetic variation.
3. **Variant props for recurring semantics, not every difference.** Use the shadcn component's shipped `variant`/`size` vocabulary and add composite variants only when the meaning recurs. Domain-specific compositions (`StatCard`, `ScorePill`, `TenantBadge`, `EmptyState`) expose a small semantic vocabulary rather than arbitrary styling props.

This governs [Design token system](03-styling-system-token-rebuild.md) (tokens must be semantic names — `primary`, `secondary`, `destructive`, `muted` — that variant props resolve to, not raw color values referenced ad hoc) and [Architecture & state-management conventions](05-architecture-state-conventions.md) (presentational components own their variant-based styling; containers only pass data and variant selection, never styling).
