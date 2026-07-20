# 19 — v2-ready verification / cutover

**What to build:** the final move-in check. Confirm the whole new app works against the real backend, looks right, and is safe to become the deployed frontend — then set the one server-side thing clean URLs need, and freeze the old app so the two don't drift.

**Blocked by:** 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18 (all feature slices), and 02 (the keep list).

**Status:** ready-for-agent

**References:** `../spec.md`, `../gaps-and-recommendations.md` Part 2 §10 (cutover checklist), and `../additional-scan-findings.md` (binding cross-cutting checks).
**Standing rules:** see ticket 01.

- [ ] Every "keep" route from ticket 02's table works end to end against the real backend
- [ ] Brand/visual parity holds (colors, button feel) versus the old app
- [ ] `lint`, `test`, and `build` all green; no `any` and no `as` beyond justified, commented exceptions; the whole app has zero fake-data paths in `src/`
- [ ] Compatibility inventory covers every ported endpoint and every retained alias has a passing raw fixture; malformed, conflicting-alias, missing-required, and security-sensitive cases fail. No raw wire key/type or backend casing hedge exists outside feature `api/` adapters, and React Query caches canonical frontend models only
- [ ] Repo-wide checks find no array-index list keys, hardcoded TS/TSX hex colors, non-dynamic inline styles, dot-segment helper filenames, parent-traversal imports where `@/` applies, or non-kebab-case directories/assets; the ported asset set matches ticket 02's referenced-only inventory
- [ ] The cPanel SPA rewrite rule (`.htaccess`, `RewriteBase` matching the deployed subfolder) is added so clean URLs resolve on direct load/refresh; `DEPLOYMENT`/`CPANEL` docs updated (the old "hash router, no rewrite needed" note is corrected)
- [ ] Drift policy in place: feature work on the old `frontend/` is frozen; only critical fixes ship there, each ported forward to `frontend-v2/`
- [ ] A short "what is v2 / how to run it" note exists so the switch of deployed directory is a known, documented step
