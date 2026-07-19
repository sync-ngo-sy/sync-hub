# Enterprise Visual Directions Prototype

## Objective

Create an isolated visual comparison that determines how the frontend should express a mature, high-value enterprise brand. The comparison must preserve the existing teal-and-charcoal identity while correcting the current impression of generic, effect-heavy AI styling.

The prototype answers one question: which coordinated typography, color grading, spacing, and surface treatment should guide the production design system?

## Scope

The prototype will show a realistic recruiting dashboard populated with fixed sample content. It will compare the same core information across three visual directions so typography, density, hierarchy, and color treatment can be judged fairly.

The prototype is throwaway and isolated from the application. It will not modify `src/`, package dependencies, the current ticket 5 implementation, or production routes. It will be delivered through the Superpowers visual-companion server.

## Shared Constraints

- Retain a recognizable teal-and-charcoal brand identity.
- Use graded neutral and teal shades with deliberate contrast roles.
- Use gradients only for subtle canvas or surface transitions.
- Do not use glow, neon bloom, glassmorphism, colored shadows, or decorative light effects.
- Use plain borders, tonal surface separation, and restrained shadows where elevation is necessary.
- Compare complete type systems: family, weight, scale, tracking, line height, and numeric treatment.
- Use realistic dashboard content and enough data density to expose weak styling decisions.
- Keep controls accessible and text contrast legible.

## Visual Directions

### A — Faithful Lift (production baseline)

An institutional, calm direction built around Inter. Body text uses regular weight, labels and controls use medium weight, and major headings stop at semibold. The palette uses the product's established `#39393a` canvas, `#444446` panels, `#50c1b8` primary, `#f6fbfa` foreground, and teal-gray secondary text. Explicit 6/8/12/18/22px radius roles and a 20–24px spacing rhythm keep the interface composed without feeling unfamiliar.

This is the production baseline because it best balances visual continuity, premium restraint, dashboard clarity, and broad usability. It is intentionally quiet and depends on hierarchy rather than visual novelty.

### B — Editorial Intelligence

A more distinctive direction built around an IBM Plex–style sans-serif and stronger contrast between editorial headings and functional body text. It uses slightly warmer graphite shades, more negative space, fewer enclosing cards, and teal as punctuation rather than ambient color. Information is grouped through typography and rules instead of repeated containers.

This direction feels authored and premium, but its lower density may be less efficient on operational screens.

### C — Precision Teal

A compact, data-forward direction that retains Alexandria at lighter weights. Cooler charcoal grades, thin separators, smaller 14–15px functional text, tighter 16–20px padding, and restrained geometric surfaces create a precise working interface. Teal is more visible than in the other directions but remains flat and controlled.

This direction handles dense data well and stays closest to the existing identity. Its trade-off is that the compact rhythm can feel less luxurious if applied indiscriminately.

## Prototype Structure

The preview will be a single interactive screen with three switchable variants. Each variant will expose its font family, weight hierarchy, base text size, spacing rhythm, surface palette, accent grades, and radius strategy. The page will include navigation, a page header, key metrics, a candidate pipeline or activity visualization, a compact data table, status treatments, and primary/secondary controls.

A fixed comparison switcher will cycle between A, B, and C using clicks or left/right arrow keys. The active variant will also be represented in the URL so a direction can be revisited directly. The switcher is part of the throwaway preview, not a proposed production component.

## Interaction and Data

All content and state are local to the prototype. Controls may demonstrate hover, focus, selection, and density, but no action will call the backend or persist data. The three variants use equivalent sample facts even where their information grouping differs.

## Evaluation Criteria

A successful direction should:

1. Feel credible for a well-funded enterprise product without relying on effects.
2. Preserve the brand while using teal with restraint and purpose.
3. Maintain an obvious hierarchy at a glance and comfortable reading at dashboard density.
4. Make buttons, cards, labels, numbers, and tables feel like one system.
5. Provide reusable guidance for the later production token revision.

Faithful Lift is the production design-system baseline. The other directions remain prototype references only.

## Verification

Before handoff, confirm that the visual-companion server is live, all three variants are reachable, the switcher and keyboard navigation work, the layout remains readable at desktop and narrow widths, and no application source or dependency files changed as a result of building the prototype.
