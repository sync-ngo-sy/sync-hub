#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${GCP_REGION:-us-central1}"

AR_REPOSITORY="${AR_REPOSITORY:-cv-intelligence}"
WORKER_IMAGE_NAME="${WORKER_IMAGE_NAME:-cv-worker}"
WORKER_IMAGE_TAG="${WORKER_IMAGE_TAG:-latest}"
WORKER_JOB_NAME="${WORKER_JOB_NAME:-cv-worker-manatal-sync}"
WORKER_ARGS="${WORKER_ARGS:-manatal-sync,--pending,--pretty}"

WORKER_SA_NAME="${WORKER_SA_NAME:-cv-worker}"
WORKER_CPU="${WORKER_CPU:-2}"
WORKER_MEMORY="${WORKER_MEMORY:-4Gi}"
WORKER_TASK_TIMEOUT="${WORKER_TASK_TIMEOUT:-3600s}"
WORKER_TASKS="${WORKER_TASKS:-1}"
WORKER_PARALLELISM="${WORKER_PARALLELISM:-1}"
WORKER_MAX_RETRIES="${WORKER_MAX_RETRIES:-1}"

CV_BUCKET_NAME="${CV_BUCKET_NAME:-}"
GCS_ORIGINALS_BUCKET="${GCS_ORIGINALS_BUCKET:-$CV_BUCKET_NAME}"
CV_SOURCE_DIR="${CV_SOURCE_DIR:-/mnt/cvs/demo}"

SUPABASE_URL="${SUPABASE_URL:-}"
CV_WORKER_TENANT_ID="${CV_WORKER_TENANT_ID:-}"

SUPABASE_SECRET_NAME="${SUPABASE_SECRET_NAME:-supabase-service-role-key}"
GEMINI_SECRET_NAME="${GEMINI_SECRET_NAME:-gemini-api-key}"
MODEL_SECRET_NAME="${MODEL_SECRET_NAME:-$GEMINI_SECRET_NAME}"
MANATAL_SECRET_NAME="${MANATAL_SECRET_NAME:-manatal-api-token}"
SUPABASE_SECRET_VERSION="${SUPABASE_SECRET_VERSION:-latest}"
GEMINI_SECRET_VERSION="${GEMINI_SECRET_VERSION:-latest}"
MODEL_SECRET_VERSION="${MODEL_SECRET_VERSION:-$GEMINI_SECRET_VERSION}"
MANATAL_SECRET_VERSION="${MANATAL_SECRET_VERSION:-latest}"

ENABLE_SCHEDULER="${ENABLE_SCHEDULER:-false}"
SCHEDULER_NAME="${SCHEDULER_NAME:-cv-worker-manatal-sync-schedule}"
SCHEDULER_CRON="${SCHEDULER_CRON:-*/15 * * * *}"
SCHEDULER_TIME_ZONE="${SCHEDULER_TIME_ZONE:-Asia/Dubai}"
SCHEDULER_SA_NAME="${SCHEDULER_SA_NAME:-cv-worker-scheduler}"

EXECUTE_NOW="${EXECUTE_NOW:-false}"
ENABLE_SERVICES="${ENABLE_SERVICES:-true}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Set GCP_PROJECT_ID or configure a default gcloud project." >&2
  exit 1
fi

if [[ -z "$SUPABASE_URL" ]]; then
  echo "Set SUPABASE_URL." >&2
  exit 1
fi

if [[ -z "$CV_WORKER_TENANT_ID" ]]; then
  echo "Set CV_WORKER_TENANT_ID." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/${WORKER_IMAGE_NAME}:${WORKER_IMAGE_TAG}"
