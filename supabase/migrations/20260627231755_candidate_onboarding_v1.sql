BEGIN;

create table if not exists public.candidate_registration_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  onboarding_step integer not null default 1,
  primary_specialization text,
  cv_storage_path text,
  cv_original_filename text,
  cv_mime_type text,
  cv_size_bytes integer,
  parsed_profile_json jsonb not null default '{}'::jsonb,
  field_confidence_json jsonb not null default '{}'::jsonb,
  user_overrides_json jsonb not null default '{}'::jsonb,
  parse_status text not null default 'pending'
    check (parse_status in ('pending','parsing','completed','failed','pending_validation')),
  parse_error text,
  parse_started_at timestamptz,
  parse_completed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id)
);

alter table public.candidates add column if not exists profile_photo_path text;
alter table public.candidates add column if not exists linkedin_url text;
alter table public.candidates add column if not exists github_url text;
alter table public.candidates add column if not exists portfolio_url text;
alter table public.candidates add column if not exists professional_summary text;
alter table public.candidates add column if not exists career_preferences jsonb not null default '{}'::jsonb;
alter table public.candidates add column if not exists registered_user_id uuid references auth.users (id) on delete set null;

alter table public.candidates add column if not exists is_published boolean not null default true;

alter table public.candidates add column if not exists primary_specialization text;
alter table public.candidates add column if not exists published_at timestamptz;

alter table public.candidate_profiles add column if not exists field_confidence jsonb not null default '{}'::jsonb;

create table if not exists public.candidate_skills_detailed (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  skill_name text not null,
  proficiency_level text not null
    check (proficiency_level in ('beginner','intermediate','advanced','expert')),
  years_of_experience numeric(4,1) not null default 0,
  last_used_year integer,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','ai_verified','self_declared','confirmed')),
  confidence integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, candidate_id, skill_name)
);

create index if not exists idx_candidate_skills_tenant_id on public.candidate_skills_detailed(tenant_id);
create index if not exists idx_candidate_skills_candidate_id on public.candidate_skills_detailed(candidate_id);

create table if not exists public.candidate_certifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  certification_name text not null,
  issuing_body text,
  issue_date text,
  expiry_date text,
  verification_url text,
  confidence integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_candidate_certs_tenant_id on public.candidate_certifications(tenant_id);
create index if not exists idx_candidate_certs_candidate_id on public.candidate_certifications(candidate_id);

alter table public.candidate_registration_drafts enable row level security;

create policy registration_drafts_owner on public.candidate_registration_drafts
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

alter table public.candidate_skills_detailed enable row level security;

create policy skills_read on public.candidate_skills_detailed
for select using (public.is_tenant_member(tenant_id));

create policy skills_write on public.candidate_skills_detailed
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

alter table public.candidate_certifications enable row level security;

create policy certs_read on public.candidate_certifications
for select using (public.is_tenant_member(tenant_id));

create policy certs_write on public.candidate_certifications
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-cvs',
  'candidate-cvs',
  false,
  5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
) on conflict (id) do nothing;

create policy "Allow candidates to upload CVs" on storage.objects
for insert to authenticated
with check (bucket_id = 'candidate-cvs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Allow candidates to read own CVs" on storage.objects
for select to authenticated
using (bucket_id = 'candidate-cvs' and auth.uid()::text = (storage.foldername(name))[1]);

-- Explicit Least-Privilege Grants (Architectural Hardening)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.candidate_registration_drafts TO authenticated;
GRANT ALL ON TABLE public.candidate_registration_drafts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.candidate_skills_detailed TO authenticated;
GRANT ALL ON TABLE public.candidate_skills_detailed TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.candidate_certifications TO authenticated;
GRANT ALL ON TABLE public.candidate_certifications TO service_role;

COMMIT;
