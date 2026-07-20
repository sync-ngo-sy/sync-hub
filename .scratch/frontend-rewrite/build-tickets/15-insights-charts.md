# 15 — Insights: charts dashboards

**What to build:** the analytics/insights dashboards — job-family distribution, skills gaps, seniority mix, AI briefs — drawn with a real chart library instead of hand-drawn SVG/CSS, using the chart color tokens.

**Blocked by:** 07 (independent feature domain).

**Status:** ready-for-agent

**References:** `../spec.md`, `../gaps-and-recommendations.md` Part 2 §5.
**Standing rules:** see ticket 01.

- [ ] `features/insights/`: dashboards render from real Edge Function data, drawn with Recharts via shadcn's chart component reading the `--chart-1..8` tokens
- [ ] The hand-rolled SVG/pyramid CSS charts are gone
- [ ] Each chart has a text alternative or accessible label (a table or `aria-label`) so it isn't invisible to screen readers
- [ ] Insights wire variants are inventoried, backend-verified, and fixture-tested; private adapters produce canonical camelCase chart/report schemas/types before caching. Malformed/conflicting payloads → error + Retry; loading → skeletons; valid empty result → empty state; query keys start with `scopeKey`
- [ ] Tests via the shared kit + MSW cover a dashboard rendering from data and the empty/error paths (assert on the accessible data, not pixel output)
