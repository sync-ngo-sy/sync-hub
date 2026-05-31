create table if not exists public.job_postings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  employer_name text not null,
  employer_country text not null,
  employer_region text not null check (employer_region in ('GCC', 'EU', 'USA')),
  job_description text not null,
  required_skills text[] not null default '{}'::text[],
  preferred_skills text[] not null default '{}'::text[],
  seniority_level text not null,
  employment_type text not null,
  posted_date date,
  application_deadline date,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  location_info jsonb not null default '{}'::jsonb,
  key_responsibilities text[] not null default '{}'::text[],
  ai_profile jsonb not null default '{}'::jsonb,
  ai_confidence jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users (id) on delete set null,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  closed_at timestamptz,
  closed_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint job_postings_publish_required_chk check (
    status <> 'active'
    or (
      btrim(title) <> ''
      and btrim(employer_name) <> ''
      and btrim(employer_country) <> ''
      and btrim(employer_region) <> ''
      and btrim(job_description) <> ''
      and array_length(required_skills, 1) > 0
      and btrim(seniority_level) <> ''
      and btrim(employment_type) <> ''
    )
  )
);

create table if not exists public.job_ai_extractions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_posting_id uuid references public.job_postings (id) on delete cascade,
  model_provider text not null default 'heuristic',
  model_name text not null default 'local-fallback',
  prompt_version text not null default 'job-extraction-v1',
  input_hash text not null,
  extracted_payload jsonb not null default '{}'::jsonb,
  confidence_payload jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.job_matching_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_posting_id uuid not null references public.job_postings (id) on delete cascade,
  initiated_by_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  requested_limit integer not null default 20,
  semantic_pool_size integer not null default 200,
  rerank_pool_size integer not null default 50,
  retrieved_count integer not null default 0,
  filtered_count integer not null default 0,
  reranked_count integer not null default 0,
  completed_count integer not null default 0,
  failure_reason text,
  matching_config jsonb not null default '{}'::jsonb,
  job_profile jsonb not null default '{}'::jsonb,
  embedding_provider text,
  embedding_version text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.job_matching_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  matching_run_id uuid not null references public.job_matching_runs (id) on delete cascade,
  job_posting_id uuid not null references public.job_postings (id) on delete cascade,
  candidate_id uuid not null,
  rank integer not null,
  semantic_score numeric(8,4) not null default 0,
  ai_score numeric(5,2) not null default 0,
  final_score numeric(5,2) not null default 0,
  matched_skills text[] not null default '{}'::text[],
  missing_skills text[] not null default '{}'::text[],
  seniority_alignment text not null default 'Mismatch' check (seniority_alignment in ('Exact Match', 'Partial Match', 'Mismatch')),
  experience_summary text not null default '',
  match_explanation text not null default '',
  scoring_breakdown jsonb not null default '{}'::jsonb,
  hard_filter_payload jsonb not null default '{}'::jsonb,
  candidate_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (matching_run_id, candidate_id),
  constraint job_matching_results_candidate_tenant_fk
    foreign key (candidate_id, tenant_id)
    references public.candidates (id, tenant_id)
    on delete cascade
);

create table if not exists public.job_shortlists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_posting_id uuid not null references public.job_postings (id) on delete cascade,
  matching_run_id uuid references public.job_matching_runs (id) on delete set null,
  name text not null,
  description text not null default '',
  owner_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (job_posting_id, name)
);

create table if not exists public.job_shortlist_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  shortlist_id uuid not null references public.job_shortlists (id) on delete cascade,
  candidate_id uuid not null,
  saved_rank integer not null,
  saved_score numeric(5,2) not null default 0,
  saved_result_payload jsonb not null default '{}'::jsonb,
  added_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (shortlist_id, candidate_id),
  constraint job_shortlist_candidates_candidate_tenant_fk
    foreign key (candidate_id, tenant_id)
    references public.candidates (id, tenant_id)
    on delete cascade
);

create table if not exists public.job_shortlist_shares (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  shortlist_id uuid not null references public.job_shortlists (id) on delete cascade,
  shared_with_user_id uuid references auth.users (id) on delete cascade,
  permission text not null default 'view' check (permission in ('view', 'edit')),
  shared_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (shortlist_id, shared_with_user_id)
);

