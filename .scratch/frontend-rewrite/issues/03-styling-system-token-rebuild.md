# Design token system

Type: grilling
Status: resolved
Blocked by: 02

## Question

Design the design-token system layered on top of the UI library choice from [UI library & component approach](02-ui-library-component-approach.md). Current state: `src/styles/tokens.css` is 18 lines — just colors, one `--radius`, one `--shadow`, no spacing scale, no font-size scale, no radius scale, no z-index scale (magic numbers observed: 1, 10, 12, 18, 20, 30, 32, 35, 39, 40, 48, 49, 50, 51, 80, and `z-[9999]` used independently in 3 separate files). 219 hardcoded hex/arbitrary-value colors (e.g. `bg-[#2d2d2e]`, `hover:bg-[#50c1b8]/20`) exist alongside the handful of CSS vars that do get used. 28 separate hand-written `.css` files under `src/styles/` total 5,270 lines, organized by feature.

Decide:

- The target token structure: spacing scale, font-size scale, radius scale, z-index scale (e.g. `--z-dropdown`, `--z-modal`), on top of whatever shadcn/Tailwind v4 convention was settled in ticket 02.
- The migration plan to eliminate the 219 hardcoded values and consolidate or retire the 28 loose CSS files.

**Standing constraint from [Rewrite strategy](01-rewrite-strategy.md):** this is a re-implementation, not a redesign — but that means preserving the **brand colors**, not the 219 individual hardcoded hex/arbitrary values. Those 219 usages are overwhelmingly near-duplicates or opacity variants of a much smaller underlying set of actual brand/semantic colors (the mess is that nothing routed through a shared scale, so every usage hand-rolled its own shade/opacity instead of e.g. `bg-primary/50`). Part of this ticket's job is identifying that true underlying set — likely well under 20 base colors — and building a proper modern token scale from it (base colors, generated shade steps, opacity modifiers), the way any current production codebase would, rather than carrying forward hundreds of literal values.

**Standing constraint from [UI library & component approach](02-ui-library-component-approach.md):** tokens must be exposed as **semantic names** (`primary`, `secondary`, `destructive`, `muted`, etc.) that shadcn's `variant` props resolve to — not raw color values referenced ad hoc at call sites. This is what makes the "no one-off classNames, only variant props" rule enforceable: a component's `variant="destructive"` should resolve through the token layer, never bypass it with a literal color.

## Answer

**Colors** — extracted from actual usage (grep across `src/`, 219 raw hex/arbitrary-value occurrences), not invented fresh:

- `--background: #39393a` (125 occurrences — the dominant value), `--foreground: #f6fbfa` (current `--text`)
- `--primary: #50c1b8` (40 occurrences), `--primary-strong: #00857e` (kept for the existing progress-bar gradient use)
- `--success: #73e0a8`, `--warning: #ffcf7a` — carried over from the current (barely-used) `tokens.css`
- `--destructive: #f87171` — new token; the current codebase has **no** error/destructive color at all, just four different ad hoc reds (`#f87171` in `ChatComposer.tsx`'s actual error-message case, `#ff9788` in two separate feature CSS files, `#ffb4b4` in insights CSS, `#b42318` in search-simulator CSS). Standardized on `#f87171` since it's the one already attached to genuine error semantics.
- `--muted-foreground: #b9d3d1`, softer tertiary tier `#88aaa7`
- `--border`: unchanged in substance — it's already `--primary` at low opacity (`primary/16`, `primary/30` for the strong variant), which is exactly the token-driven opacity-modifier pattern the rest of the app should follow. No new value needed, just formalized.
- **Neutral scale**: generated 50→950 OKLCH steps anchored on `#39393a`, replacing the ~9 near-duplicate hardcoded dark grays (`#2d2d2e`, `#1e1e1f`, `#242425`, `#323233`, `#444446`, `#2e2e2f`, `#303031`, `#282829`, `#1c1c1d`) found scattered across the codebase with steps on one scale — not switched to Tailwind's stock gray/zinc/slate defaults, which would visibly shift the app's tone.
- **Chart colors**: kept as their own `--chart-1`…`--chart-8` tokens (shadcn's native convention for this), a direct lift of the existing `CHART_COLORS` array in `insightsDashboard.helpers.ts` — 3 of its 8 values already equal brand tokens, the rest are legitimately chart-only and don't belong in the UI palette.
- Dark-mode-only for now (confirmed) — tokens use shadcn's semantic naming (`--background`/`--foreground`) so a `.dark` override block can be added later without renaming anything, but no light theme is built now.

**Typography, radius & shadow**: Inter is self-hosted as the single UI family. Its restrained 400/500/600 weight hierarchy replaces heavy routine UI text while preserving clear emphasis. The radius scale keeps the current product's soft geometry but assigns explicit roles: 6/8/12px for small-to-large controls, 18px for panels, 22px for larger containers, and the existing separate 16px button radius. This prevents shadcn's named radii from multiplying one large base value into oversized corners. The current single `--shadow` (`0 24px 80px rgba(0,0,0,.28)`) becomes the neutral "elevated" tier for overlays; ordinary hierarchy uses tonal surfaces and borders, with no glow or colored shadow.

**Responsiveness — corrected from the initial proposal.** The current app is not actually responsiveness-free (7 `@media` queries exist, plus 60 Tailwind responsive-prefix usages), but it's ad hoc: seven different one-off breakpoints (`600px`, `720px`, `900px`, `960px`, `1080px`, `1100px`, `1200px`), no shared scale. Confirmed scope: **full responsive support, mobile through desktop** — not desktop-primary with token support. Resolution:

- **Breakpoints**: adopt Tailwind's standard scale (`sm`=640, `md`=768, `lg`=1024, `xl`=1280, `2xl`=1536), replacing the seven ad hoc values.
- **Typography is fluid, not static**: font sizes use restrained `clamp()`-based interpolation between a mobile-min and desktop-max per step (15→16px base), rather than fixed sizes that jump at breakpoints or an oversized display scale. Page titles use the 30→36px step; routine authenticated-app headings do not exceed the 36→44px step.
- **Spacing**: uses Tailwind's standard spacing scale with ordinary responsive breakpoint modifiers (`p-4 md:p-6 lg:p-8`) — not fluid/clamp-based. Padding jumps at breakpoints don't read as janky the way text reflow does, so fluid interpolation isn't needed here; a single consistent scale plus breakpoint modifiers is the standard modern pattern.

**Z-index scale — eliminated, not migrated.** The original 16 magic-number z-indices (including three independent `z-[9999]`) exist because every hand-rolled modal/dropdown had to independently guess a stacking value. Once these are all Radix-based shadcn primitives (Dialog, Popover, DropdownMenu, AlertDialog — per ticket 02), Radix renders them through portals with their own internal stacking management, so the app never needs to hand-coordinate a z-index scale for them. No `--z-*` token set is being carried into `frontend-v2/`; if a genuine one-off stacking need surfaces later (e.g. a sticky header), it gets a single ad hoc value at that point, not a maintained scale for a problem class that no longer exists.

**CSS file consolidation**: the 28 hand-written files (5,270 lines) under `src/styles/` get retired as their content is replaced by semantic tokens, small reusable utilities in `index.css`, and styling owned by shared composites or presentational components — not migrated file-by-file and not moved into generated shadcn primitives.
