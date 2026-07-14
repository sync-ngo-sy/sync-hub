# Staging environment

Staging lets testers and developers validate changes before production.

| Plane | Production | Staging |
|-------|------------|---------|
| Git branch | `main` | `dev` |
| Frontend URL | https://jobs.sync.ngo | https://dev-jobs.sync.ngo |
| cPanel path | `public_html/jobs/` | `public_html/dev-jobs/` (or subdomain docroot) |
| Supabase | Production project | **Separate** project or branch (you create later) |
| Edge Functions | Production deploy | Staging project deploy |
| CI deploy workflow | `deploy-cpanel.yml` | `deploy-cpanel-staging.yml` |

## Git workflow

1. Open feature PRs → merge into **`dev`** first.
2. CI runs on `dev`; frontend auto-deploys to staging when `frontend/` changes.
3. After QA, merge `dev` → `main` for production deploy.

## Acceptance criteria mapping

| Requirement | How |
|-------------|-----|
| Different database | Staging Supabase project (or Supabase branch) with its own `STG_VITE_*` secrets |
| Different edge functions | Deploy functions to the staging Supabase project only |
| Different domain | https://dev-jobs.sync.ngo |
| Not open to all users | Separate Supabase auth users; optional cPanel directory password; do not link staging from prod |

## One-time setup

### 1. cPanel (frontend)

1. Create subdomain **`dev-jobs.sync.ngo`** pointing to e.g. `public_html/dev-jobs/`.
2. Reuse production **CPANEL_FTP_*** credentials, or create a dedicated FTP account scoped to `dev-jobs/`. Set `STG_CPANEL_FTP_SERVER_DIR=./` only for a dev-only FTP user.
3. **Do not** set `server-dir` to `public_html/` when the FTP root is already the dev site folder (same rule as production `jobs/`).

### 2. Supabase (backend — when ready)

1. Create a **new** Supabase project (or enable a staging branch).
2. Apply migrations from `supabase/migrations/`.
3. Deploy edge functions to staging only.
4. In **Auth → URL configuration**:
   - Site URL: `https://dev-jobs.sync.ngo`
   - Redirect URLs: `https://dev-jobs.sync.ngo/**`
5. Create test accounts; do not copy production service-role keys to laptops.

### 3. GitHub

**Settings → Secrets and variables → Actions**

**Staging Supabase (required for build):**

| Secret | Example |
|--------|---------|
| `STG_VITE_SUPABASE_URL` | `https://xxxx.supabase.co` (staging project) |
| `STG_VITE_SUPABASE_ANON_KEY` | staging anon key |
| `STG_VITE_SITE_URL` | `https://dev-jobs.sync.ngo` (optional; defaulted in CI) |

**cPanel FTP (same host as production):** reuse existing `CPANEL_FTP_SERVER`, `CPANEL_FTP_USERNAME`, and `CPANEL_FTP_PASSWORD`. You do **not** need duplicate `STG_CPANEL_FTP_*` secrets unless staging uses a different FTP account.

| Secret | Staging value |
|--------|----------------|
| `CPANEL_FTP_*` | Same as production |
| `STG_CPANEL_FTP_SERVER_DIR` | Optional. Default `../dev-jobs/` when production FTP root is `public_html/jobs/` (sibling folder). Use `./` if you create a dedicated FTP user scoped only to `dev-jobs`. |

Optional: **Settings → Environments → staging** — add protection rules (required reviewers) so only leads can deploy.

### 4. Create and push the `dev` branch

```bash
git checkout main
git pull
git checkout -b dev
git push -u origin dev
```

Set **`dev`** as the default merge target for feature PRs in your team process.

## Local staging build

```bash
# Copy .env.staging.example → .env.staging.local and fill STG values
node scripts/build-cpanel-deploy.mjs
# Upload deploy/cpanel/ to the dev-jobs folder manually or via FTPS
```

## Smoke test after deploy

1. https://dev-jobs.sync.ngo loads.
2. Browser network tab shows **staging** Supabase URL, not production.
3. Sign-in works with a **staging** test account only.
4. Production https://jobs.sync.ngo is unchanged.

## Related docs

- [CPANEL_DEPLOYMENT_CHECKLIST.md](../CPANEL_DEPLOYMENT_CHECKLIST.md) — production cPanel
- [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md) — Supabase and worker planes
- [release-process.md](release-process.md) — deploy order
