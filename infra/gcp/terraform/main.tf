locals {
  image_uri = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repository}/${var.worker_image_name}:${var.worker_image_tag}"

  default_worker_env = {
    CV_SOURCE_DIR                = var.cv_source_dir
    CV_WORKER_UPLOADED_BY        = "gcp-cloud-run-job"
    CV_EXTRACTION_PROVIDER       = "openai-compatible"
    CV_EXTRACTION_MODEL          = "gemini-2.5-flash"
    CV_MODEL_BASE_URL            = "https://generativelanguage.googleapis.com/v1beta/openai"
    CV_EMBEDDING_PROVIDER        = "openai"
    CV_EMBEDDING_MODEL           = "gemini-embedding-001"
    CV_EMBEDDING_VERSION         = "gemini-embedding-001-768-v1"
    CV_EMBEDDING_DIMENSION       = "768"
    CV_INGEST_CONCURRENCY        = "4"
    CV_BATCH_SIZE                = "8"
    CV_EMBEDDING_BATCH_SIZE      = "16"
    CV_SUPABASE_BATCH_SIZE       = "50"
    CV_REQUEST_TIMEOUT_SECONDS   = "60"
    CV_PROGRESS_INTERVAL         = "25"
    CV_DEDUPE_SOURCE_DOCUMENTS   = "true"
    CV_SYNC_ORIGINALS_TO_STORAGE = "false"
    CV_DELETE_SYNCED_BUNDLES     = "true"
    SUPABASE_STORAGE_BUCKET      = "cv-originals"
  }

  merged_worker_env = merge(local.default_worker_env, var.worker_env)
}

resource "google_storage_bucket" "cv_originals" {
  count = var.create_cv_bucket ? 1 : 0

  name                        = var.cv_bucket_name
  location                    = var.cv_bucket_location
  storage_class               = var.cv_bucket_storage_class
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.cv_bucket_labels

  versioning {
    enabled = var.cv_bucket_versioning_enabled
  }

  soft_delete_policy {
    retention_duration_seconds = var.cv_bucket_soft_delete_retention_seconds
  }
}

resource "google_artifact_registry_repository" "worker" {
  count         = var.create_artifact_registry_repository ? 1 : 0
  location      = var.region
  repository_id = var.artifact_registry_repository
  description   = "Docker images for the CV Intelligence worker"
  format        = "DOCKER"
}

resource "google_service_account" "worker" {
  account_id   = "cv-worker"
  display_name = "CV Intelligence Worker"
}

resource "google_service_account" "document_signer" {
  count = var.create_document_signer_service_account ? 1 : 0

  account_id   = var.document_signer_service_account_id
  display_name = "CV Document URL Signer"
}

resource "google_storage_bucket_iam_member" "worker_cv_reader" {
  bucket = var.cv_bucket_name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.worker.email}"

  depends_on = [google_storage_bucket.cv_originals]
}

resource "google_storage_bucket_iam_member" "document_signer_cv_reader" {
  count = var.create_document_signer_service_account ? 1 : 0

  bucket = var.cv_bucket_name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.document_signer[0].email}"

  depends_on = [google_storage_bucket.cv_originals]
}

resource "google_service_account_iam_member" "document_signer_self_token_creator" {
  count = var.create_document_signer_service_account ? 1 : 0

  service_account_id = google_service_account.document_signer[0].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.document_signer[0].email}"
}

resource "google_secret_manager_secret_iam_member" "worker_secret_access" {
  for_each  = toset(values(var.worker_secret_env))
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_cloud_run_v2_job" "worker_ingest" {
  name                = var.worker_job_name
  location            = var.region
  deletion_protection = false

  template {
    task_count  = var.task_count
    parallelism = var.parallelism

    template {
      service_account = google_service_account.worker.email
      timeout         = var.task_timeout
      max_retries     = var.max_retries

      containers {
        image = local.image_uri

        args = var.worker_args

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }

        dynamic "env" {
          for_each = local.merged_worker_env
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = var.worker_secret_env
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }

        volume_mounts {
          name       = "cv-source"
          mount_path = "/mnt/cvs"
        }
      }

      volumes {
        name = "cv-source"
        gcs {
          bucket    = var.cv_bucket_name
          read_only = true
        }
      }
    }
  }

  depends_on = [
    google_storage_bucket_iam_member.worker_cv_reader,
    google_secret_manager_secret_iam_member.worker_secret_access,
  ]
}

resource "google_service_account" "scheduler" {
  count        = var.enable_scheduler ? 1 : 0
  account_id   = "cv-worker-scheduler"
  display_name = "CV Worker Scheduler"
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_invoker" {
  count    = var.enable_scheduler ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.worker_ingest.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler[0].email}"
}

resource "google_cloud_scheduler_job" "worker_ingest" {
  count       = var.enable_scheduler ? 1 : 0
  name        = var.scheduler_name
  description = "Scheduled CV Intelligence worker ingestion run"
  region      = var.region
  schedule    = var.scheduler_cron
  time_zone   = var.scheduler_time_zone

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.worker_ingest.name}:run"

    oauth_token {
      service_account_email = google_service_account.scheduler[0].email
    }
  }

  depends_on = [
    google_cloud_run_v2_job_iam_member.scheduler_invoker,
  ]
}
