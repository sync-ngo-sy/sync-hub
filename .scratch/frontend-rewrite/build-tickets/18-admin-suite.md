# 18 — Admin suite

**What to build:** the admin-only screens — account/tenant provisioning, runtime settings, ops alerts, Manatal sync status, search simulator, and parsing quality/lab/detail. Only admins can reach these (enforced by the route guard), and each works against the real backend. This is a lot of surface — expect to split into 2–3 tickets during `/implement`.

**Blocked by:** 07 (independent domain), 02 (the keep/drop/later table — several admin screens are dead code to skip).

**Status:** ready-for-agent

**References:** `../spec.md`, `../gaps-and-recommendations.md` Part 2 §6 (admin guard), §10 (dead admin screens to drop). Split during `/implement`.
**Standing rules:** see ticket 01.

- [ ] Only "keep" admin screens are ported (per ticket 02); confirmed-dead admin screens (access-management, data-management, indexing-workbench, system-health, etc.) are not rebuilt
- [ ] `features/admin/` (or per-admin-area features): each ported screen works against a real Edge Function; every admin route sits behind the admin guard (a non-admin is redirected/403'd, not just missing a menu link)
- [ ] Account/tenant provisioning and runtime settings use React Hook Form + zod; provisioning must fail loudly on a malformed response, never silently default a role (e.g. to "owner")
- [ ] Fake-only capabilities with no backend (analytics, data connectors, indexing workbench, access roster) are left "later," not rebuilt against a mock
- [ ] Every ported admin operation inventories and verifies its wire variants; private adapters return canonical schemas/types before caching and request encoders own backend keys. Raw fixtures cover every accepted variant plus malformed/conflicting cases, especially role and tenant fields; errors use the message mapper; query keys start with `scopeKey` where scoped
- [ ] Tests via the shared kit + MSW cover each ported admin screen's happy path, a form validation/failure path, and that a non-admin is blocked by the guard
