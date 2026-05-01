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

drop function if exists public.search_candidates_with_rate_v1(text, vector, integer, integer, text, text, numeric, text[], text, text, uuid[], text, text, numeric, text[], text, text[]);

create function public.search_candidates_with_rate_v1(
  p_q text default '',
  p_query_embedding vector(768) default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_role text default null,
  p_seniority text default null,
  p_min_years numeric default null,
  p_skills text[] default '{}'::text[],
  p_embedding_version text default null,
  p_rank_version text default 'v2-rate',
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
  score_raw double precision,
  match_rate integer,
  subscores jsonb,
  matched_filters jsonb,
  summary_short text,
  evidence jsonb,
  meta jsonb
)
language sql
stable
as $$
  select
    base.tenant_id,
    base.candidate_id,
    base.name,
    base.current_title,
    base.location,
    base.years_experience,
    base.seniority,
    base.primary_role,
    (rate.match_rate::double precision / 100::double precision) as score,
    base.score as score_raw,
    rate.match_rate,
    base.subscores,
    base.matched_filters,
    base.summary_short,
    base.evidence,
    jsonb_set(base.meta, '{rank_version}', to_jsonb(p_rank_version), true) as meta
  from public.search_candidates_v1(
    p_q,
    p_query_embedding,
    p_limit,
    p_offset,
    p_role,
    p_seniority,
    p_min_years,
    p_skills,
    p_embedding_version,
    p_rank_version,
    p_tenant_ids,
    p_filter_role,
    p_filter_seniority,
    p_filter_min_years,
    p_filter_skills,
    p_filter_location,
    p_filter_companies
  ) base
  cross join lateral (
    select public.search_match_rate_v1(base.score, base.subscores) as match_rate
  ) rate;
$$;

grant execute on function public.search_candidates_with_rate_v1(
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
