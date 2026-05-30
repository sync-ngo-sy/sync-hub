# Data Retention and Privacy

CVs, extracted profiles, summaries, embeddings, and local worker caches can contain sensitive personal data. Treat all generated artifacts as confidential unless explicitly scrubbed.

## Local Worker Data

- Source CVs under `workspaces/<tenant-slug>/` are ignored by git and should remain local or in an approved synced folder.
- The worker cache defaults to `./tmp/cv_intelligence_worker`.
- `CV_DELETE_SYNCED_BUNDLES=true` should remain the default for production-like syncs so local JSON bundles are removed after successful Supabase sync.
- Use `--no-sync` only for local testing, and delete generated cache data when the test is complete.

## Original CV Storage

- Do not store local machine paths as long-term source URLs for hosted environments.
- Prefer private storage for original CVs and issue short-lived signed URLs when users need to view them.
- Redact signed URL query parameters in logs, errors, and sync state.

## Tenant Data

- Never copy one tenant's source CVs, profiles, embeddings, or generated artifacts into another tenant workspace.
- Use tenant IDs in operator commands and review output before running bulk syncs.
- Verify RLS behavior when migrations touch tenant-scoped tables, views, RPCs, or Edge Functions.

## Retention Recommendations

- Delete local worker cache directories after operational runs unless they are needed for debugging.
- Keep original CV retention aligned with customer agreements and applicable privacy rules.
- Keep operational telemetry long enough for incident response, then prune or aggregate it.
- Document exceptions when data must be retained longer for legal, audit, or support reasons.
