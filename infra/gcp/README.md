# GCP Worker Deployment

This folder deploys the CV ingestion worker to Google Cloud Run Jobs.

The worker is a batch job, not a long-running web service. It reads CV files from a mounted Google Cloud Storage bucket, runs `cv-intelligence-worker ingest`, and syncs derived artifacts to Supabase.

## Files

- `worker.Dockerfile` - container image for the Python ingestion worker.
- `cloudbuild.worker.yaml` - Cloud Build config that builds and pushes the worker image to Artifact Registry.
- `worker.env.example` - non-secret worker environment template.
- `terraform/` - Cloud Run Job, service account, IAM, GCS mount, and optional Scheduler trigger.

## Architecture

```text
GCS bucket with CVs
        |
        | mounted read-only at /mnt/cvs
        v
Cloud Run Job: cv-intelligence-worker ingest
        |
        | Supabase REST / Storage APIs
        v
Supabase candidate tables, chunks, summaries, embeddings
```

## Required GCP APIs

Enable these once per project:

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  cloudscheduler.googleapis.com
```

## Required Secrets

Create Secret Manager secrets before applying Terraform:

```bash
printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create supabase-service-role-key --data-file=-
printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
printf '%s' "$MANATAL_API_TOKEN" | gcloud secrets create manatal-api-token --data-file=-
```

If your secrets already exist, use their existing names in `terraform.tfvars`.

## Build The Worker Image

Create an Artifact Registry Docker repository first, or let Terraform create it.

```bash
gcloud builds submit \
  --config infra/gcp/cloudbuild.worker.yaml \
  --substitutions _REGION=us-central1,_REPOSITORY=cv-intelligence,_IMAGE=cv-worker,_TAG=latest
```

## Deploy With A New GCP Account

Use a separate `gcloud` configuration so this deployment does not touch any existing work or staging account:

```bash
gcloud config configurations create cv-ngo
gcloud config configurations activate cv-ngo
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_NEW_GCP_PROJECT_ID
gcloud config set run/region us-central1
```

If the project does not exist yet, create it first from the Google Cloud Console, attach billing, then come back to the CLI and set it as shown above.

The repo includes a `gcloud` helper for teams that do not want to use Terraform locally:

```bash
export GCP_PROJECT_ID="YOUR_NEW_GCP_PROJECT_ID"
export GCP_REGION="us-central1"
export SUPABASE_URL="https://YOUR_SUPABASE_PROJECT.supabase.co"
export CV_WORKER_TENANT_ID="00000000-0000-0000-0000-000000000000"

# Required only the first time, or when creating/updating Secret Manager values.
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"
export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
export MANATAL_API_TOKEN="YOUR_MANATAL_API_TOKEN"

# Default job mode drains candidate IDs queued by the Manatal webhook.
export WORKER_ARGS="manatal-sync,--pending,--pretty"
export ENABLE_SCHEDULER=true
export SCHEDULER_CRON="*/15 * * * *"

./infra/gcp/deploy-worker-gcloud.sh
```

The script enables required APIs, creates Artifact Registry if needed, creates or checks required secrets, builds the Docker image with Cloud Build, deploys a Cloud Run Job, and optionally creates a Cloud Scheduler trigger.

## Create The Private CV Bucket

Use a private GCS bucket for raw CV PDFs instead of public links or per-user Google Drive sharing. The standard path is Terraform: it owns the bucket, service accounts, IAM, Cloud Run Job, and optional Scheduler. The bucket should not be granted to app users directly; the UI should go through an authenticated backend endpoint that checks tenant membership and returns a short-lived signed URL.

```bash
cd infra/gcp/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars
terraform init
terraform plan
terraform apply
```

For `example-gcp-project`, use values like:

```hcl
project_id         = "example-gcp-project"
region             = "us-central1"
cv_bucket_name     = "example-cv-originals"
cv_bucket_location = "us-central1"
```

The Terraform config creates or manages:

1. A bucket with uniform bucket-level access, public access prevention, Standard storage, labels, and soft delete.
2. The worker service account and bucket read access so Cloud Run Jobs can mount the bucket.
3. A `cv-document-signer` service account with read access and self `roles/iam.serviceAccountTokenCreator`, ready for a future signed-URL service.

If a resource was first created manually or with `gcloud`, import it before applying Terraform. That makes Terraform the source of truth instead of trying to create duplicates. For the current `example-gcp-project` project, import the resources we already created before running `terraform apply`:

```bash
cd infra/gcp/terraform

terraform import 'google_storage_bucket.cv_originals[0]' example-cv-originals
terraform import 'google_artifact_registry_repository.worker[0]' \
  projects/example-gcp-project/locations/us-central1/repositories/cv-intelligence
terraform import google_service_account.worker \
  projects/example-gcp-project/serviceAccounts/cv-worker@example-gcp-project.iam.gserviceaccount.com
terraform import 'google_service_account.document_signer[0]' \
  projects/example-gcp-project/serviceAccounts/cv-document-signer@example-gcp-project.iam.gserviceaccount.com
terraform import google_cloud_run_v2_job.worker_ingest \
  projects/example-gcp-project/locations/us-central1/jobs/cv-worker-manatal-sync
