# 16 — Chat (SYNC AI)

**What to build:** the AI question-and-answer screen — a recruiter asks grounded questions over a candidate set and gets answers. This replaces the current screen that stacks inline styles, a `dangerouslySetInnerHTML` style block, `!important` rules, and a hand-rolled global store.

**Blocked by:** 07 (independent feature domain).

**Status:** ready-for-agent

**References:** `../spec.md`, `../gaps-and-recommendations.md` Part 3 §F (hand-rolled store) and §G (inline styles).
**Standing rules:** see ticket 01.

- [ ] `features/chat/`: the ask/answer flow runs against a real Edge Function
- [ ] Chat state stays in the feature (React Query for the request/response, local state for the composer) — no hand-rolled `useSyncExternalStore` store; the only cross-route bit (e.g. a sidebar "unread answer" dot) is one small Zustand flag or derived
- [ ] No inline `style`/`dangerouslySetInnerHTML`/`!important` — styling via tokens and shared components
- [ ] Initial responses and every streamed event/frame use verified private wire schemas and adapters before entering query/feature state; canonical types only escape `api/`. Raw fixtures cover accepted variants and malformed/conflicting events; loading/streaming is handled cleanly; error → Retry, never raw text
- [ ] Query keys start with `scopeKey` where scoped
- [ ] Tests via the shared kit + MSW cover asking a question and rendering an answer, plus an error path
