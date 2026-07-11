create extension if not exists pgcrypto;
create extension if not exists vector;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tenant_memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'recruiter', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, user_id)
);

create table if not exists public.worker_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  device_name text not null,
  device_fingerprint text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'disabled')),
  last_seen_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, device_fingerprint)
);

create table if not exists public.worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  device_id uuid not null references public.worker_devices (id) on delete cascade,
  status text not null default 'ok',
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.source_documents (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid,
  source_type text not null,
  original_filename text not null,
  mime_type text not null,
  document_sha256 text not null,
  source_uri text not null,
  storage_path text,
  uploaded_by text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, document_sha256)
);

create table if not exists public.candidates (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  headline text,
  current_title text,
  location text,
  years_experience numeric(5,2) not null default 0,
  seniority text not null default 'unclassified',
  primary_role text,
  top_skills text[] not null default '{}'::text[],
  email text,
  phone text,
  links text[] not null default '{}'::text[],
  latest_document_id uuid,
  summary_short text,
  status text not null default 'completed',
  metadata_json jsonb not null default '{}'::jsonb,
  parse_version text,
  normalization_version text,
  embedding_version text,
  artifact_version text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.candidate_profiles (
  candidate_id uuid primary key references public.candidates (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  source_document_id uuid not null references public.source_documents (id) on delete cascade,
  profile_json jsonb not null default '{}'::jsonb,
  timeline_json jsonb not null default '[]'::jsonb,
  skill_matrix_json jsonb not null default '{}'::jsonb,
  raw_text text not null default '',
  confidence numeric(4,3) not null default 0,
  missing_fields text[] not null default '{}'::text[],
  parse_warnings text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.candidate_summaries (
  candidate_id uuid primary key references public.candidates (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  short_summary text not null default '',
  long_summary text not null default '',
  strengths jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  recommended_roles jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  confidence numeric(4,3) not null default 0,
  artifact_version text not null default '1.0.0',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.candidate_skill_map (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  skill_slug text not null,
  canonical_skill text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, candidate_id, skill_slug)
);

create table if not exists public.candidate_chunks (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  source_document_id uuid not null references public.source_documents (id) on delete cascade,
  chunk_type text not null,
  section_name text not null,
  chunk_index integer not null,
  text text not null,
  token_count integer not null default 0,
  source_span jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  embedding vector(768),
  embedding_version text not null,
  parse_version text,
  normalization_version text,
  source_hash text not null,
  is_active boolean not null default true,
  fts tsvector generated always as (to_tsvector('english', coalesce(text, ''))) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.processing_runs (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete set null,
  source_document_id uuid references public.source_documents (id) on delete set null,
  ingestion_run_id uuid not null,
  status text not null check (status in ('queued', 'parsing', 'extracted', 'embedded', 'artifacted', 'completed', 'partial_failed', 'failed')),
  input_hash text not null,
  source_path text not null,
  source_sha256 text not null,
  parser_version text not null,
  model_version text not null,
  prompt_version text not null,
  chunk_version text not null,
  embedding_version text not null,
  warnings text[] not null default '{}'::text[],
  error_code text,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, input_hash)
);

create table if not exists public.comparison_artifacts (
  artifact_key text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_ids uuid[] not null,
  query_fingerprint text not null default '',
  comparison_json jsonb not null default '{}'::jsonb,
  artifact_version text not null default '1.0.0',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_name text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  session_id text,
  trace_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  trace_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tenant_memberships_user on public.tenant_memberships (user_id, tenant_id);
create index if not exists idx_candidates_tenant on public.candidates (tenant_id, current_title, seniority);
create index if not exists idx_candidate_profiles_tenant on public.candidate_profiles (tenant_id);
create index if not exists idx_candidate_summaries_tenant on public.candidate_summaries (tenant_id);
create index if not exists idx_candidate_skill_map_tenant_candidate on public.candidate_skill_map (tenant_id, candidate_id);
create index if not exists idx_candidate_chunks_tenant_candidate on public.candidate_chunks (tenant_id, candidate_id);
create index if not exists idx_candidate_chunks_embedding_version on public.candidate_chunks (tenant_id, embedding_version);
create index if not exists idx_candidate_chunks_fts on public.candidate_chunks using gin (fts);
create index if not exists idx_candidate_chunks_embedding_hnsw
  on public.candidate_chunks
  using hnsw (embedding vector_cosine_ops)
  where is_active;
create index if not exists idx_processing_runs_tenant on public.processing_runs (tenant_id, created_at desc);
create index if not exists idx_worker_heartbeats_tenant on public.worker_heartbeats (tenant_id, created_at desc);
create index if not exists idx_analytics_events_tenant on public.analytics_events (tenant_id, created_at desc);

create trigger set_updated_at_tenants
before update on public.tenants
for each row execute function public.set_updated_at();

create trigger set_updated_at_tenant_memberships
before update on public.tenant_memberships
for each row execute function public.set_updated_at();

create trigger set_updated_at_worker_devices
before update on public.worker_devices
for each row execute function public.set_updated_at();

create trigger set_updated_at_source_documents
before update on public.source_documents
for each row execute function public.set_updated_at();

create trigger set_updated_at_candidates
before update on public.candidates
for each row execute function public.set_updated_at();

create trigger set_updated_at_candidate_profiles
before update on public.candidate_profiles
for each row execute function public.set_updated_at();

create trigger set_updated_at_candidate_summaries
before update on public.candidate_summaries
for each row execute function public.set_updated_at();

create trigger set_updated_at_candidate_chunks
before update on public.candidate_chunks
for each row execute function public.set_updated_at();

create trigger set_updated_at_processing_runs
before update on public.processing_runs
for each row execute function public.set_updated_at();

create trigger set_updated_at_comparison_artifacts
before update on public.comparison_artifacts
for each row execute function public.set_updated_at();

create or replace function public.is_tenant_member(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = target_tenant
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function public.is_tenant_editor(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = target_tenant
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role in ('owner', 'admin', 'recruiter')
  );
$$;

create or replace function public.is_tenant_admin(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = target_tenant
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_tenant_editor(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.worker_devices enable row level security;
alter table public.worker_heartbeats enable row level security;
alter table public.source_documents enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.candidate_summaries enable row level security;
alter table public.candidate_skill_map enable row level security;
alter table public.candidate_chunks enable row level security;
alter table public.processing_runs enable row level security;
alter table public.comparison_artifacts enable row level security;
alter table public.analytics_events enable row level security;
alter table public.audit_events enable row level security;

create policy tenants_select on public.tenants
for select using (public.is_tenant_member(id));

create policy tenants_update on public.tenants
for update using (public.is_tenant_admin(id))
with check (public.is_tenant_admin(id));

create policy tenant_memberships_select on public.tenant_memberships
for select using (user_id = auth.uid() or public.is_tenant_admin(tenant_id));

create policy tenant_memberships_insert on public.tenant_memberships
for insert with check (public.is_tenant_admin(tenant_id));

create policy tenant_memberships_update on public.tenant_memberships
for update using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

create policy worker_devices_read on public.worker_devices
for select using (public.is_tenant_member(tenant_id));

create policy worker_devices_write on public.worker_devices
for all using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

create policy worker_heartbeats_read on public.worker_heartbeats
for select using (public.is_tenant_member(tenant_id));

create policy worker_heartbeats_write on public.worker_heartbeats
for insert with check (public.is_tenant_editor(tenant_id));

create policy source_documents_read on public.source_documents
for select using (public.is_tenant_member(tenant_id));

create policy source_documents_write on public.source_documents
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy candidates_read on public.candidates
for select using (public.is_tenant_member(tenant_id));

create policy candidates_write on public.candidates
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy candidate_profiles_read on public.candidate_profiles
for select using (public.is_tenant_member(tenant_id));

create policy candidate_profiles_write on public.candidate_profiles
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy candidate_summaries_read on public.candidate_summaries
for select using (public.is_tenant_member(tenant_id));

create policy candidate_summaries_write on public.candidate_summaries
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy candidate_skill_map_read on public.candidate_skill_map
for select using (public.is_tenant_member(tenant_id));

create policy candidate_skill_map_write on public.candidate_skill_map
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy candidate_chunks_read on public.candidate_chunks
for select using (public.is_tenant_member(tenant_id));

create policy candidate_chunks_write on public.candidate_chunks
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy processing_runs_read on public.processing_runs
for select using (public.is_tenant_member(tenant_id));

create policy processing_runs_write on public.processing_runs
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy comparison_artifacts_read on public.comparison_artifacts
for select using (public.is_tenant_member(tenant_id));

create policy comparison_artifacts_write on public.comparison_artifacts
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy analytics_events_read on public.analytics_events
for select using (public.is_tenant_member(tenant_id));

create policy analytics_events_write on public.analytics_events
for insert with check (public.is_tenant_member(tenant_id));

create policy audit_events_read on public.audit_events
for select using (public.is_tenant_admin(tenant_id));

create policy audit_events_write on public.audit_events
for insert with check (public.is_tenant_editor(tenant_id));

create policy storage_cv_private_read on storage.objects
for select to authenticated
using (
  bucket_id = 'cv-originals'
  and public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

create policy storage_cv_private_write on storage.objects
for insert to authenticated
with check (
  bucket_id = 'cv-originals'
  and public.is_tenant_editor((storage.foldername(name))[1]::uuid)
);

create or replace view public.candidate_search_rows as
select
  c.tenant_id,
  c.id as candidate_id,
  c.name,
  c.headline,
  c.current_title,
  c.location,
  c.years_experience,
  c.seniority,
  c.primary_role,
  coalesce(array_agg(distinct csm.canonical_skill) filter (where csm.canonical_skill is not null), c.top_skills) as skills,
  c.summary_short,
  s.short_summary as stored_short_summary,
  s.confidence as summary_confidence,
  c.status,
  c.metadata_json as profile_attributes,
  c.parse_version,
  c.normalization_version,
  c.embedding_version,
  c.artifact_version,
  c.created_at,
  c.updated_at
from public.candidates c
left join public.candidate_skill_map csm
  on csm.tenant_id = c.tenant_id
 and csm.candidate_id = c.id
left join public.candidate_summaries s
  on s.tenant_id = c.tenant_id
 and s.candidate_id = c.id
group by c.tenant_id, c.id, s.short_summary, s.confidence;

create or replace view public.candidate_dossier_v1 as
select
  c.tenant_id,
  c.id as candidate_id,
  c.name,
  c.headline,
  c.current_title,
  c.location,
  c.years_experience,
  c.seniority,
  c.primary_role,
  c.top_skills,
  c.email,
  c.phone,
  c.links,
  c.summary_short,
  c.status,
  c.parse_version,
  c.normalization_version,
  c.embedding_version,
  c.artifact_version,
  cp.profile_json,
  cp.timeline_json,
  cp.skill_matrix_json,
  cp.missing_fields,
  cp.parse_warnings,
  cs.short_summary,
  cs.long_summary,
  cs.strengths,
  cs.risks,
  cs.recommended_roles,
  cs.evidence_refs,
  cs.confidence,
  sd.id as source_document_id,
  sd.original_filename,
  sd.mime_type,
  sd.storage_path,
  sd.source_uri
from public.candidates c
left join public.candidate_profiles cp
  on cp.tenant_id = c.tenant_id
 and cp.candidate_id = c.id
left join public.candidate_summaries cs
  on cs.tenant_id = c.tenant_id
 and cs.candidate_id = c.id
left join public.source_documents sd
  on sd.tenant_id = c.tenant_id
 and sd.id = c.latest_document_id;

grant select on public.candidate_search_rows to authenticated;
grant select on public.candidate_dossier_v1 to authenticated;

create or replace function public.search_candidates_v1(
  p_q text default '',
  p_query_embedding vector(768) default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_role text default null,
  p_seniority text default null,
  p_min_years numeric default null,
  p_skills text[] default '{}'::text[],
  p_embedding_version text default null,
  p_rank_version text default 'v1'
)
returns table (
  candidate_id uuid,
  name text,
  current_title text,
  location text,
  years_experience numeric,
  seniority text,
  primary_role text,
  score double precision,
  subscores jsonb,
  matched_filters jsonb,
  summary_short text,
  evidence jsonb,
  meta jsonb
)
language sql
stable
as $$
with filtered_candidates as (
  select csr.*
  from public.candidate_search_rows csr
  where public.is_tenant_member(csr.tenant_id)
    and (p_role is null or csr.primary_role = p_role or csr.current_title ilike '%' || p_role || '%' or csr.headline ilike '%' || p_role || '%')
    and (p_seniority is null or csr.seniority = p_seniority)
    and (p_min_years is null or csr.years_experience >= p_min_years)
    and (
      coalesce(array_length(p_skills, 1), 0) = 0
      or not exists (
        select 1
        from unnest(p_skills) req
        where not exists (
          select 1
          from unnest(coalesce(csr.skills, '{}'::text[])) actual
          where lower(actual) = lower(req)
        )
      )
    )
),
filtered_chunks as (
  select ch.*
  from public.candidate_chunks ch
  join filtered_candidates fc
    on fc.tenant_id = ch.tenant_id
   and fc.candidate_id = ch.candidate_id
  where ch.is_active
),
fts_hits as (
  select
    ch.candidate_id,
    ch.id as chunk_id,
    row_number() over (
      order by ts_rank_cd(ch.fts, websearch_to_tsquery('english', trim(p_q))) desc, ch.id
    ) as ft_rank,
    ts_rank_cd(ch.fts, websearch_to_tsquery('english', trim(p_q))) as lexical_score,
    ts_headline('english', ch.text, websearch_to_tsquery('english', trim(p_q)), 'MaxFragments=2, MinWords=8, MaxWords=20') as snippet
  from filtered_chunks ch
  where trim(coalesce(p_q, '')) <> ''
    and ch.fts @@ websearch_to_tsquery('english', trim(p_q))
  limit greatest(p_limit * 10, 100)
),
semantic_hits as (
  select
    ch.candidate_id,
    ch.id as chunk_id,
    row_number() over (
      order by ch.embedding <=> p_query_embedding, ch.id
    ) as sem_rank,
    greatest(0::double precision, 1 - (ch.embedding <=> p_query_embedding)) as semantic_similarity,
    left(ch.text, 240) as snippet
  from filtered_chunks ch
  where p_query_embedding is not null
    and (p_embedding_version is null or ch.embedding_version = p_embedding_version)
    and ch.embedding is not null
  order by ch.embedding <=> p_query_embedding, ch.id
  limit greatest(p_limit * 15, 150)
),
chunk_fusion as (
  select
    coalesce(f.chunk_id, s.chunk_id) as chunk_id,
    coalesce(f.candidate_id, s.candidate_id) as candidate_id,
    coalesce(1.0 / (50 + f.ft_rank), 0)
      + coalesce(1.0 / (50 + s.sem_rank), 0) as chunk_rrf,
    coalesce(f.lexical_score, 0) as lexical_score,
    coalesce(s.semantic_similarity, 0) as semantic_similarity,
    coalesce(f.snippet, s.snippet) as evidence_text
  from fts_hits f
  full outer join semantic_hits s
    on s.chunk_id = f.chunk_id
),
ranked_chunks as (
  select
    cf.*,
    row_number() over (
      partition by cf.candidate_id
      order by cf.chunk_rrf desc, cf.chunk_id
    ) as candidate_chunk_rank
  from chunk_fusion cf
),
candidate_scores as (
  select
    fc.candidate_id,
    coalesce(max(rc.semantic_similarity), 0) as semantic_similarity,
    coalesce(max(rc.chunk_rrf), 0) as max_chunk_rrf,
    coalesce(avg(case when rc.candidate_chunk_rank <= 3 then rc.chunk_rrf end), 0) as avg_top3_chunk_rrf,
    case
      when coalesce(array_length(p_skills, 1), 0) = 0 then 0
      else (
        select coalesce(count(*), 0)::double precision / array_length(p_skills, 1)::double precision
        from unnest(p_skills) req
        where exists (
          select 1
          from unnest(coalesce(fc.skills, '{}'::text[])) actual
          where lower(actual) = lower(req)
        )
      )
    end as skill_match,
    case
      when p_min_years is null or p_min_years = 0 then least(coalesce(fc.years_experience, 0)::double precision / 10.0, 1.0)
      else least(coalesce(fc.years_experience, 0)::double precision / p_min_years::double precision, 1.0)
    end as experience_match,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'chunk_id', rc.chunk_id,
          'text', rc.evidence_text,
          'rrf_score', round(rc.chunk_rrf::numeric, 6),
          'semantic_similarity', round(rc.semantic_similarity::numeric, 4)
        )
        order by rc.chunk_rrf desc
      ) filter (where rc.chunk_id is not null and rc.candidate_chunk_rank <= 3),
      '[]'::jsonb
    ) as evidence
  from filtered_candidates fc
  left join ranked_chunks rc
    on rc.candidate_id = fc.candidate_id
  group by fc.candidate_id, fc.skills, fc.years_experience
),
scored as (
  select
    fc.candidate_id,
    fc.name,
    fc.current_title,
    fc.location,
    fc.years_experience,
    fc.seniority,
    fc.primary_role,
    (
      (0.75 * cs.max_chunk_rrf)
      + (0.20 * cs.avg_top3_chunk_rrf)
      + (0.05 * cs.skill_match)
    ) as score,
    jsonb_build_object(
      'semantic_similarity', round(cs.semantic_similarity::numeric, 4),
      'skill_match', round(cs.skill_match::numeric, 4),
      'experience_match', round(cs.experience_match::numeric, 4),
      'max_chunk_rrf', round(cs.max_chunk_rrf::numeric, 6),
      'avg_top3_chunk_rrf', round(cs.avg_top3_chunk_rrf::numeric, 6)
    ) as subscores,
    jsonb_build_object(
      'required_skills', to_jsonb(coalesce(p_skills, '{}'::text[])),
      'matched_skills', (
        select coalesce(jsonb_agg(actual), '[]'::jsonb)
        from unnest(coalesce(fc.skills, '{}'::text[])) actual
        where exists (
          select 1 from unnest(coalesce(p_skills, '{}'::text[])) req where lower(req) = lower(actual)
        )
      ),
      'role', p_role,
      'seniority', p_seniority,
      'min_years_experience', p_min_years
    ) as matched_filters,
    coalesce(nullif(fc.summary_short, ''), fc.stored_short_summary, '') as summary_short,
    cs.evidence,
    jsonb_build_object(
      'rank_version', p_rank_version,
      'embedding_version', fc.embedding_version,
      'parse_version', fc.parse_version,
      'normalization_version', fc.normalization_version,
      'artifact_version', fc.artifact_version
    ) as meta
  from filtered_candidates fc
  join candidate_scores cs
    on cs.candidate_id = fc.candidate_id
)
select
  scored.candidate_id,
  scored.name,
  scored.current_title,
  scored.location,
  scored.years_experience,
  scored.seniority,
  scored.primary_role,
  scored.score,
  scored.subscores,
  scored.matched_filters,
  scored.summary_short,
  scored.evidence,
  scored.meta
from scored
order by scored.score desc, scored.years_experience desc, scored.name asc
limit greatest(p_limit, 1)
offset greatest(p_offset, 0);
$$;

grant execute on function public.search_candidates_v1(text, vector, integer, integer, text, text, numeric, text[], text, text) to authenticated;

create or replace function public.retrieve_candidate_evidence_v1(
  p_candidate_ids uuid[],
  p_q text default '',
  p_limit integer default 12,
  p_query_embedding vector(768) default null,
  p_embedding_version text default null
)
returns table (
  candidate_id uuid,
  chunk_id uuid,
  chunk_type text,
  section_name text,
  text text,
  lexical_score real,
  semantic_similarity double precision
)
language sql
stable
as $$
with scoped as (
  select ch.*
  from public.candidate_chunks ch
  where public.is_tenant_member(ch.tenant_id)
    and ch.candidate_id = any(p_candidate_ids)
    and ch.is_active
),
ranked as (
  select
    ch.candidate_id,
    ch.id as chunk_id,
    ch.chunk_type,
    ch.section_name,
    ch.text,
    case
      when trim(coalesce(p_q, '')) <> '' then ts_rank_cd(ch.fts, websearch_to_tsquery('english', trim(p_q)))
      else 0
    end as lexical_score,
    case
      when p_query_embedding is not null and (p_embedding_version is null or ch.embedding_version = p_embedding_version) and ch.embedding is not null
        then greatest(0::double precision, 1 - (ch.embedding <=> p_query_embedding))
      else 0
    end as semantic_similarity
  from scoped ch
)
select
  candidate_id,
  chunk_id,
  chunk_type,
  section_name,
  text,
  lexical_score,
  semantic_similarity
from ranked
order by (lexical_score + semantic_similarity) desc, candidate_id
limit greatest(p_limit, 1);
$$;

grant execute on function public.retrieve_candidate_evidence_v1(uuid[], text, integer, vector, text) to authenticated;
