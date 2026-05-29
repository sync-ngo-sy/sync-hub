# Release Process

The project has multiple deployable planes: frontend, Supabase migrations and Edge Functions, and the offline worker. Release notes should call out which planes changed.

## Pre-Release Checklist

- CI is green on the release branch.
- Supabase migration check passes.
- Any database migration has a deploy order and rollback note.
- Frontend build artifact has been generated from the release commit.
- Worker changes have a tested command example or migration note when operator behavior changes.
- New secrets or environment variables are documented in `.env.example` and deployment docs.

## Deploy Order

1. Apply database migrations.
2. Deploy Supabase Edge Functions.
3. Deploy or publish frontend static assets.
4. Roll out worker/operator changes.
5. Run smoke tests.

## Smoke Tests

- Sign in through the frontend with a known test account.
- Confirm tenant/workspace context is correct.
- Run a representative search and open a candidate dossier.
- If migrations touched ingestion/search tables, ingest one small CV with `--no-sync` first, then run a controlled sync in the target environment.
- Check recent Edge Function errors and ingestion warnings.

## Rollback

- Frontend rollback: redeploy the previous static artifact.
- Edge Function rollback: redeploy the previous function bundle.
- Database rollback: prefer forward-fix migrations. If destructive rollback is required, document data impact and backup/restore steps first.
- Worker rollback: pin operators to the previous release commit or package.
