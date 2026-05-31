alter table public.candidates
add column if not exists hub_visibility text not null default 'platform'
check (hub_visibility in ('platform', 'tenant', 'private'));

alter table public.candidate_search_cache
add column if not exists hub_visibility text not null default 'platform'
check (hub_visibility in ('platform', 'tenant', 'private'));

create index if not exists idx_candidates_hub_visibility
on public.candidates (hub_visibility, updated_at desc);

create index if not exists idx_candidate_search_cache_hub_visibility
on public.candidate_search_cache (hub_visibility, updated_at desc);

create or replace function public.can_search_cv_hub()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.user_id = auth.uid()
        and tm.status = 'active'
    );
$$;

create or replace function public.can_read_candidate(target_tenant uuid, target_candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_tenant_member(target_tenant)
    or (
      public.can_search_cv_hub()
      and exists (
        select 1
        from public.candidates c
        where c.tenant_id = target_tenant
          and c.id = target_candidate
          and c.hub_visibility = 'platform'
      )
    );
$$;

grant execute on function public.can_search_cv_hub() to authenticated;
grant execute on function public.can_read_candidate(uuid, uuid) to authenticated;

drop policy if exists source_documents_read on public.source_documents;
create policy source_documents_read on public.source_documents
for select using (
  public.is_tenant_member(tenant_id)
  or (
    public.can_search_cv_hub()
    and exists (
      select 1
      from public.candidates c
      where c.tenant_id = source_documents.tenant_id
        and c.hub_visibility = 'platform'
        and (
          c.id = source_documents.candidate_id
          or c.latest_document_id = source_documents.id
        )
    )
  )
);

drop policy if exists candidates_read on public.candidates;
create policy candidates_read on public.candidates
for select using (
  public.is_tenant_member(tenant_id)
  or (hub_visibility = 'platform' and public.can_search_cv_hub())
);

drop policy if exists candidate_profiles_read on public.candidate_profiles;
create policy candidate_profiles_read on public.candidate_profiles
for select using (public.can_read_candidate(tenant_id, candidate_id));

drop policy if exists candidate_summaries_read on public.candidate_summaries;
create policy candidate_summaries_read on public.candidate_summaries
for select using (public.can_read_candidate(tenant_id, candidate_id));

drop policy if exists candidate_skill_map_read on public.candidate_skill_map;
create policy candidate_skill_map_read on public.candidate_skill_map
for select using (public.can_read_candidate(tenant_id, candidate_id));

drop policy if exists candidate_chunks_read on public.candidate_chunks;
create policy candidate_chunks_read on public.candidate_chunks
for select using (public.can_read_candidate(tenant_id, candidate_id));

drop policy if exists candidate_search_cache_select on public.candidate_search_cache;
create policy candidate_search_cache_select
on public.candidate_search_cache
for select
using (
  public.is_tenant_member(tenant_id)
  or (hub_visibility = 'platform' and public.can_search_cv_hub())
);

create or replace function public.refresh_candidate_search_cache_v1()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  refreshed_count bigint;
begin
  insert into public.candidate_search_cache (
    tenant_id,
    candidate_id,
    name,
    email,
    phone,
    headline,
    current_title,
    location,
    years_experience,
    seniority,
    primary_role,
    role_tags,
    skills,
    companies,
    summary_short,
    stored_short_summary,
    summary_confidence,
    status,
    parse_version,
    normalization_version,
    embedding_version,
    artifact_version,
    created_at,
    updated_at,
    hub_visibility,
    refreshed_at
  )
  select
    csr.tenant_id,
    csr.candidate_id,
    csr.name,
    csr.email,
    csr.phone,
    csr.headline,
    csr.current_title,
    csr.location,
    csr.years_experience,
    csr.seniority,
    csr.primary_role,
    coalesce(csr.role_tags, '{}'::text[]),
    coalesce(csr.skills, '{}'::text[]),
    coalesce(csr.companies, '{}'::text[]),
    csr.summary_short,
    csr.stored_short_summary,
    csr.summary_confidence,
    csr.status,
    csr.parse_version,
    csr.normalization_version,
    csr.embedding_version,
    csr.artifact_version,
    csr.created_at,
    csr.updated_at,
    c.hub_visibility,
    now()
  from public.candidate_search_rows csr
  join public.candidates c
    on c.tenant_id = csr.tenant_id
   and c.id = csr.candidate_id
  on conflict (tenant_id, candidate_id) do update
  set
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    headline = excluded.headline,
    current_title = excluded.current_title,
    location = excluded.location,
    years_experience = excluded.years_experience,
    seniority = excluded.seniority,
    primary_role = excluded.primary_role,
    role_tags = excluded.role_tags,
    skills = excluded.skills,
    companies = excluded.companies,
    summary_short = excluded.summary_short,
    stored_short_summary = excluded.stored_short_summary,
    summary_confidence = excluded.summary_confidence,
    status = excluded.status,
    parse_version = excluded.parse_version,
    normalization_version = excluded.normalization_version,
    embedding_version = excluded.embedding_version,
    artifact_version = excluded.artifact_version,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    hub_visibility = excluded.hub_visibility,
    refreshed_at = excluded.refreshed_at;

  get diagnostics refreshed_count = row_count;

  delete from public.candidate_search_cache cache
  where not exists (
    select 1
    from public.candidates c
    where c.tenant_id = cache.tenant_id
      and c.id = cache.candidate_id
  );

  return refreshed_count;
end;
$$;

grant execute on function public.refresh_candidate_search_cache_v1() to authenticated;

create or replace function public.workspace_stats_v1(
  p_tenant_ids uuid[] default null
)
returns table (
  document_count bigint,
  candidate_count bigint,
  company_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
with scoped_candidates as (
  select c.tenant_id, c.id, c.latest_document_id
  from public.candidates c
  where (
    coalesce(array_length(p_tenant_ids, 1), 0) = 0
    and public.can_read_candidate(c.tenant_id, c.id)
  )
  or (
    coalesce(array_length(p_tenant_ids, 1), 0) > 0
    and c.tenant_id = any(p_tenant_ids)
    and public.is_tenant_member(c.tenant_id)
  )
),
scoped_documents as (
  select distinct sd.id
  from public.source_documents sd
  join scoped_candidates sc
    on sc.tenant_id = sd.tenant_id
   and (sc.id = sd.candidate_id or sc.latest_document_id = sd.id)
)
select
  (select count(*) from scoped_documents) as document_count,
  (select count(*) from scoped_candidates) as candidate_count,
  0::bigint as company_count;
$$;

grant execute on function public.workspace_stats_v1(uuid[]) to authenticated;

create or replace function public.search_semantic_rerank_v1(
  p_query_embedding vector(768),
  p_tenant_ids uuid[] default null,
  p_candidate_ids uuid[] default null,
  p_embedding_version text default null,
  p_limit integer default 300
)
returns table (
  candidate_id uuid,
  best_similarity double precision,
  evidence jsonb
)
language sql
stable
as $$
with ranked_chunks as (
  select
    ch.candidate_id,
    ch.id as chunk_id,
    greatest(0::double precision, 1 - (ch.embedding <=> p_query_embedding)) as semantic_similarity,
    left(ch.text, 240) as evidence_text,
    row_number() over (
      partition by ch.candidate_id
      order by ch.embedding <=> p_query_embedding, ch.id
    ) as candidate_chunk_rank
  from public.candidate_chunks ch
  where p_query_embedding is not null
    and public.can_read_candidate(ch.tenant_id, ch.candidate_id)
    and ch.is_active
    and ch.embedding is not null
    and (p_embedding_version is null or ch.embedding_version = p_embedding_version)
    and (
      coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or ch.tenant_id = any(p_tenant_ids)
    )
    and (
      coalesce(array_length(p_candidate_ids, 1), 0) = 0
      or ch.candidate_id = any(p_candidate_ids)
    )
  order by ch.embedding <=> p_query_embedding, ch.id
  limit greatest(p_limit, 1)
)
select
  ranked_chunks.candidate_id,
  max(ranked_chunks.semantic_similarity) as best_similarity,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'chunk_id', ranked_chunks.chunk_id,
        'text', ranked_chunks.evidence_text,
        'semantic_similarity', round(ranked_chunks.semantic_similarity::numeric, 4)
      )
      order by ranked_chunks.semantic_similarity desc
    ) filter (where ranked_chunks.candidate_chunk_rank <= 2),
    '[]'::jsonb
  ) as evidence
