# Rewrite strategy: strangler vs. parallel

Type: grilling
Status: resolved

## Question

Should the frontend rewrite proceed as a **strangler-fig migration** (new code coexists with and incrementally replaces old code in the same app/repo, shipped in slices) or a **parallel rewrite** (new frontend built separately, cut over when ready)?

Decide the strategy and record the reasoning. This shapes how every other decision cluster gets scoped and sequenced — e.g. whether the styling system needs a coexistence path with the old CSS during migration, whether the folder structure must support old and new code simultaneously, and how tickets coming out of `/to-spec` later get sliced.

## Answer

**Parallel rewrite from scratch**, not a strangler-fig migration.

Reasoning:

- The app is pre-launch with zero live users, so the usual case *for* strangler (protect live traffic from cutover risk) doesn't apply.
- The owner is solo with no hard deadline and explicitly wants to "take the time to do it right" — but was grilled on the classic solo-rewrite failure mode (no forcing function, easy to stall in a parallel codebase that never reaches parity) and, having weighed that, still chose a full from-scratch rewrite over an in-place incremental replacement. This is a deliberate call, not an oversight.
- The current codebase's problems are pervasive enough (9 duplicated modal implementations, 144 hand-rolled buttons, zero tests, no lint config, no container/presentational separation, 219 hardcoded colors) that adapting old code piece-by-piece offers little savings over writing fresh.

**Mechanics**: the new frontend is built in a **fresh sibling directory within this same repo** (working name: `frontend-v2/`), not a separate git repo — this repo already hosts `worker/`, `supabase/`, and `infra/` as siblings, and a separate repo would only pay off with separate teams/CI/access control, which doesn't apply to a solo effort. Cutover happens later by swapping which directory gets deployed; the actual scaffolding of that directory is implementation work for after this map closes, not part of charting the decision.

**Standing constraint carried into other tickets**: this is a re-implementation, not a redesign — the current app's **core visual identity (brand/primary colors, button look/feel, and each screen's CSS layout) carries over**, but implemented properly this time. The 219 hardcoded hex/arbitrary-value colors are *evidence of the problem*, not a target to replicate 1:1 — most are near-duplicate or opacity variants of a small underlying set of brand colors. The rebuild extracts that small set of actual distinct colors and expresses them as a modern token scale (base colors with generated shades, opacity modifiers like `/50`/`/90`, à la standard Tailwind conventions) rather than carrying forward 219 individual literal values. [UI library & component approach](02-ui-library-component-approach.md) and [Design token system](03-styling-system-token-rebuild.md) have been updated to carry this constraint explicitly.

**Layout, specifically** (added after ticket 04's button re-implementation missed the old app's actual button proportions): "re-implementation, not a redesign" is not limited to colors and button styling — it extends to each screen's actual CSS layout (positioning, spacing rhythm, section composition, structural sizing). When a feature ticket ports a screen that has an old-app equivalent, the implementer reads that screen's real file(s) (`screen-inventory.md`'s `Screen (file)` column has the exact path for every routed screen) and reproduces its layout with the new component/token stack — not a fresh design, and not a guess. This does not mean copying old CSS literally (inline styles, magic numbers, and the 219 hardcoded colors are exactly what's being fixed) — it means the *shape* of the page (what's where, how it's spaced, how sections compose) should look and feel like the same app, verified by comparing a real render against the old screen, not just against the ticket's prose description.
