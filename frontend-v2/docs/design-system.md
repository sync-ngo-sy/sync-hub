# Design system guide

`src/index.css` is the source of truth. This guide explains how to use it; do not copy its values into feature code.

## Visual direction

The interface is a refined continuation of the existing product: charcoal `#39393a`, panel `#444446`, teal `#50c1b8`, near-white text, and teal-gray secondary text. Consume these through semantic Tailwind classes such as `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, and `bg-primary`. Never add raw color literals in TS or TSX.

Keep the treatment flat and restrained. Do not add glow, colored shadows, glassmorphism, neon effects, or decorative gradients. Use tonal surfaces and quiet borders to establish hierarchy.

For screens that exist in the old frontend, preserve the visible layout: panel and control placement, proportions, spacing rhythm, and section composition. Rebuild that shape with the current Tailwind tokens and shared components; do not copy old CSS, class names, inline styles, or component code.

## Typography

- Inter is the only UI font. Body copy and buttons are regular (`font-normal`); headings, labels, and important numbers are usually medium (`font-medium`). Reserve semibold for rare emphasis and avoid bold in routine UI.
- Use `text-xs` for captions and metadata, `text-sm` for controls and supporting copy, and `text-base` for primary body copy or card titles.
- Page titles use `text-3xl`, medium weight, approximately `leading-[1.08]` and `tracking-[-0.045em]`. Do not use sizes above `text-4xl` inside the authenticated application shell.
- Dashboard numbers may use `text-3xl`, medium weight, tight tracking, and tabular numerals. Labels remain small and quiet.
- Use the fluid `text-*` scale from `index.css`; do not introduce arbitrary pixel font sizes.

## Spacing and density

- Prefer Tailwind's standard scale. Common gaps are 8–16px; related content should sit closer than separate sections.
- Use 16–24px internal padding for cards and panels. Use 24–32px between major page sections. Compact table cells and toolbar controls may use 8–12px.
- Default to balanced dashboard density. Do not surround every item with a card, and do not use oversized empty space to manufacture a premium appearance.
- Use the standard responsive breakpoints. Reduce columns before shrinking readable text or click targets.

## Shape and elevation

- Controls generally use `rounded-md` or `rounded-lg`; panels use `rounded-xl` (18px); buttons use the dedicated 16px button radius; pills and status badges may be fully rounded.
- Use borders or surface grades for ordinary separation. Shadows are neutral and reserved for overlays such as dialogs and popovers.

## Implementation rules

- Compose from shared primitives and domain composites before adding new markup or styling.
- Shared visual behavior belongs in a shared component or token, not repeated feature class names.
- Reusable typography and utility styles belong in `src/index.css` (`@theme` or `@utility`), never in TypeScript constants containing class strings.
- Drive component differences through existing `variant` and `size` props. Add a new variant only when the meaning recurs.
- Keep `src/components/ui/` aligned with the shadcn source unless a real behavior or accessibility requirement calls for a change; apply product styling through tokens and supported variants.
- Familiar icons come from `lucide-react`; do not use decorative emoji as interface icons.
- Check desktop and narrow layouts, visible focus, text contrast, loading, empty, and error states before considering a screen complete.
