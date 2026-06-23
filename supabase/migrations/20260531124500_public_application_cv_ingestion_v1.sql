insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'cv-originals',
  'cv-originals',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.job_applications
add column if not exists resume_source_document_id uuid references public.source_documents (id) on delete set null,
add column if not exists resume_ingestion_status text not null default 'not_uploaded'
  check (resume_ingestion_status in ('not_uploaded', 'queued', 'parsing', 'parsed', 'failed')),
add column if not exists resume_ingestion_error text,
add column if not exists candidate_hub_visibility text not null default 'tenant'
  check (candidate_hub_visibility in ('platform', 'tenant', 'private'));

create index if not exists idx_job_applications_resume_ingestion
on public.job_applications (resume_ingestion_status, submitted_at)
where resume_ingestion_status in ('queued', 'parsing', 'failed');

create index if not exists idx_job_applications_resume_source
on public.job_applications (resume_source_document_id)
where resume_source_document_id is not null;