create index if not exists idx_job_postings_tenant_status on public.job_postings (tenant_id, status, updated_at desc);
create index if not exists idx_job_postings_created_by on public.job_postings (created_by_user_id, tenant_id);
create index if not exists idx_job_postings_skills_gin on public.job_postings using gin (required_skills);
create index if not exists idx_job_ai_extractions_job on public.job_ai_extractions (job_posting_id, created_at desc);
create index if not exists idx_job_matching_runs_job on public.job_matching_runs (job_posting_id, created_at desc);
create index if not exists idx_job_matching_runs_status on public.job_matching_runs (tenant_id, status);
create index if not exists idx_job_matching_results_run_rank on public.job_matching_results (matching_run_id, rank);
create index if not exists idx_job_matching_results_candidate on public.job_matching_results (tenant_id, candidate_id);
create index if not exists idx_job_shortlists_job on public.job_shortlists (job_posting_id, created_at desc);
create index if not exists idx_job_shortlist_candidates_shortlist_rank on public.job_shortlist_candidates (shortlist_id, saved_rank);

create trigger set_updated_at_job_postings
before update on public.job_postings
for each row execute function public.set_updated_at();

create trigger set_updated_at_job_shortlists
before update on public.job_shortlists
for each row execute function public.set_updated_at();

alter table public.job_postings enable row level security;
alter table public.job_ai_extractions enable row level security;
alter table public.job_matching_runs enable row level security;
alter table public.job_matching_results enable row level security;
alter table public.job_shortlists enable row level security;
alter table public.job_shortlist_candidates enable row level security;
alter table public.job_shortlist_shares enable row level security;

create policy job_postings_select on public.job_postings
for select using (public.is_tenant_editor(tenant_id));

create policy job_postings_write on public.job_postings
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy job_ai_extractions_select on public.job_ai_extractions
for select using (public.is_tenant_editor(tenant_id));

create policy job_ai_extractions_insert on public.job_ai_extractions
for insert with check (public.is_tenant_editor(tenant_id));

create policy job_matching_runs_select on public.job_matching_runs
for select using (public.is_tenant_editor(tenant_id));

create policy job_matching_runs_write on public.job_matching_runs
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy job_matching_results_select on public.job_matching_results
for select using (public.is_tenant_editor(tenant_id));

create policy job_matching_results_write on public.job_matching_results
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy job_shortlists_select on public.job_shortlists
for select using (
  public.is_tenant_editor(tenant_id)
  and (
    owner_user_id = auth.uid()
    or public.is_tenant_admin(tenant_id)
    or exists (
      select 1
      from public.job_shortlist_shares share
      where share.shortlist_id = job_shortlists.id
        and share.shared_with_user_id = auth.uid()
    )
  )
);

create policy job_shortlists_write on public.job_shortlists
for all using (
  public.is_tenant_editor(tenant_id)
  and (owner_user_id = auth.uid() or public.is_tenant_admin(tenant_id))
)
with check (
  public.is_tenant_editor(tenant_id)
  and (owner_user_id = auth.uid() or public.is_tenant_admin(tenant_id))
);

create policy job_shortlist_candidates_select on public.job_shortlist_candidates
for select using (
  public.is_tenant_editor(tenant_id)
  and exists (
    select 1
    from public.job_shortlists shortlist
    where shortlist.id = job_shortlist_candidates.shortlist_id
      and shortlist.tenant_id = job_shortlist_candidates.tenant_id
  )
);

create policy job_shortlist_candidates_write on public.job_shortlist_candidates
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy job_shortlist_shares_select on public.job_shortlist_shares
for select using (public.is_tenant_editor(tenant_id));

create policy job_shortlist_shares_write on public.job_shortlist_shares
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

grant select, insert, update, delete on public.job_postings to authenticated;
grant select, insert on public.job_ai_extractions to authenticated;
grant select, insert, update, delete on public.job_matching_runs to authenticated;
grant select, insert, update, delete on public.job_matching_results to authenticated;
grant select, insert, update, delete on public.job_shortlists to authenticated;
grant select, insert, update, delete on public.job_shortlist_candidates to authenticated;
grant select, insert, update, delete on public.job_shortlist_shares to authenticated;