from ranked_chunks
group by ranked_chunks.candidate_id;
$$;

grant execute on function public.search_semantic_rerank_v1(vector, uuid[], uuid[], text, integer) to authenticated;

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
  where public.can_read_candidate(ch.tenant_id, ch.candidate_id)
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
  p_rank_version text default 'v1',
  p_tenant_ids uuid[] default null,
  p_filter_role text default null,
  p_filter_seniority text default null,
  p_filter_min_years numeric default null,
  p_filter_skills text[] default '{}'::text[],
  p_filter_location text default null,
  p_filter_companies text[] default '{}'::text[]
)
returns table (
  tenant_id uuid,
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
with query_terms as (
  select
    nullif(trim(coalesce(p_q, '')), '') as query_text,
    case
      when nullif(trim(coalesce(p_q, '')), '') is null then null::tsquery
      else websearch_to_tsquery('english', trim(p_q))
    end as query_ts
),
filtered_candidates as (
  select csr.*
  from public.candidate_search_rows csr
  where public.can_read_candidate(csr.tenant_id, csr.candidate_id)
    and (
      coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or csr.tenant_id = any(p_tenant_ids)
    )
    and (
      p_filter_role is null
      or public.search_role_match_v1(
        p_filter_role,
        csr.primary_role,
        csr.role_tags,
        csr.current_title,
        csr.headline
      ) >= 0.9::double precision
    )
    and (
      p_filter_seniority is null
      or (
        public.search_seniority_rank_v1(csr.seniority) >= public.search_seniority_rank_v1(p_filter_seniority)
        and public.search_seniority_rank_v1(p_filter_seniority) > 0
      )
    )
    and (
      p_filter_min_years is null
      or coalesce(csr.years_experience, 0) >= p_filter_min_years
    )
    and (
      coalesce(array_length(p_filter_skills, 1), 0) = 0
      or exists (
        select 1
        from unnest(coalesce(csr.skills, '{}'::text[])) actual
        where exists (
          select 1
          from unnest(p_filter_skills) req
          where lower(actual) = lower(req)
        )
      )
    )
    and (
      coalesce(array_length(p_filter_companies, 1), 0) = 0
      or exists (
        select 1
        from unnest(coalesce(csr.companies, '{}'::text[])) actual
        where exists (
          select 1
          from unnest(p_filter_companies) req
          where lower(actual) = lower(req)
        )
      )
    )
    and (
      p_filter_location is null
      or lower(coalesce(csr.location, '')) like '%' || lower(trim(p_filter_location)) || '%'
    )
),
fts_candidates as (
  select
    ch.candidate_id,
    ch.id as chunk_id,
    ts_rank_cd(ch.fts, qt.query_ts) as lexical_score,
    ts_headline('english', ch.text, qt.query_ts, 'MaxFragments=2, MinWords=8, MaxWords=20') as snippet
  from query_terms qt
  join public.candidate_chunks ch
    on qt.query_ts is not null
   and ch.is_active
   and ch.fts @@ qt.query_ts
   and (
     coalesce(array_length(p_tenant_ids, 1), 0) = 0
     or ch.tenant_id = any(p_tenant_ids)
   )
  join filtered_candidates fc
    on fc.tenant_id = ch.tenant_id
   and fc.candidate_id = ch.candidate_id
  order by ts_rank_cd(ch.fts, qt.query_ts) desc, ch.id
  limit greatest(p_limit * 10, 100)
),
fts_hits as (
  select
    candidate_id,
    chunk_id,
    row_number() over (order by lexical_score desc, chunk_id) as ft_rank,
    lexical_score,
    snippet
  from fts_candidates
),
semantic_candidates as (
  select
    ch.candidate_id,
    ch.id as chunk_id,
    greatest(0::double precision, 1 - (ch.embedding <=> p_query_embedding)) as semantic_similarity,
    left(ch.text, 240) as snippet
  from public.candidate_chunks ch
  join filtered_candidates fc
    on fc.tenant_id = ch.tenant_id
   and fc.candidate_id = ch.candidate_id
  where p_query_embedding is not null
    and ch.is_active
    and (p_embedding_version is null or ch.embedding_version = p_embedding_version)
    and ch.embedding is not null
  order by ch.embedding <=> p_query_embedding, ch.id
  limit greatest(p_limit * 15, 150)
),
semantic_hits as (
  select
    candidate_id,
    chunk_id,
    row_number() over (order by semantic_similarity desc, chunk_id) as sem_rank,
    semantic_similarity,
    snippet
  from semantic_candidates
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
    public.search_name_match_v1(p_q, fc.name) as name_match,
    public.search_contact_match_v1(p_q, fc.email, fc.phone) as contact_match,
    public.search_company_match_v1(p_q, fc.companies) as company_match,
    public.search_role_match_v1(p_role, fc.primary_role, fc.role_tags, fc.current_title, fc.headline) as role_match,
    public.search_seniority_match_v1(p_seniority, fc.seniority) as seniority_match,
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
      when p_min_years is null or p_min_years = 0 then 0::double precision
      else least(coalesce(fc.years_experience, 0)::double precision / greatest(p_min_years::double precision, 1.0), 1.0)
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
  group by fc.candidate_id, fc.name, fc.email, fc.phone, fc.companies, fc.skills, fc.years_experience, fc.primary_role, fc.role_tags, fc.current_title, fc.headline, fc.seniority
),
scored as (
  select
    fc.tenant_id,
    fc.candidate_id,
    fc.name,
    fc.current_title,
    fc.location,
    fc.years_experience,
    fc.seniority,
    fc.primary_role,
    (
      (0.30 * cs.name_match)
      + (0.30 * cs.contact_match)
      + (0.22 * cs.company_match)
      + (0.24 * cs.max_chunk_rrf)
      + (0.10 * cs.avg_top3_chunk_rrf)
      + (0.06 * cs.role_match)
      + (0.02 * cs.seniority_match)
      + (0.03 * cs.skill_match)
      + (0.03 * cs.experience_match)
    ) as score,
    (
      cs.name_match > 0
      or cs.contact_match > 0
      or cs.company_match > 0
      or cs.max_chunk_rrf > 0
      or cs.role_match > 0
      or cs.seniority_match > 0
      or cs.skill_match > 0
      or cs.experience_match > 0
    ) as has_search_signal,
    jsonb_build_object(
      'name_match', round(cs.name_match::numeric, 4),
      'contact_match', round(cs.contact_match::numeric, 4),
      'company_match', round(cs.company_match::numeric, 4),
      'semantic_similarity', round(cs.semantic_similarity::numeric, 4),
      'role_match', round(cs.role_match::numeric, 4),
      'seniority_match', round(cs.seniority_match::numeric, 4),
      'skill_match', round(cs.skill_match::numeric, 4),
      'experience_match', round(cs.experience_match::numeric, 4),
      'max_chunk_rrf', round(cs.max_chunk_rrf::numeric, 6),
      'avg_top3_chunk_rrf', round(cs.avg_top3_chunk_rrf::numeric, 6)
    ) as subscores,
    jsonb_build_object(
      'required_skills', to_jsonb(coalesce(p_filter_skills, '{}'::text[])),
      'matched_skills', (
        select coalesce(jsonb_agg(actual), '[]'::jsonb)
        from unnest(coalesce(fc.skills, '{}'::text[])) actual
        where exists (
          select 1 from unnest(coalesce(p_filter_skills, '{}'::text[])) req where lower(req) = lower(actual)
        )
      ),
      'required_companies', to_jsonb(coalesce(p_filter_companies, '{}'::text[])),
      'matched_companies', (
        select coalesce(jsonb_agg(actual), '[]'::jsonb)
        from unnest(coalesce(fc.companies, '{}'::text[])) actual
        where exists (
          select 1 from unnest(coalesce(p_filter_companies, '{}'::text[])) req where lower(req) = lower(actual)
        )
      ),
      'role', p_filter_role,
      'seniority', p_filter_seniority,
      'min_years_experience', p_filter_min_years,
      'location', p_filter_location,
      'tenant_ids', to_jsonb(coalesce(p_tenant_ids, '{}'::uuid[]))
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
  scored.tenant_id,
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
where trim(coalesce(p_q, '')) = ''
  or scored.has_search_signal
order by scored.score desc, scored.years_experience desc, scored.name asc
limit greatest(p_limit, 1)
offset greatest(p_offset, 0);
$$;

grant execute on function public.search_candidates_v1(
  text,
  vector,
  integer,
  integer,
  text,
  text,
  numeric,
  text[],
  text,
  text,
  uuid[],
  text,
  text,
  numeric,
  text[],
  text,
  text[]
) to authenticated;

alter table public.candidate_shortlist_items
add column if not exists candidate_source_tenant_id uuid;

update public.candidate_shortlist_items
set candidate_source_tenant_id = tenant_id
where candidate_source_tenant_id is null;

alter table public.candidate_shortlist_items
alter column candidate_source_tenant_id set not null;

alter table public.candidate_shortlist_items
drop constraint if exists candidate_shortlist_candidate_tenant_fk;

alter table public.candidate_shortlist_items
add constraint candidate_shortlist_candidate_source_tenant_fk
foreign key (candidate_id, candidate_source_tenant_id)
references public.candidates (id, tenant_id)
on delete cascade;

create index if not exists idx_candidate_shortlist_source_candidate
on public.candidate_shortlist_items (candidate_source_tenant_id, candidate_id);

alter table public.job_matching_results
add column if not exists candidate_source_tenant_id uuid;

update public.job_matching_results
set candidate_source_tenant_id = tenant_id
where candidate_source_tenant_id is null;

alter table public.job_matching_results
alter column candidate_source_tenant_id set not null;

alter table public.job_matching_results
drop constraint if exists job_matching_results_candidate_tenant_fk;

alter table public.job_matching_results
add constraint job_matching_results_candidate_source_tenant_fk
foreign key (candidate_id, candidate_source_tenant_id)
references public.candidates (id, tenant_id)
on delete cascade;

create index if not exists idx_job_matching_results_candidate_source
on public.job_matching_results (candidate_source_tenant_id, candidate_id);

alter table public.job_shortlist_candidates
add column if not exists candidate_source_tenant_id uuid;

update public.job_shortlist_candidates
set candidate_source_tenant_id = tenant_id
where candidate_source_tenant_id is null;

alter table public.job_shortlist_candidates
alter column candidate_source_tenant_id set not null;

alter table public.job_shortlist_candidates
drop constraint if exists job_shortlist_candidates_candidate_tenant_fk;

alter table public.job_shortlist_candidates
add constraint job_shortlist_candidates_candidate_source_tenant_fk
foreign key (candidate_id, candidate_source_tenant_id)
references public.candidates (id, tenant_id)
on delete cascade;

create index if not exists idx_job_shortlist_candidates_candidate_source
on public.job_shortlist_candidates (candidate_source_tenant_id, candidate_id);

alter table public.job_postings
add column if not exists is_public boolean not null default false,
add column if not exists public_slug text,
add column if not exists public_title text,
add column if not exists public_summary text,
add column if not exists public_description text,
add column if not exists public_location text,
add column if not exists public_apply_enabled boolean not null default true,
add column if not exists public_published_at timestamptz;

create unique index if not exists idx_job_postings_public_slug_uidx
on public.job_postings (public_slug)
where public_slug is not null;

create index if not exists idx_job_postings_public_active
on public.job_postings (status, is_public, public_published_at desc)
where is_public and public_slug is not null;

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_posting_id uuid not null references public.job_postings (id) on delete cascade,
  candidate_id uuid,
  candidate_source_tenant_id uuid,
  applicant_name text not null,
  applicant_email text not null,
  applicant_phone text,
  applicant_location text,
  linkedin_url text,
  portfolio_url text,
  resume_storage_path text,
  resume_original_filename text,
  cover_note text not null default '',
  consent_given boolean not null default false,
  status text not null default 'new' check (status in ('new', 'reviewing', 'shortlisted', 'rejected', 'withdrawn')),
  source text not null default 'public_job_board',
  idempotency_key text,
  ip_hash text,
  user_agent_hash text,
  metadata_json jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default timezone('utc', now()),
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint job_applications_candidate_source_fk
    foreign key (candidate_id, candidate_source_tenant_id)
    references public.candidates (id, tenant_id)
    on delete set null,
  constraint job_applications_candidate_pair_chk check (
    (candidate_id is null and candidate_source_tenant_id is null)
    or (candidate_id is not null and candidate_source_tenant_id is not null)
  )
);

create table if not exists public.job_application_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  application_id uuid not null references public.job_applications (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_job_applications_job_status
on public.job_applications (job_posting_id, status, submitted_at desc);

create index if not exists idx_job_applications_email
on public.job_applications (tenant_id, lower(applicant_email), submitted_at desc);

create unique index if not exists idx_job_applications_idempotency
on public.job_applications (job_posting_id, idempotency_key)
where idempotency_key is not null;

create index if not exists idx_job_application_events_application
on public.job_application_events (application_id, created_at desc);

create trigger set_updated_at_job_applications
before update on public.job_applications
for each row execute function public.set_updated_at();

alter table public.job_applications enable row level security;
alter table public.job_application_events enable row level security;

create policy job_applications_select on public.job_applications
for select using (public.is_tenant_editor(tenant_id));

create policy job_applications_write on public.job_applications
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy job_application_events_select on public.job_application_events
for select using (public.is_tenant_editor(tenant_id));

create policy job_application_events_write on public.job_application_events
for insert with check (public.is_tenant_editor(tenant_id));

grant select, insert, update, delete on public.job_applications to authenticated;
grant select, insert on public.job_application_events to authenticated;

select public.refresh_candidate_search_cache_v1();
