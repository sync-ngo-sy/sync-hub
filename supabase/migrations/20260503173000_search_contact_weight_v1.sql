alter table public.candidate_search_cache
  add column if not exists email text,
  add column if not exists phone text;

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
  coalesce(role_data.role_tags, case when c.primary_role is null then '{}'::text[] else array[c.primary_role] end) as role_tags,
  coalesce(array_agg(distinct csm.canonical_skill) filter (where csm.canonical_skill is not null), c.top_skills) as skills,
  c.summary_short,
  s.short_summary as stored_short_summary,
  s.confidence as summary_confidence,
  c.status,
  c.parse_version,
  c.normalization_version,
  c.embedding_version,
  c.artifact_version,
  c.created_at,
  c.updated_at,
  coalesce(company_data.companies, '{}'::text[]) as companies,
  c.email,
  c.phone
from public.candidates c
left join public.candidate_profiles cp
  on cp.tenant_id = c.tenant_id
 and cp.candidate_id = c.id
left join lateral (
  select coalesce(array_agg(distinct value), '{}'::text[]) as role_tags
  from jsonb_array_elements_text(coalesce(cp.profile_json -> 'role_tags', '[]'::jsonb)) value
) role_data on true
left join lateral (
  select coalesce(array_agg(distinct company order by company), '{}'::text[]) as companies
  from (
    select nullif(trim(coalesce(entry ->> 'company', entry ->> 'employer', '')), '') as company
    from jsonb_array_elements(coalesce(cp.timeline_json, '[]'::jsonb)) entry
    union
    select nullif(trim(coalesce(entry ->> 'company', entry ->> 'employer', '')), '') as company
    from jsonb_array_elements(coalesce(cp.profile_json -> 'experience', '[]'::jsonb)) entry
  ) companies
  where company is not null
) company_data on true
left join public.candidate_skill_map csm
  on csm.tenant_id = c.tenant_id
 and csm.candidate_id = c.id
left join public.candidate_summaries s
  on s.tenant_id = c.tenant_id
 and s.candidate_id = c.id
group by c.tenant_id, c.id, s.short_summary, s.confidence, role_data.role_tags, company_data.companies;

grant select on public.candidate_search_rows to authenticated;

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
    now()
  from public.candidate_search_rows csr
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

create or replace function public.search_contact_match_v1(
  p_query text,
  p_email text,
  p_phone text
)
returns double precision
language sql
immutable
as $$
  with normalized as (
    select
      regexp_replace(lower(trim(coalesce(p_query, ''))), '[^a-z0-9@.+]+', ' ', 'g') as query_text,
      regexp_replace(lower(trim(coalesce(p_query, ''))), '[^a-z0-9@.+]+', '', 'g') as query_compact,
      regexp_replace(coalesce(p_query, ''), '\D+', '', 'g') as query_digits,
      regexp_replace(lower(trim(coalesce(p_email, ''))), '[^a-z0-9@.+]+', '', 'g') as email_text,
      regexp_replace(coalesce(p_phone, ''), '\D+', '', 'g') as phone_digits
  ),
  tokens as (
    select
      query_text,
      query_compact,
      query_digits,
      email_text,
      phone_digits,
      array_remove(regexp_split_to_array(query_text, '\s+'), '') as query_tokens
    from normalized
  )
  select case
    when query_compact = '' and query_digits = '' then 0::double precision
    when email_text <> '' and query_compact = email_text then 1::double precision
    when length(query_digits) >= 5
      and phone_digits <> ''
      and (phone_digits = query_digits or phone_digits like '%' || query_digits || '%' or query_digits like '%' || phone_digits || '%')
      then case when phone_digits = query_digits then 1::double precision else 0.92::double precision end
    when email_text <> ''
      and length(query_compact) >= 4
      and (email_text like '%' || query_compact || '%' or query_compact like '%' || email_text || '%')
      then 0.92::double precision
    when email_text <> ''
      and exists (
        select 1
        from unnest(query_tokens) token
        where length(token) >= 4
          and email_text like '%' || token || '%'
      )
      then 0.88::double precision
    when length(query_digits) >= 4 and phone_digits <> '' and phone_digits like '%' || query_digits || '%'
      then 0.88::double precision
    else 0::double precision
  end
  from tokens;
$$;

grant execute on function public.search_contact_match_v1(text, text, text) to authenticated;

create or replace function public.search_match_rate_v1(
  p_score double precision,
  p_subscores jsonb default '{}'::jsonb
)
returns integer
language sql
immutable
as $$
with signals as (
  select
    greatest(0::double precision, coalesce(p_score, 0::double precision)) as raw_score,
    greatest(
      coalesce((p_subscores ->> 'semantic_similarity')::double precision, 0::double precision),
      least(1::double precision, coalesce((p_subscores ->> 'max_chunk_rrf')::double precision, 0::double precision) * 40::double precision),
      least(1::double precision, coalesce((p_subscores ->> 'avg_top3_chunk_rrf')::double precision, 0::double precision) * 45::double precision)
    ) as retrieval_signal,
    coalesce((p_subscores ->> 'role_match')::double precision, 0::double precision) as role_match,
    coalesce((p_subscores ->> 'skill_match')::double precision, 0::double precision) as skill_match,
    coalesce((p_subscores ->> 'experience_match')::double precision, 0::double precision) as experience_match,
    coalesce((p_subscores ->> 'seniority_match')::double precision, 0::double precision) as seniority_match,
    coalesce((p_subscores ->> 'name_match')::double precision, 0::double precision) as name_match,
    coalesce((p_subscores ->> 'contact_match')::double precision, 0::double precision) as contact_match,
    coalesce((p_subscores ->> 'company_match')::double precision, 0::double precision) as company_match
),
weighted as (
  select greatest(
    raw_score,
    (0.50 * retrieval_signal)
      + (0.14 * role_match)
      + (0.12 * skill_match)
      + (0.08 * experience_match)
      + (0.06 * seniority_match)
      + (0.07 * name_match)
      + (0.07 * contact_match)
      + (0.03 * company_match)
  ) as value
  from signals
)
select case
  when value <= 0 then 0
  else least(99, greatest(1, round((1 - exp(-3.2 * value)) * 100)::integer))
end
from weighted;
$$;

grant execute on function public.search_match_rate_v1(double precision, jsonb) to authenticated;

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
  where public.is_tenant_member(csr.tenant_id)
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

select public.refresh_candidate_search_cache_v1();
