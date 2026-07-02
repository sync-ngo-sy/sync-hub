create or replace function public.search_role_match_v1(
  p_requested text,
  p_primary_role text,
  p_role_tags text[],
  p_current_title text,
  p_headline text
)
returns double precision
language sql
immutable
as $$
  select case
    when p_requested is null or btrim(p_requested) = '' then 0::double precision
    when lower(coalesce(p_primary_role, '')) = lower(p_requested) then 1::double precision
    when exists (
      select 1
      from unnest(coalesce(p_role_tags, '{}'::text[])) tag
      where lower(tag) = lower(p_requested)
    ) then 1::double precision
    when lower(p_requested) = 'mobile'
      and (coalesce(p_current_title, '') ~* '(flutter|android|ios|react native|mobile)'
        or coalesce(p_headline, '') ~* '(flutter|android|ios|react native|mobile)')
      then 1::double precision
    when lower(p_requested) = 'frontend'
      and (coalesce(p_current_title, '') ~* '(front[ -]?end|react|next\.js|angular|vue|html|css)'
        or coalesce(p_headline, '') ~* '(front[ -]?end|react|next\.js|angular|vue|html|css)')
      then 0.9::double precision
    when lower(p_requested) = 'backend'
      and (coalesce(p_current_title, '') ~* '(back[ -]?end|api|node\.js|nestjs|django|flask|fastapi|laravel|\.net|asp\.net)'
        or coalesce(p_headline, '') ~* '(back[ -]?end|api|node\.js|nestjs|django|flask|fastapi|laravel|\.net|asp\.net)')
      then 0.9::double precision
    when lower(p_requested) = 'security'
      and (coalesce(p_current_title, '') ~* '(security|cybersecurity|soc|siem|threat|vulnerability)'
        or coalesce(p_headline, '') ~* '(security|cybersecurity|soc|siem|threat|vulnerability)')
      then 1::double precision
    when lower(p_requested) = 'devops'
      and (coalesce(p_current_title, '') ~* '(devops|sre|terraform|kubernetes|docker|platform)'
        or coalesce(p_headline, '') ~* '(devops|sre|terraform|kubernetes|docker|platform)')
      then 0.95::double precision
    when lower(p_requested) = 'full-stack'
      and (coalesce(p_current_title, '') ~* '(full[ -]?stack)'
        or coalesce(p_headline, '') ~* '(full[ -]?stack)')
      then 1::double precision
    else 0::double precision
  end;
$$;

create or replace function public.search_seniority_match_v1(
  p_requested text,
  p_actual text
)
returns double precision
language sql
immutable
as $$
  with normalized as (
    select
      case lower(coalesce(p_requested, ''))
        when 'junior' then 1
        when 'mid' then 2
        when 'senior' then 3
        when 'staff-plus' then 4
        else 0
      end as requested_rank,
      case lower(coalesce(p_actual, ''))
        when 'junior' then 1
        when 'mid' then 2
        when 'mid-level' then 2
        when 'senior' then 3
        when 'mid-senior' then 3
        when 'staff-plus' then 4
        else 0
      end as actual_rank
  )
  select case
    when requested_rank = 0 or actual_rank = 0 then 0::double precision
    when requested_rank = actual_rank then 1::double precision
    when requested_rank = 3 and actual_rank = 4 then 0.9::double precision
    when requested_rank = 2 and actual_rank = 3 then 0.75::double precision
    when requested_rank = 3 and actual_rank = 2 then 0.7::double precision
    else greatest(0::double precision, 1 - abs(requested_rank - actual_rank) * 0.45)
  end
  from normalized;
$$;

grant execute on function public.search_role_match_v1(text, text, text[], text, text) to authenticated;
grant execute on function public.search_seniority_match_v1(text, text) to authenticated;

drop view if exists public.candidate_search_rows cascade;

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
  c.updated_at
from public.candidates c
left join public.candidate_profiles cp
  on cp.tenant_id = c.tenant_id
 and cp.candidate_id = c.id
left join lateral (
  select coalesce(array_agg(distinct value), '{}'::text[]) as role_tags
  from jsonb_array_elements_text(coalesce(cp.profile_json -> 'role_tags', '[]'::jsonb)) value
) role_data on true
left join public.candidate_skill_map csm
  on csm.tenant_id = c.tenant_id
 and csm.candidate_id = c.id
left join public.candidate_summaries s
  on s.tenant_id = c.tenant_id
 and s.candidate_id = c.id
group by c.tenant_id, c.id, s.short_summary, s.confidence, role_data.role_tags;

drop function if exists public.search_candidates_v1(text, vector, integer, integer, text, text, numeric, text[], text, text);

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
      when p_min_years is null or p_min_years = 0 then least(coalesce(fc.years_experience, 0)::double precision / 8.0, 1.0)
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
  group by fc.candidate_id, fc.skills, fc.years_experience, fc.primary_role, fc.role_tags, fc.current_title, fc.headline, fc.seniority
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
      (0.50 * cs.max_chunk_rrf)
      + (0.15 * cs.avg_top3_chunk_rrf)
      + (0.15 * cs.role_match)
      + (0.08 * cs.seniority_match)
      + (0.07 * cs.skill_match)
      + (0.05 * cs.experience_match)
    ) as score,
    jsonb_build_object(
      'semantic_similarity', round(cs.semantic_similarity::numeric, 4),
      'role_match', round(cs.role_match::numeric, 4),
      'seniority_match', round(cs.seniority_match::numeric, 4),
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
