# 17 — Settings

**What to build:** the account settings page — workspace/company selection, password change, session preferences. A recruiter can manage their account.

**Blocked by:** 07 (independent feature domain).

**Status:** ready-for-agent

**References:** `../spec.md`. Note: `Settings` is one of the files currently leaking raw backend error text — that must be gone here.
**Standing rules:** see ticket 01.

- [ ] `features/settings/`: settings load and save through real Edge Functions / the auth layer
- [ ] Any settings form uses React Hook Form + zod; password change validated before submit
- [ ] Company/workspace selection ties into the tenant-scope logic from ticket 05
- [ ] Save failures surface via the message mapper (toast/Alert), never raw error text; success clearly confirmed
- [ ] Settings response variants are verified and fixture-tested; private adapters return canonical schemas/types before caching and request encoders alone own current backend keys; malformed/conflicting responses fail visibly rather than defaulting
- [ ] Tests via the shared kit + MSW cover a settings load, a validated save, and a rejected/failed save
