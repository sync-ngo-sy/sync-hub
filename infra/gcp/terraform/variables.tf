variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "GCP region for Artifact Registry, Cloud Run Jobs, and Scheduler."
  type        = string
  default     = "us-central1"
}

variable "artifact_registry_repository" {
  description = "Artifact Registry Docker repository id."
  type        = string
  default     = "cv-intelligence"
}

variable "create_artifact_registry_repository" {
  description = "Whether Terraform should create the Artifact Registry Docker repository."
  type        = bool
  default     = true
}

variable "worker_image_name" {
  description = "Worker image name inside Artifact Registry."
  type        = string
  default     = "cv-worker"
}

variable "worker_image_tag" {
  description = "Worker image tag."
  type        = string
  default     = "latest"
}

variable "worker_job_name" {
  description = "Cloud Run Job name."
  type        = string
  default     = "cv-worker-ingest"
}

variable "cv_bucket_name" {
  description = "GCS bucket that stores source CV files."
  type        = string
}

variable "cv_source_dir" {
  description = "Mounted input directory passed to the worker."
  type        = string
  default     = "/mnt/cvs/demo"
}

variable "worker_env" {
  description = "Plain environment variables for the worker. Do not put secrets here."
  type        = map(string)
  default     = {}
}

variable "worker_args" {
  description = "Command arguments passed to the worker image. Use [\"manatal-sync\", \"--pretty\"] for Manatal sync."
  type        = list(string)
  default     = ["ingest", "--pretty"]
}

variable "worker_secret_env" {
  description = "Map of worker environment variable name to Secret Manager secret id."
  type        = map(string)
  default = {
    SUPABASE_SERVICE_ROLE_KEY = "supabase-service-role-key"
    GEMINI_API_KEY            = "gemini-api-key"
    CV_MODEL_API_KEY          = "gemini-api-key"
    MANATAL_API_TOKEN         = "manatal-api-token"
  }
}

variable "cpu" {
  description = "Cloud Run task CPU."
  type        = string
  default     = "2"
}

variable "memory" {
  description = "Cloud Run task memory."
  type        = string
  default     = "4Gi"
}

variable "task_timeout" {
  description = "Cloud Run task timeout."
  type        = string
  default     = "3600s"
}

variable "task_count" {
  description = "Number of Cloud Run Job tasks."
  type        = number
  default     = 1
}

variable "parallelism" {
  description = "Cloud Run Job parallelism."
  type        = number
  default     = 1
}

variable "max_retries" {
  description = "Cloud Run Job max retries per task."
  type        = number
  default     = 1
}

variable "enable_scheduler" {
  description = "Create a Cloud Scheduler trigger for the worker job."
  type        = bool
  default     = false
}

variable "scheduler_name" {
  description = "Cloud Scheduler job name."
  type        = string
  default     = "cv-worker-ingest-schedule"
}

variable "scheduler_cron" {
  description = "Cloud Scheduler cron expression."
  type        = string
  default     = "0 2 * * *"
}

variable "scheduler_time_zone" {
  description = "Cloud Scheduler time zone."
  type        = string
  default     = "Asia/Dubai"
}