```

Then run:

```bash
terraform plan
terraform apply
```

For the worker deployment, pass the same bucket name:

```bash
export CV_BUCKET_NAME="example-cv-originals"
./infra/gcp/deploy-worker-gcloud.sh
```

## Upload CVs To GCS

Use one folder per tenant if the bucket is shared:

```bash
gcloud storage cp --recursive ./workspaces/demo gs://YOUR_CV_BUCKET/demo
```

The default Terraform example mounts the bucket at `/mnt/cvs` and sets `CV_SOURCE_DIR=/mnt/cvs/demo`.

## Migrate Manatal Originals To GCS

For existing indexed candidates, prefer Manatal as the source of original CV files when `public.manatal_candidate_sync.source_document_id` is available. Start with a dry run:

```bash
cv-intelligence-worker manatal-originals-to-gcs \
  --bucket example-cv-originals \
  --limit 10 \
  --pretty
```

After reviewing the dry run, apply a small pilot:

```bash
cv-intelligence-worker manatal-originals-to-gcs \
  --bucket example-cv-originals \
  --limit 10 \
  --apply \
  --pretty
```

When the protected frontend flow is validated, use `--update-source-uri` to replace Drive URLs with `gs://` URIs. The worker keeps the old URL under `metadata_json.previous_source_uri`.

The protected UI open flow requires these Supabase Edge Function secrets:

```bash
supabase secrets set \
  GCS_ORIGINALS_BUCKET='example-cv-originals' \
  GCS_SIGNED_URL_EXPIRES_SECONDS='600'
```

`GCS_SIGNED_URL_SERVICE_ACCOUNT_JSON` is also required if the Supabase Edge Function signs URLs directly. For stricter production key hygiene, put the signer behind a small GCP Cloud Run service and let it sign with its attached service account instead of creating a long-lived key.

## Sync New CVs From Manatal

Manatal supports a V3 Open API for candidates/resumes and a webhook API for candidate create/update events. The durable ingestion path in this repo is the worker command below:

```bash
cv-intelligence-worker manatal-sync --tenant-id "$CV_WORKER_TENANT_ID" --pretty
```

The command:

1. Calls `GET https://api.manatal.com/open/v3/candidates/` with `updated_at__gte`.
2. Downloads candidate resumes from Manatal.
3. Checks `public.manatal_candidate_sync` to skip already-synced resumes.
4. Feeds new resumes into the existing parsing/embedding/Supabase sync pipeline.
5. Upserts sync status back to `public.manatal_candidate_sync`.

For GCP, set:

```hcl
worker_args = ["manatal-sync", "--pretty"]

worker_env = {
  SUPABASE_URL          = "https://your-project.supabase.co"
  CV_WORKER_TENANT_ID   = "00000000-0000-0000-0000-000000000000"
  MANATAL_LOOKBACK_HOURS = "24"
}

worker_secret_env = {
  SUPABASE_SERVICE_ROLE_KEY = "supabase-service-role-key"
  GEMINI_API_KEY            = "gemini-api-key"
  CV_MODEL_API_KEY          = "gemini-api-key"
  MANATAL_API_TOKEN         = "manatal-api-token"
}
```

For a one-off backfill, execute the container with:

```bash
cv-intelligence-worker manatal-sync \
  --tenant-id "$CV_WORKER_TENANT_ID" \
  --updated-since "2024-01-01T00:00:00Z" \
  --pretty
```

### Webhook Queue

This repo also includes a lightweight Supabase Edge Function receiver:

```text
supabase/functions/manatal-webhook/index.ts
```

Deploy it after applying `supabase/migrations/20260521100000_manatal_sync_state_v1.sql`, then set:

```bash
supabase secrets set \
  MANATAL_WEBHOOK_SECRET='choose-a-shared-secret' \
  MANATAL_WEBHOOK_TENANT_ID='00000000-0000-0000-0000-000000000000'
```

Register Manatal webhooks for `candidate/create` and `candidate/update` events with a target URL like:

```text
https://YOUR_SUPABASE_PROJECT.functions.supabase.co/manatal-webhook?secret=YOUR_SECRET
```

The webhook only queues the Manatal candidate id in `public.manatal_candidate_sync`; it does not parse CVs inline. Run the worker in pending mode to drain the queue:

```bash
cv-intelligence-worker manatal-sync --pending --pretty
```

In GCP:

```hcl
worker_args = ["manatal-sync", "--pending", "--pretty"]
```

Keep a scheduled lookback poller enabled as a safety net because webhook delivery can fail or arrive before the resume is fully available in Manatal.

## Deploy With Terraform

```bash
cd infra/gcp/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars
terraform init
terraform apply
```

## Run The Worker Job

```bash
gcloud run jobs execute cv-worker-ingest \
  --region us-central1 \
  --wait
```

For the Manatal pending-sync job created by the helper script:

```bash
gcloud run jobs execute cv-worker-manatal-sync \
  --project YOUR_NEW_GCP_PROJECT_ID \
  --region us-central1 \
  --wait
```

## Operational Notes

- Use Cloud Run Jobs for ingestion runs and reruns.
- Use Cloud Scheduler only after the ingestion input folder and dedupe behavior are validated.
- Do not store raw CVs in the image. Keep them in GCS.
- Keep `CV_DEDUPE_SOURCE_DOCUMENTS=true` so reruns are safe.
- Keep `CV_SYNC_ORIGINALS_TO_STORAGE=false` unless Supabase storage budget and privacy policy are ready.
- For large batches, increase Cloud Run timeout, CPU, memory, and `CV_INGEST_CONCURRENCY` gradually.
