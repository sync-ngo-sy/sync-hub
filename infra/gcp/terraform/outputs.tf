output "worker_image_uri" {
  description = "Worker image URI expected by the Cloud Run Job."
  value       = local.image_uri
}

output "worker_service_account" {
  description = "Cloud Run Job service account."
  value       = google_service_account.worker.email
}

output "worker_job_name" {
  description = "Cloud Run Job name."
  value       = google_cloud_run_v2_job.worker_ingest.name
}

output "run_worker_command" {
  description = "Manual command to execute the worker job."
  value       = "gcloud run jobs execute ${google_cloud_run_v2_job.worker_ingest.name} --region ${var.region} --wait"
}