WORKER_SA_EMAIL="${WORKER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_SA_EMAIL="${SCHEDULER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

require_secret() {
  local secret_name="$1"
  local env_name="$2"

  if gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    if [[ -n "${!env_name:-}" && "${UPDATE_SECRET_VALUES:-false}" == "true" ]]; then
      printf '%s' "${!env_name}" | gcloud secrets versions add "$secret_name" \
        --project "$PROJECT_ID" \
        --data-file=-
    fi
    return 0
  fi

  if [[ -z "${!env_name:-}" ]]; then
    echo "Secret $secret_name does not exist. Set $env_name to create it, or create it in Secret Manager first." >&2
    exit 1
  fi

  printf '%s' "${!env_name}" | gcloud secrets create "$secret_name" \
    --project "$PROJECT_ID" \
    --replication-policy=automatic \
    --data-file=-
}

needs_manatal_api() {
  [[ "$WORKER_ARGS" == *"manatal-"* ]]
}

needs_bucket_write() {
  [[ "$WORKER_ARGS" == *"manatal-originals-to-gcs"* ]]
}

ensure_service_account() {
  local account_name="$1"
  local display_name="$2"
  local email="${account_name}@${PROJECT_ID}.iam.gserviceaccount.com"

  if ! gcloud iam service-accounts describe "$email" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$account_name" \
      --project "$PROJECT_ID" \
      --display-name "$display_name"
  fi
}

ensure_scheduler() {
  local job_uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${WORKER_JOB_NAME}:run"

  ensure_service_account "$SCHEDULER_SA_NAME" "CV Worker Scheduler"

  gcloud run jobs add-iam-policy-binding "$WORKER_JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --member "serviceAccount:${SCHEDULER_SA_EMAIL}" \
    --role roles/run.invoker \
    >/dev/null

  if gcloud scheduler jobs describe "$SCHEDULER_NAME" --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$SCHEDULER_NAME" \
      --project "$PROJECT_ID" \
      --location "$REGION" \
      --schedule "$SCHEDULER_CRON" \
      --time-zone "$SCHEDULER_TIME_ZONE" \
      --http-method POST \
      --uri "$job_uri" \
      --oauth-service-account-email "$SCHEDULER_SA_EMAIL"
  else
    gcloud scheduler jobs create http "$SCHEDULER_NAME" \
      --project "$PROJECT_ID" \
      --location "$REGION" \
      --schedule "$SCHEDULER_CRON" \
      --time-zone "$SCHEDULER_TIME_ZONE" \
      --http-method POST \
      --uri "$job_uri" \
      --oauth-service-account-email "$SCHEDULER_SA_EMAIL"
  fi
}

echo "Deploying worker job to project=${PROJECT_ID} region=${REGION}"
echo "Image: ${IMAGE_URI}"
echo "Job: ${WORKER_JOB_NAME}"
echo "Args: ${WORKER_ARGS}"

if [[ "$ENABLE_SERVICES" == "true" ]]; then
  gcloud services enable \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    secretmanager.googleapis.com \
    storage.googleapis.com \
    cloudscheduler.googleapis.com \
    --project "$PROJECT_ID"
fi

if ! gcloud artifacts repositories describe "$AR_REPOSITORY" \
  --project "$PROJECT_ID" \
  --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPOSITORY" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --repository-format docker \
    --description "Docker images for CV Intelligence workers"
fi

require_secret "$SUPABASE_SECRET_NAME" "SUPABASE_SERVICE_ROLE_KEY"
require_secret "$GEMINI_SECRET_NAME" "GEMINI_API_KEY"
if needs_manatal_api; then
  require_secret "$MANATAL_SECRET_NAME" "MANATAL_API_TOKEN"
fi

gcloud builds submit "$ROOT_DIR" \
  --project "$PROJECT_ID" \
  --config "$ROOT_DIR/infra/gcp/cloudbuild.worker.yaml" \
  --substitutions "_REGION=${REGION},_REPOSITORY=${AR_REPOSITORY},_IMAGE=${WORKER_IMAGE_NAME},_TAG=${WORKER_IMAGE_TAG}"

ensure_service_account "$WORKER_SA_NAME" "CV Intelligence Worker"

gcloud secrets add-iam-policy-binding "$SUPABASE_SECRET_NAME" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:${WORKER_SA_EMAIL}" \
  --role roles/secretmanager.secretAccessor \
  >/dev/null

gcloud secrets add-iam-policy-binding "$GEMINI_SECRET_NAME" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:${WORKER_SA_EMAIL}" \
  --role roles/secretmanager.secretAccessor \
  >/dev/null

if needs_manatal_api; then
  gcloud secrets add-iam-policy-binding "$MANATAL_SECRET_NAME" \
    --project "$PROJECT_ID" \
    --member "serviceAccount:${WORKER_SA_EMAIL}" \
    --role roles/secretmanager.secretAccessor \
    >/dev/null
fi

volume_flags=()
if [[ -n "$CV_BUCKET_NAME" ]]; then
  gcloud storage buckets add-iam-policy-binding "gs://${CV_BUCKET_NAME}" \
    --project "$PROJECT_ID" \
    --member "serviceAccount:${WORKER_SA_EMAIL}" \
    --role roles/storage.objectViewer \
    >/dev/null

  if needs_bucket_write; then
    gcloud storage buckets add-iam-policy-binding "gs://${CV_BUCKET_NAME}" \
      --project "$PROJECT_ID" \
      --member "serviceAccount:${WORKER_SA_EMAIL}" \
      --role roles/storage.objectCreator \
      >/dev/null
  fi

  volume_flags=(
    --add-volume "name=cv-source,type=cloud-storage,bucket=${CV_BUCKET_NAME},readonly=true"
    --add-volume-mount "volume=cv-source,mount-path=/mnt/cvs"
  )
fi

env_vars=(
  "SUPABASE_URL=${SUPABASE_URL}"
  "CV_WORKER_TENANT_ID=${CV_WORKER_TENANT_ID}"
  "CV_WORKER_UPLOADED_BY=gcp-cloud-run-job"
  "CV_SOURCE_DIR=${CV_SOURCE_DIR}"
  "CV_EXTRACTION_PROVIDER=${CV_EXTRACTION_PROVIDER:-openai-compatible}"
  "CV_EXTRACTION_MODEL=${CV_EXTRACTION_MODEL:-gemini-2.5-flash}"
  "CV_MODEL_BASE_URL=${CV_MODEL_BASE_URL:-https://generativelanguage.googleapis.com/v1beta/openai}"
  "CV_EMBEDDING_PROVIDER=${CV_EMBEDDING_PROVIDER:-openai}"
  "CV_EMBEDDING_MODEL=${CV_EMBEDDING_MODEL:-gemini-embedding-001}"
  "CV_EMBEDDING_VERSION=${CV_EMBEDDING_VERSION:-gemini-embedding-001-768-v1}"
  "CV_EMBEDDING_DIMENSION=${CV_EMBEDDING_DIMENSION:-768}"
  "CV_INGEST_CONCURRENCY=${CV_INGEST_CONCURRENCY:-4}"
  "CV_BATCH_SIZE=${CV_BATCH_SIZE:-8}"
  "CV_EMBEDDING_BATCH_SIZE=${CV_EMBEDDING_BATCH_SIZE:-16}"
  "CV_SUPABASE_BATCH_SIZE=${CV_SUPABASE_BATCH_SIZE:-50}"
  "CV_REQUEST_TIMEOUT_SECONDS=${CV_REQUEST_TIMEOUT_SECONDS:-60}"
  "CV_PROGRESS_INTERVAL=${CV_PROGRESS_INTERVAL:-25}"
  "CV_DEDUPE_SOURCE_DOCUMENTS=${CV_DEDUPE_SOURCE_DOCUMENTS:-true}"
  "CV_SYNC_ORIGINALS_TO_STORAGE=${CV_SYNC_ORIGINALS_TO_STORAGE:-false}"
  "CV_DELETE_SYNCED_BUNDLES=${CV_DELETE_SYNCED_BUNDLES:-true}"
  "SUPABASE_STORAGE_BUCKET=${SUPABASE_STORAGE_BUCKET:-cv-originals}"
  "GCS_ORIGINALS_BUCKET=${GCS_ORIGINALS_BUCKET}"
  "CV_BUCKET_NAME=${CV_BUCKET_NAME}"
  "MANATAL_API_BASE_URL=${MANATAL_API_BASE_URL:-https://api.manatal.com/open/v3}"
  "MANATAL_PAGE_SIZE=${MANATAL_PAGE_SIZE:-100}"
  "MANATAL_LOOKBACK_HOURS=${MANATAL_LOOKBACK_HOURS:-24}"
  "MANATAL_DOWNLOAD_DIR=${MANATAL_DOWNLOAD_DIR:-/tmp/manatal_downloads}"
  "MANATAL_SYNC_STATE_TABLE=${MANATAL_SYNC_STATE_TABLE:-manatal_candidate_sync}"
)

secret_vars=(
  "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SECRET_NAME}:${SUPABASE_SECRET_VERSION}"
  "GEMINI_API_KEY=${GEMINI_SECRET_NAME}:${GEMINI_SECRET_VERSION}"
  "CV_MODEL_API_KEY=${MODEL_SECRET_NAME}:${MODEL_SECRET_VERSION}"
)
if needs_manatal_api; then
  secret_vars+=("MANATAL_API_TOKEN=${MANATAL_SECRET_NAME}:${MANATAL_SECRET_VERSION}")
fi

env_arg="$(IFS=,; echo "${env_vars[*]}")"
secret_arg="$(IFS=,; echo "${secret_vars[*]}")"

gcloud run jobs deploy "$WORKER_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE_URI" \
  --service-account "$WORKER_SA_EMAIL" \
  --args "$WORKER_ARGS" \
  --cpu "$WORKER_CPU" \
  --memory "$WORKER_MEMORY" \
  --task-timeout "$WORKER_TASK_TIMEOUT" \
  --tasks "$WORKER_TASKS" \
  --parallelism "$WORKER_PARALLELISM" \
  --max-retries "$WORKER_MAX_RETRIES" \
  --set-env-vars "$env_arg" \
  --set-secrets "$secret_arg" \
  ${volume_flags[@]+"${volume_flags[@]}"}

if [[ "$ENABLE_SCHEDULER" == "true" ]]; then
  ensure_scheduler
fi

echo
echo "Worker deployed."
echo "Manual run:"
echo "gcloud run jobs execute ${WORKER_JOB_NAME} --project ${PROJECT_ID} --region ${REGION} --wait"

if [[ "$EXECUTE_NOW" == "true" ]]; then
  gcloud run jobs execute "$WORKER_JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --wait
fi
