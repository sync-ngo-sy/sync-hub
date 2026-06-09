# cPanel Deployment Checklist

This is the simple deployment path for this project.

Use this when:

- the frontend will be hosted on `cPanel`
- Supabase is already online
- the worker will run separately on a laptop or VM

## Short answer

No, you do **not** need only an API key from the owner.

At minimum, you need:

- cPanel access or a way to upload files to the website
- the production Supabase project URL
- the production Supabase anon/public key
- access to deploy Supabase Edge Functions and database migrations
- the final website domain

If CV ingestion will use Gemini, you also need:

- a Gemini API key

If you will run the worker yourself, you also need:

- a worker access token for Supabase, or a service-role key for setup only

## What runs where

### cPanel

Only the built frontend files.

### Supabase online

- auth
- database
- storage
- edge functions

### Worker machine

- CV extraction
- embeddings
- syncing CV data into Supabase

Do **not** try to run the worker inside cPanel shared hosting.

## What to ask the owner for

Send this list:

1. Website domain or subdomain for the frontend
2. cPanel login or FTP/SFTP upload access
3. Supabase project URL
4. Supabase anon/public key
5. Supabase project access, or someone who can run migrations and deploy functions
6. Gemini API key if Gemini will be used
7. Confirmation whether original CV files should be stored in Supabase Storage

Optional but useful:

- Supabase service-role key for one-time setup only
- a dedicated worker access token

## What I can do if I have the right access

I can:

- build the frontend
- prepare the production frontend env
- upload the frontend build to cPanel
- apply migrations to Supabase
- deploy Edge Functions
- configure the worker to sync to the online project

I cannot finish production deployment correctly with only:

- a Gemini key
- or only cPanel access
- or only the Supabase URL without keys/access

## Production frontend env

Create production values like this:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_API_BASE_URL=https://YOUR_PROJECT.supabase.co/functions/v1
```

Important:

- never put the Supabase service-role key in the frontend
- never put Gemini or OpenAI secret keys in the frontend

## Deployment steps

### 1. Prepare Supabase production

You need the online Supabase project ready first.

Do this:

1. Apply all SQL migrations in `supabase/migrations/`
2. Deploy these Edge Functions:
   - `search`
   - `compare`
   - `ask`
   - `agent`
3. Set required function secrets
4. Create the `cv-originals` bucket if you want original CV storage
5. In Supabase Auth, set:
   - `Site URL` to the final website URL
   - any redirect URLs you plan to use

### 2. Prepare the frontend build

**Local manual build (no GitHub secrets):**

From the repo root, with production `VITE_*` values in `.env`:

```bash
node scripts/build-cpanel-deploy.mjs --install
```

Windows PowerShell:

```powershell
.\scripts\build-cpanel-deploy.ps1 -Install
```

Upload everything inside **`deploy/cpanel/`** (not `frontend/dist/` directly — the script copies the build there and adds upload notes).

**Local build + FTPS upload (no GitHub secrets):**

Put FTP credentials in **`.env.local`** (gitignored), then from repo root:

```powershell
.\scripts\publish-cpanel-local.ps1 -Install
```

Or step by step:

```powershell
.\scripts\build-cpanel-deploy.ps1 -Install
.\scripts\upload-cpanel-deploy.ps1 -Install
```

Use `-DryRun` on the upload script to verify FTP settings without sending files.

**Zip upload (File Manager — no FTP credentials):**

```powershell
.\scripts\build-cpanel-deploy.ps1 -Install
.\scripts\zip-cpanel-deploy.ps1
```

Upload **`deploy/cpanel.zip`** in cPanel → `public_html/jobs/` → **Extract**, then delete the zip on the server.

**Or build manually:**

```bash
cd frontend
npm install
npm run build
```

Output will be in:

- `frontend/dist/` (manual path) or `deploy/cpanel/` (script path)

### 3. Upload to cPanel

Pick one:

| Method | Script | Upload target |
|--------|--------|----------------|
| File Manager | `zip-cpanel-deploy.ps1` | `deploy/cpanel.zip` → Extract in `public_html/jobs/` |
| FTPS | `upload-cpanel-deploy.ps1` | Contents of `deploy/cpanel/` |
| One command | `publish-cpanel-local.ps1` | Build + FTPS upload |

Manual fallback: upload everything inside **`deploy/cpanel/`** to:

- `public_html/` if this is the main domain
- or the correct subfolder if this is a subdomain/addon domain

This app uses a hash router, so no SPA rewrite rules are required.

### 4. Smoke test the live site

After upload, verify:

1. login page loads
2. sign-in works
3. search page loads
4. admin pages load for admin users
5. browser requests go to the real online Supabase URL, not `127.0.0.1`
6. no request goes to `trycloudflare.com`

### 5. Run the worker separately

The worker should point to the online Supabase project, not local Supabase.

Typical production-style worker env:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ACCESS_TOKEN=YOUR_WORKER_ACCESS_TOKEN
SUPABASE_STORAGE_BUCKET=cv-originals

CV_MODEL_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
CV_MODEL_API_KEY=YOUR_GEMINI_API_KEY
CV_EXTRACTION_PROVIDER=openai-compatible
CV_EXTRACTION_MODEL=gemini-2.5-flash
CV_EMBEDDING_PROVIDER=openai
CV_EMBEDDING_MODEL=gemini-embedding-001
CV_EMBEDDING_DIMENSION=768
CV_EMBEDDING_VERSION=gemini-embedding-001-768-v1
CV_WORKER_CACHE_DIR=./tmp/cv_intelligence_worker
CV_DELETE_SYNCED_BUNDLES=true
```

