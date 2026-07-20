# 03 — Design token system

**What to build:** one single source of truth for the app's visual language — colors, typography, spacing, radius, breakpoints — that every screen reads from. This replaces the 219 hardcoded color values, the ad-hoc breakpoints, and the fixed font sizes. After this, no screen ever hardcodes a color or guesses a spacing number.

**Blocked by:** 01 (Tailwind v4 must exist).

**Status:** ready-for-agent

**References:** `../issues/03-styling-system-token-rebuild.md` (the decision), `../spec.md`, `../gaps-and-recommendations.md`, `../additional-scan-findings.md` Part 3.
**Standing rules:** see ticket 01.

- [x] Semantic color tokens in OKLCH via shadcn's `@theme`/`:root` convention: background, foreground, primary, primary-strong, success, warning, and a new `destructive` (`#f87171`); brand colors carried over from current usage, not invented
- [x] A generated neutral scale anchored on the current dominant background color (not swapped for Tailwind's stock gray)
- [x] Chart/data-viz colors kept as a separate token set (`--chart-1..8`)
- [x] Fluid, `clamp()`-based typography scale (smooth grow between mobile-min and desktop-max), not fixed sizes; standard 5-step breakpoint scale replacing the current seven ad-hoc breakpoints
- [x] Legacy-proportioned explicit radius scale (6/8/12/18/22px), separate 16px button radius, and neutral elevated shadow mapped into shadcn conventions
- [x] Dark-only for now, but structured (semantic tokens, `:root` + `.dark`) so a light theme can be added later without a rewrite; `color-scheme: dark` set
- [x] No z-index token scale is introduced (Radix portal stacking removes the need)
- [x] Full mobile-through-desktop responsive support is possible from these tokens
- [x] No color value is consumed as a hardcoded hex literal from TS/TSX; ticket 01's mechanical check proves feature code can only consume semantic tokens

## Comments

Implemented on branch `frontend-refactor`. Token architecture: a primitive neutral OKLCH
ramp (`--neutral-50`…`--neutral-950`, generated, hue/chroma anchored on `#39393a`) defined
once in `:root`, referenced by semantic tokens in both `:root` (shadcn-stock light
placeholder, inert for now) and `.dark` (the real, active theme). All real brand values were
converted from the hex/rgba literals cited in `../issues/03-styling-system-token-rebuild.md`
to OKLCH via the standard sRGB→OKLab conversion (Björn Ottosson's formulas), not eyeballed.

Notable decisions beyond the issue doc's explicit answer:

- **Typography/font-family**: Inter is self-hosted via `@fontsource-variable/inter`, avoiding
  a render-blocking third-party request. Routine text uses regular weight, while headings,
  labels, controls, and dashboard numbers use medium; semibold is reserved for rare emphasis.
- **Fluid type scale**: every step grows monotonically from mobile to desktop, with a compact
  15px→16px base and a 30px→36px page-title step. This retains fluid reflow without producing
  oversized dashboard headings.
- **Radius scale**: named radii are explicit rather than multiples of one large base value:
  6/8/12px controls, 18px panels, 22px large containers, and the separately verified 16px
  button radius. This keeps the brand's soft geometry without turning `rounded-xl` into 30px.
- **`--muted-foreground-soft`**: new custom token (not a shadcn-standard slot) for the
  current app's `--text-soft` (`#88aaa7`), which has 20+ real call sites — dropping it would
  have silently lost a real, heavily-used tertiary text tier.
- **`--input`**: the issue doc only resolves `--border` (primary/16, formalized not new).
  `--input` had no prior token to carry over; kept shadcn's stock near-white-wash value
  (`oklch(1 0 0 / 15%)`, closest match to the real app's `rgba(255,255,255,.03)` input
  background) rather than reusing `--border`'s primary tint, since compounding that with
  `button.tsx`'s existing `bg-input/30` opacity modifier would wash it out further, and the
  real precedent for input fields is a neutral wash, not a teal-tinted one.
- **`--primary-foreground`**: set to `--neutral-800` (dark), matching the current app's
  literal `.button--primary { color: var(--bg); }` — dark text on the primary teal, not
  shadcn's default light-on-primary assumption.

Ran `npm run lint`, `npm run test`, `npm run build`, and `npm run format:check` — all green.
Could not do a live browser check (no Chrome extension connected in this environment) —
verified via successful Tailwind/PostCSS compilation and Prettier/ESLint only; a visual pass
is still worth doing before this is treated as final.

Ran `/code-review` (Standards + Spec axes) before committing. Three real findings, all fixed:

- **Standards + Spec (both flagged this independently)** — `--color-neutral-50…950` were
  exposed as directly-usable Tailwind utilities (`bg-neutral-700`) in `@theme inline`, in
  tension with the decision doc's explicit constraint: "tokens must be exposed as semantic
  names... not raw color values referenced ad hoc at call sites"
  (`issues/03-styling-system-token-rebuild.md` line 18). Fixed: the ramp is now internal-only
  (`:root` primitives feeding semantic tokens via `var()`), no longer mapped into
  `@theme inline`'s `--color-*` namespace, so it can't be reached as a Tailwind class.
- **Standards** — `.dark`'s `--success`/`--warning` were literal duplicates of
  `--chart-3`/`--chart-2`'s OKLCH values instead of derived from them, risking silent drift
  if one is retuned later. Fixed: `--success: var(--chart-3)`, `--warning: var(--chart-2)`.
- **Spec** — `--card`/`--popover`'s comment cited the old `--panel` value (`#444446`) as if
  carried over exactly, but silently dropped its `0.84` alpha (the original was translucent,
  `rgba(68,68,70,0.84)` over the page background) — and the decision doc never actually
  specifies `--card`/`--popover` at all, unlike every other token. Fixed: the comment now
  says plainly that this slot is unspecified by the decision doc and was filled with the
  closest precedent, deliberately flattened to opaque (a reusable surface token shouldn't be
  translucent against an unknown backdrop).