Then run ingestion from the worker machine, not the cPanel server.

## What is missing right now before a real deployment

If your current frontend env still points to local or temporary URLs, that must be replaced before build.

The production deployment is not ready until all of these are true:

- frontend env points to the real online Supabase project
- Supabase migrations are applied online
- Edge Functions are deployed online
- Auth `Site URL` is set correctly
- worker env points to the online Supabase project
- no frontend config references:
  - `127.0.0.1`
  - local tunnels
  - `trycloudflare.com`

## Safest handoff model

If the owner is non-technical, the easiest model is:

1. they give you the required access once
2. you do the initial deployment
3. after that, normal frontend updates are just:
   - rebuild
   - upload new `dist/`

The more sensitive backend items are:

- Supabase keys
- function secrets
- worker credentials

Keep those out of the frontend and out of cPanel public files.

## GitHub Actions (cPanel CI)

The repo includes [`.github/workflows/deploy-cpanel.yml`](.github/workflows/deploy-cpanel.yml). It:

1. Builds `frontend/dist/` with production `VITE_*` values from GitHub secrets
2. Uploads the build to cPanel over **FTPS** (incremental sync; does not wipe the remote folder)

Triggers:

- **Push to `main`** when `frontend/` or the workflow file changes
- **Manual**: Actions → *Deploy frontend to cPanel* → *Run workflow*
  - Enable **Build only** to verify secrets and the build without uploading

### One-time GitHub setup

In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Example / notes |
|--------|-----------------|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase **anon** key (public; safe in frontend) |
| `VITE_API_BASE_URL` | Optional. Defaults to `{VITE_SUPABASE_URL}/functions/v1` |
| `VITE_SITE_URL` | Optional. e.g. `https://jobs.sync.ngo` |
| `CPANEL_FTP_SERVER` | FTP host from cPanel (often your domain or `ftp.example.com`) |
| `CPANEL_FTP_USERNAME` | cPanel FTP account username |
| `CPANEL_FTP_PASSWORD` | FTP account password |
| `CPANEL_FTP_SERVER_DIR` | Remote folder relative to the FTP login root (see below) |

### sync.ngo production FTP (`subscription@sync.ngo`)

cPanel shows the account directory as `/home/…/public_html/jobs`. That usually means the FTP login root **is already** the `jobs` site folder.

| Secret | Value |
|--------|--------|
| `CPANEL_FTP_USERNAME` | `subscription@sync.ngo` |
| `CPANEL_FTP_SERVER_DIR` | `./` (or leave unset and use `./` after first failed deploy try `public_html/jobs/`) |
| `CPANEL_FTP_SERVER` | Hostname from cPanel → **FTP Accounts** (often `sync.ngo`, `ftp.sync.ngo`, or the server name — not `jobs.sync.ngo` unless cPanel lists it) |
| `CPANEL_FTP_PASSWORD` | Set only in GitHub Secrets (never commit) |
| `VITE_SITE_URL` | `https://jobs.sync.ngo` |

If files land in the wrong folder, open cPanel **FTP Accounts** → **Configure FTP Client** for this user and note whether the login root is `public_html/jobs` or the account home; adjust `CPANEL_FTP_SERVER_DIR` accordingly.

Do **not** add service-role keys, Gemini keys, or OpenAI keys to GitHub secrets for this workflow — only public frontend values and FTP credentials.

### cPanel FTP notes

1. In cPanel, open **FTP Accounts** and use an account scoped to the site (or subdomain) document root.
2. Set `CPANEL_FTP_SERVER_DIR` to the folder that should receive `index.html` from `frontend/dist/`.
3. If FTPS on port 21 fails, check cPanel **FTP Connections** / firewall rules; some hosts use implicit FTPS on port 990 — adjust `protocol` / `port` in the workflow if needed.
4. After the first deploy, smoke-test the live site (login, search, Supabase requests in the browser network tab).

### What this workflow does not deploy

- Supabase migrations or Edge Functions (run separately with Supabase CLI or dashboard)
- The Python CV worker (runs on a laptop/VM, not cPanel)

Follow [docs/release-process.md](docs/release-process.md) for full release order: database → functions → frontend → worker.
