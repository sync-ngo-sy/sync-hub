create or replace function public.normalize_insights_skill_text_v1(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9+#./]+', ' ', 'g'),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public.insights_skill_alias_catalog_v1()
returns table(canonical_skill text, alias text)
language sql
immutable
parallel safe
as $$
  select *
  from (
    values
      ('React Native', 'React Native'),
      ('React Native', 'react native'),
      ('React Native', 'react-native'),
      ('React Native', 'reactnative'),
      ('React Native', 'rn'),
      ('React', 'React'),
      ('React', 'react.js'),
      ('React', 'reactjs'),
      ('Next.js', 'Next.js'),
      ('Next.js', 'nextjs'),
      ('Next.js', 'next'),
      ('Node.js', 'Node.js'),
      ('Node.js', 'nodejs'),
      ('Node.js', 'node js'),
      ('Node.js', 'node'),
      ('TypeScript', 'TypeScript'),
      ('TypeScript', 'ts'),
      ('JavaScript', 'JavaScript'),
      ('JavaScript', 'js'),
      ('Kubernetes', 'Kubernetes'),
      ('Kubernetes', 'k8s'),
      ('Terraform', 'Terraform'),
      ('Docker', 'Docker'),
      ('AWS', 'AWS'),
      ('AWS', 'amazon web services'),
      ('Azure', 'Azure'),
      ('Azure', 'microsoft azure'),
      ('Google Cloud', 'Google Cloud'),
      ('Google Cloud', 'gcp'),
      ('Google Cloud', 'google cloud platform'),
      ('CI/CD', 'CI/CD'),
      ('CI/CD', 'cicd'),
      ('CI/CD', 'ci cd'),
      ('CI/CD', 'continuous integration'),
      ('CI/CD', 'continuous deployment'),
      ('Python', 'Python'),
      ('Java', 'Java'),
      ('SQL', 'SQL'),
      ('PostgreSQL', 'PostgreSQL'),
      ('PostgreSQL', 'postgres'),
      ('PostgreSQL', 'postgre sql'),
      ('MySQL', 'MySQL'),
      ('MongoDB', 'MongoDB'),
      ('MongoDB', 'mongo db'),
      ('MongoDB', 'mongo'),
      ('REST APIs', 'REST APIs'),
      ('REST APIs', 'rest api'),
      ('REST APIs', 'restful api'),
      ('REST APIs', 'restful apis'),
      ('APIs', 'APIs'),
      ('APIs', 'api'),
      ('GraphQL', 'GraphQL'),
      ('HTML', 'HTML'),
      ('CSS', 'CSS'),
      ('Redux', 'Redux'),
      ('Redux', 'redux toolkit'),
      ('Flutter', 'Flutter'),
      ('Dart', 'Dart'),
      ('Android', 'Android'),
      ('iOS', 'iOS'),
      ('iOS', 'i os'),
      ('Swift', 'Swift'),
      ('Kotlin', 'Kotlin'),
      ('Firebase', 'Firebase'),
      ('Machine Learning', 'Machine Learning'),
      ('Machine Learning', 'ml'),
      ('Power BI', 'Power BI'),
      ('Power BI', 'powerbi'),
      ('Tableau', 'Tableau'),
      ('Excel', 'Excel'),
      ('Pandas', 'Pandas'),
      ('NumPy', 'NumPy'),
      ('Cybersecurity', 'Cybersecurity'),
      ('Cybersecurity', 'cyber security'),
      ('Git', 'Git'),
      ('Git', 'github'),
      ('Git', 'git/github'),
      ('Git', 'gitlab'),
      ('Problem Solving', 'Problem Solving'),
      ('Problem Solving', 'problem-solving')
  ) aliases(canonical_skill, alias);
$$;

create table if not exists public.insights_candidate_skill_facts (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  skill_norm text not null,
  skill_label text not null,
  refreshed_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, candidate_id, skill_norm)
);

alter table public.insights_candidate_skill_facts enable row level security;

drop policy if exists insights_candidate_skill_facts_read on public.insights_candidate_skill_facts;
create policy insights_candidate_skill_facts_read
  on public.insights_candidate_skill_facts
  for select
  using (public.is_tenant_member(tenant_id));

create index if not exists idx_insights_candidate_skill_facts_tenant_skill
  on public.insights_candidate_skill_facts (tenant_id, skill_norm, candidate_id);

create index if not exists idx_insights_candidate_skill_facts_tenant_candidate
  on public.insights_candidate_skill_facts (tenant_id, candidate_id);

grant select on public.insights_candidate_skill_facts to authenticated;

create or replace function public.refresh_insights_candidate_skill_facts_v1(
  p_tenant_ids uuid[] default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  refreshed_count bigint;
begin
  insert into public.insights_candidate_skill_facts (
    tenant_id,
    candidate_id,
    skill_norm,
    skill_label,
    refreshed_at
  )
  select distinct on (facts.tenant_id, facts.candidate_id, public.normalize_insights_skill_text_v1(skill))
    facts.tenant_id,
    facts.candidate_id,
    public.normalize_insights_skill_text_v1(skill),
    btrim(skill),
    timezone('utc', now())
  from public.insights_candidate_facts facts
  cross join lateral unnest(facts.skills) skill
  where (p_tenant_ids is null or facts.tenant_id = any(p_tenant_ids))
    and public.normalize_insights_skill_text_v1(skill) is not null
  order by facts.tenant_id, facts.candidate_id, public.normalize_insights_skill_text_v1(skill), length(btrim(skill)), btrim(skill)
  on conflict (tenant_id, candidate_id, skill_norm) do update
  set
    skill_label = excluded.skill_label,
    refreshed_at = excluded.refreshed_at;

  get diagnostics refreshed_count = row_count;

  delete from public.insights_candidate_skill_facts skill_facts
  where (p_tenant_ids is null or skill_facts.tenant_id = any(p_tenant_ids))
    and not exists (
      select 1
      from public.insights_candidate_facts facts
      where facts.tenant_id = skill_facts.tenant_id
        and facts.candidate_id = skill_facts.candidate_id
        and exists (
          select 1
          from unnest(facts.skills) skill
          where public.normalize_insights_skill_text_v1(skill) = skill_facts.skill_norm
        )
    );

  return refreshed_count;
end;
$$;

grant execute on function public.refresh_insights_candidate_skill_facts_v1(uuid[]) to authenticated;

create or replace function public.sync_insights_candidate_skill_facts_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.insights_candidate_skill_facts
    where tenant_id = old.tenant_id
      and candidate_id = old.candidate_id;
    return old;
  end if;

  delete from public.insights_candidate_skill_facts
  where tenant_id = new.tenant_id
    and candidate_id = new.candidate_id;

  insert into public.insights_candidate_skill_facts (
    tenant_id,
    candidate_id,
    skill_norm,
    skill_label,
    refreshed_at
  )
  select distinct on (public.normalize_insights_skill_text_v1(skill))
    new.tenant_id,
    new.candidate_id,
    public.normalize_insights_skill_text_v1(skill),
    btrim(skill),
    timezone('utc', now())
  from unnest(new.skills) skill
  where public.normalize_insights_skill_text_v1(skill) is not null
  order by public.normalize_insights_skill_text_v1(skill), length(btrim(skill)), btrim(skill);

  return new;
end;
$$;

drop trigger if exists sync_insights_candidate_skill_facts_upsert on public.insights_candidate_facts;
create trigger sync_insights_candidate_skill_facts_upsert
after insert or update of skills on public.insights_candidate_facts
for each row execute function public.sync_insights_candidate_skill_facts_v1();

drop trigger if exists sync_insights_candidate_skill_facts_delete on public.insights_candidate_facts;
create trigger sync_insights_candidate_skill_facts_delete
after delete on public.insights_candidate_facts
for each row execute function public.sync_insights_candidate_skill_facts_v1();

create or replace function public.insights_resolve_gap_skills_v1(
  p_tenant_ids uuid[] default null,
  p_target_skills text[] default null,
  p_target_role text default null,
  p_limit integer default 12
)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
with params as (
  select
    coalesce(array_remove(p_target_skills, null), '{}'::text[]) as explicit_skills,
    public.normalize_insights_skill_text_v1(p_target_role) as role_text,
    greatest(1, least(50, coalesce(p_limit, 12))) as target_limit
),
allowed_tenants as (
  select t.id
  from public.tenants t
  where public.is_tenant_member(t.id)
    and (p_tenant_ids is null or t.id = any(p_tenant_ids))
),
skill_catalog as (
  select
    skill_facts.skill_label as skill,
    skill_facts.skill_norm,
    count(*)::integer as profile_count
  from public.insights_candidate_skill_facts skill_facts
  join allowed_tenants t on t.id = skill_facts.tenant_id
  group by skill_facts.skill_label, skill_facts.skill_norm
),
alias_catalog as (
  select
    canonical_skill,
    alias,
    public.normalize_insights_skill_text_v1(canonical_skill) as canonical_norm,
    public.normalize_insights_skill_text_v1(alias) as alias_norm
  from public.insights_skill_alias_catalog_v1()
  where public.normalize_insights_skill_text_v1(alias) is not null
),
match_catalog as (
  select
    skill as label,
    skill_norm,
    skill_norm as alias_norm,
    profile_count
  from skill_catalog
  union all
  select
    coalesce(corpus_skill.skill, alias_catalog.canonical_skill) as label,
    public.normalize_insights_skill_text_v1(coalesce(corpus_skill.skill, alias_catalog.canonical_skill)) as skill_norm,
    alias_catalog.alias_norm,
    coalesce(corpus_skill.profile_count, 0) as profile_count
  from alias_catalog
  left join lateral (
    select skill, profile_count
    from skill_catalog
    where skill_norm in (alias_catalog.canonical_norm, alias_catalog.alias_norm)
    order by profile_count desc, skill
    limit 1
  ) corpus_skill on true
),
text_skill_matches_ranked as (
  select distinct on (skill_norm)
    label,
    skill_norm,
    profile_count,
    length(alias_norm) as alias_length
  from match_catalog, params
  where params.role_text is not null
    and position(' ' || alias_norm || ' ' in ' ' || params.role_text || ' ') > 0
  order by skill_norm, length(alias_norm) desc, profile_count desc, label
),
text_skill_matches as (
  select label, skill_norm, profile_count, row_number() over (order by profile_count desc, alias_length desc, label) as sort_order
  from text_skill_matches_ranked, params
  limit (select target_limit from params)
),
explicit_skill_matches as (
  select distinct on (coalesce(match_catalog.skill_norm, public.normalize_insights_skill_text_v1(raw_skill)))
    coalesce(match_catalog.label, btrim(raw_skill)) as label,
    coalesce(match_catalog.skill_norm, public.normalize_insights_skill_text_v1(raw_skill)) as skill_norm,
    1000 + ordinality as sort_order
  from params
  cross join lateral unnest(explicit_skills) with ordinality explicit(raw_skill, ordinality)
  left join match_catalog
    on match_catalog.alias_norm = public.normalize_insights_skill_text_v1(raw_skill)
  where public.normalize_insights_skill_text_v1(raw_skill) is not null
  order by coalesce(match_catalog.skill_norm, public.normalize_insights_skill_text_v1(raw_skill)), match_catalog.profile_count desc nulls last, ordinality
),
merged as (
  select label, skill_norm, sort_order
  from text_skill_matches
  union all
  select label, skill_norm, sort_order
  from explicit_skill_matches
),
deduped as (
  select distinct on (skill_norm)
    label,
    sort_order
  from merged
  where skill_norm is not null
  order by skill_norm, sort_order
),
resolved as (
  select array_agg(label order by sort_order, label) as skills
  from deduped
),
has_input as (
  select
    coalesce(cardinality(explicit_skills), 0) > 0 or role_text is not null as value
  from params
)
select case
  when coalesce(cardinality((select skills from resolved)), 0) > 0 then (select skills from resolved)
  when not (select value from has_input) then array['Kubernetes', 'Terraform']::text[]
  else '{}'::text[]
end;
$$;

create or replace function public.insights_gap_analysis_v1(
  p_tenant_ids uuid[] default null,
  p_target_skills text[] default null,
  p_target_role text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with resolved_target_skills as (
  select skill, ordinality::integer as sort_order, public.normalize_insights_skill_text_v1(skill) as skill_norm
  from unnest(public.insights_resolve_gap_skills_v1(p_tenant_ids, p_target_skills, p_target_role, 12)) with ordinality resolved(skill, ordinality)
  where public.normalize_insights_skill_text_v1(skill) is not null
),
allowed_tenants as (
  select t.id
  from public.tenants t
  where public.is_tenant_member(t.id)
    and (p_tenant_ids is null or t.id = any(p_tenant_ids))
),
facts as (
  select f.*
  from public.insights_candidate_facts f
  join allowed_tenants t on t.id = f.tenant_id
),
alias_catalog as (
  select
    public.normalize_insights_skill_text_v1(canonical_skill) as canonical_norm,
    public.normalize_insights_skill_text_v1(alias) as alias_norm
  from public.insights_skill_alias_catalog_v1()
  where public.normalize_insights_skill_text_v1(alias) is not null
),
target_skill_aliases as (
  select skill, skill_norm as alias_norm
  from resolved_target_skills
  union
  select target.skill, alias_catalog.alias_norm
  from resolved_target_skills target
  join alias_catalog
    on alias_catalog.canonical_norm = target.skill_norm
    or alias_catalog.alias_norm = target.skill_norm
),
candidate_gap_scores as (
  select
    f.tenant_id,
    f.candidate_id,
    (
      select count(distinct target.skill)
      from resolved_target_skills target
      where exists (
        select 1
        from target_skill_aliases alias
        join public.insights_candidate_skill_facts skill_facts
          on skill_facts.tenant_id = f.tenant_id
         and skill_facts.candidate_id = f.candidate_id
         and skill_facts.skill_norm = alias.alias_norm
        where alias.skill = target.skill
      )
    )::integer as matched_count,
    (select count(*) from resolved_target_skills)::integer as target_count
  from facts f
),
gap_summary as (
  select jsonb_build_object(
    'targetRole', nullif(trim(coalesce(p_target_role, '')), ''),
    'targetSkills', coalesce((select jsonb_agg(skill order by sort_order) from resolved_target_skills), '[]'::jsonb),
    'fullyMatchingCandidates', count(*) filter (where target_count > 0 and matched_count = target_count),
    'partiallyMatchingCandidates', count(*) filter (where target_count > 0 and matched_count > 0 and matched_count < target_count),
    'zeroMatchCandidates', count(*) filter (where target_count > 0 and matched_count = 0),
    'missingSkills', coalesce((
      select jsonb_agg(jsonb_build_object('skill', skill, 'missingFromPartialCandidates', missing_count) order by missing_count desc, skill)
      from (
        select
          target.skill,
          count(*) filter (
            where scores.matched_count > 0
              and not exists (
                select 1
                from target_skill_aliases alias
                join public.insights_candidate_skill_facts skill_facts
                  on skill_facts.tenant_id = scores.tenant_id
                 and skill_facts.candidate_id = scores.candidate_id
                 and skill_facts.skill_norm = alias.alias_norm
                where alias.skill = target.skill
              )
          )::integer as missing_count
        from resolved_target_skills target
        cross join candidate_gap_scores scores
        group by target.skill
      ) missing
      where missing_count > 0
    ), '[]'::jsonb)
  ) as value
  from candidate_gap_scores
)
select coalesce((select value from gap_summary), jsonb_build_object(
  'targetRole', nullif(trim(coalesce(p_target_role, '')), ''),
  'targetSkills', '[]'::jsonb,
  'fullyMatchingCandidates', 0,
  'partiallyMatchingCandidates', 0,
  'zeroMatchCandidates', 0,
  'missingSkills', '[]'::jsonb
));
$$;

grant execute on function public.normalize_insights_skill_text_v1(text) to authenticated;
grant execute on function public.insights_skill_alias_catalog_v1() to authenticated;
grant execute on function public.insights_resolve_gap_skills_v1(uuid[], text[], text, integer) to authenticated;
grant execute on function public.insights_gap_analysis_v1(uuid[], text[], text) to authenticated;

create or replace function public.insights_dashboard_snapshot_v1(
  p_tenant_ids uuid[] default null,
  p_top_skills integer default 50,
  p_target_skills text[] default null,
  p_target_role text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with params as (
  select greatest(1, least(200, coalesce(p_top_skills, 50))) as top_skills
),
allowed_tenants as (
  select t.id
  from public.tenants t
  where public.is_tenant_member(t.id)
    and (p_tenant_ids is null or t.id = any(p_tenant_ids))
),
facts as (
  select f.*
  from public.insights_candidate_facts f
  join allowed_tenants t on t.id = f.tenant_id
),
periods as (
  select
    count(*)::integer as total_count,
    count(*) filter (where indexed_at >= now() - interval '30 days')::integer as added_30,
    count(*) filter (where indexed_at >= now() - interval '60 days' and indexed_at < now() - interval '30 days')::integer as previous_added_30
  from facts
),
coverage as (
  select
    round((count(*) filter (where coalesce(nullif(job_family, ''), 'Unclassified') <> 'Unclassified')::numeric / nullif(count(*), 0)) * 100, 1) as job_family_coverage,
    round(avg(cardinality(skills)), 1) as avg_skills_per_profile,
    count(*) filter (where job_family_review_status = 'needs_review')::integer as job_family_review_count
  from facts
),
sparkline as (
  select coalesce(jsonb_agg(bucket_count order by bucket_start), '[]'::jsonb) as values
  from (
    select
      bucket_start,
      count(f.candidate_id)::integer as bucket_count
    from generate_series(now() - interval '30 days', now(), interval '5 days') bucket_start
    left join facts f
      on f.indexed_at >= bucket_start
     and f.indexed_at < bucket_start + interval '5 days'
    group by bucket_start
  ) buckets
),
seniority_distribution as (
  select coalesce(jsonb_agg(jsonb_build_object('label', seniority, 'value', value) order by sort_rank, seniority), '[]'::jsonb) as items
  from (
    select
      coalesce(nullif(seniority, ''), 'unclassified') as seniority,
      count(*)::integer as value,
      case coalesce(nullif(seniority, ''), 'unclassified')
        when 'junior' then 1
        when 'mid' then 2
        when 'senior' then 3
        when 'lead' then 4
        when 'staff-plus' then 5
        when 'executive' then 6
        else 9
      end as sort_rank
    from facts
    group by coalesce(nullif(seniority, ''), 'unclassified')
  ) grouped
),
location_distribution as (
  select coalesce(jsonb_agg(jsonb_build_object('label', location, 'value', value) order by value desc, location), '[]'::jsonb) as items
  from (
    select coalesce(nullif(location, ''), 'Unknown') as location, count(*)::integer as value
    from facts
    group by coalesce(nullif(location, ''), 'Unknown')
    order by value desc, location
    limit 12
  ) grouped
),
job_family_distribution as (
  select coalesce(jsonb_agg(jsonb_build_object('label', job_family, 'value', value, 'percent', percent) order by value desc, job_family), '[]'::jsonb) as items
  from (
    select
      coalesce(nullif(job_family, ''), 'Unclassified') as job_family,
      count(*)::integer as value,
      round((count(*)::numeric / nullif((select total_count from periods), 0)) * 100, 1) as percent
    from facts
    group by coalesce(nullif(job_family, ''), 'Unclassified')
    order by value desc, job_family
  ) grouped
),
skill_catalog as (
  select
    skill_facts.skill_label as skill,
    skill_facts.skill_norm,
    count(*)::integer as value
  from public.insights_candidate_skill_facts skill_facts
  join allowed_tenants t on t.id = skill_facts.tenant_id
  group by skill_facts.skill_label, skill_facts.skill_norm
),
skills_frequency as (
  select coalesce(jsonb_agg(jsonb_build_object('skill', skill, 'count', value) order by value desc, skill), '[]'::jsonb) as items
  from (
    select skill, value
    from skill_catalog
    order by value desc, skill
    limit (select top_skills from params)
  ) grouped
),
gap_use_case_template_skills as (
  select *
  from (
    values
      ('employer-brief', 'Employer brief', 'Check whether the pool can satisfy a live role demand.', 1, 1, array['React']::text[]),
      ('employer-brief', 'Employer brief', 'Check whether the pool can satisfy a live role demand.', 1, 2, array['React Native']::text[]),
      ('employer-brief', 'Employer brief', 'Check whether the pool can satisfy a live role demand.', 1, 3, array['TypeScript', 'JavaScript']::text[]),
      ('training-cohort', 'Training cohort', 'Find partial candidates that could convert with focused upskilling.', 2, 1, array['Kubernetes']::text[]),
      ('training-cohort', 'Training cohort', 'Find partial candidates that could convert with focused upskilling.', 2, 2, array['Terraform']::text[]),
      ('training-cohort', 'Training cohort', 'Find partial candidates that could convert with focused upskilling.', 2, 3, array['Docker']::text[]),
      ('training-cohort', 'Training cohort', 'Find partial candidates that could convert with focused upskilling.', 2, 4, array['AWS', 'Azure', 'Google Cloud']::text[]),
      ('funding-evidence', 'Funding evidence', 'Quantify scarce capabilities for program and grant narratives.', 3, 1, array['SQL']::text[]),
      ('funding-evidence', 'Funding evidence', 'Quantify scarce capabilities for program and grant narratives.', 3, 2, array['Power BI']::text[]),
      ('funding-evidence', 'Funding evidence', 'Quantify scarce capabilities for program and grant narratives.', 3, 3, array['Tableau', 'Excel']::text[]),
      ('funding-evidence', 'Funding evidence', 'Quantify scarce capabilities for program and grant narratives.', 3, 4, array['Python']::text[]),
      ('delivery-risk', 'Delivery risk', 'Spot backend/API supply depth before committing to delivery targets.', 4, 1, array['Node.js']::text[]),
      ('delivery-risk', 'Delivery risk', 'Spot backend/API supply depth before committing to delivery targets.', 4, 2, array['REST APIs', 'APIs']::text[]),
      ('delivery-risk', 'Delivery risk', 'Spot backend/API supply depth before committing to delivery targets.', 4, 3, array['PostgreSQL', 'SQL']::text[]),
      ('delivery-risk', 'Delivery risk', 'Spot backend/API supply depth before committing to delivery targets.', 4, 4, array['GraphQL']::text[])
  ) templates(id, title, detail, sort_rank, slot_rank, skill_options)
),
gap_use_case_skill_matches as (
  select distinct on (template.id, template.slot_rank)
    template.id,
    template.title,
    template.detail,
    template.sort_rank,
    template.slot_rank,
    catalog.skill
  from gap_use_case_template_skills template
  cross join lateral unnest(template.skill_options) requested_skill
  join skill_catalog catalog
    on catalog.skill_norm = public.normalize_insights_skill_text_v1(requested_skill)
  order by template.id, template.slot_rank, catalog.value desc, catalog.skill
),
gap_use_case_rows as (
  select
    id,
    max(title) as title,
    max(detail) as detail,
    min(sort_rank) as sort_rank,
    jsonb_agg(skill order by slot_rank) as skills,
    string_agg(skill, ' and ' order by slot_rank) as query,
    count(*) as skill_count
  from gap_use_case_skill_matches
  group by id
  having count(*) >= 2
),
gap_use_cases as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'title', title,
    'detail', detail,
    'skills', skills,
    'query', query
  ) order by sort_rank), '[]'::jsonb) as items
  from gap_use_case_rows
),
seniority_pyramid as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobFamily', job_family,
    'junior', junior,
    'mid', mid,
    'senior', senior,
    'lead', lead,
    'executive', executive
  ) order by total desc, job_family), '[]'::jsonb) as items
  from (
    select
      coalesce(nullif(job_family, ''), 'Unclassified') as job_family,
      count(*) filter (where seniority = 'junior')::integer as junior,
      count(*) filter (where seniority = 'mid')::integer as mid,
      count(*) filter (where seniority = 'senior')::integer as senior,
      count(*) filter (where seniority in ('lead', 'staff-plus'))::integer as lead,
      count(*) filter (where seniority = 'executive')::integer as executive,
      count(*)::integer as total
    from facts
    group by coalesce(nullif(job_family, ''), 'Unclassified')
  ) grouped
)
select jsonb_build_object(
  'generatedAt', timezone('utc', now()),
  'metrics', jsonb_build_array(
    jsonb_build_object(
      'key', 'total_cvs_indexed',
      'label', 'Total CVs Indexed',
      'value', (select total_count from periods),
      'deltaValue', (select added_30 - previous_added_30 from periods),
      'deltaPercent', case when (select previous_added_30 from periods) = 0 then null else round((((select added_30 from periods) - (select previous_added_30 from periods))::numeric / nullif((select previous_added_30 from periods), 0)) * 100, 1) end,
      'trend', case when (select added_30 from periods) >= (select previous_added_30 from periods) then 'up' else 'down' end,
      'sparkline', (select values from sparkline)
    ),
    jsonb_build_object(
      'key', 'cvs_added_30d',
      'label', 'CVs Added (Last 30 Days)',
      'value', (select added_30 from periods),
      'deltaValue', (select added_30 - previous_added_30 from periods),
      'deltaPercent', case when (select previous_added_30 from periods) = 0 then null else round((((select added_30 from periods) - (select previous_added_30 from periods))::numeric / nullif((select previous_added_30 from periods), 0)) * 100, 1) end,
      'trend', case when (select added_30 from periods) >= (select previous_added_30 from periods) then 'up' else 'down' end,
      'sparkline', (select values from sparkline)
    ),
    jsonb_build_object(
      'key', 'job_family_coverage',
      'label', 'Job Family Coverage',
      'value', coalesce((select job_family_coverage from coverage), 0),
      'deltaValue', 0,
      'deltaPercent', null,
      'trend', 'flat',
      'sparkline', (select values from sparkline)
    ),
    jsonb_build_object(
      'key', 'avg_skills_per_profile',
      'label', 'Avg Skills per Profile',
      'value', coalesce((select avg_skills_per_profile from coverage), 0),
      'deltaValue', 0,
      'deltaPercent', null,
      'trend', 'flat',
      'sparkline', (select values from sparkline)
    ),
    jsonb_build_object(
      'key', 'job_family_review_queue',
      'label', 'Job Family Review Queue',
      'value', coalesce((select job_family_review_count from coverage), 0),
      'deltaValue', 0,
      'deltaPercent', null,
      'trend', 'flat',
      'sparkline', (select values from sparkline)
    )
  ),
  'profilesBySeniority', (select items from seniority_distribution),
  'profilesByLocation', (select items from location_distribution),
  'jobFamilies', (select items from job_family_distribution),
  'skillsFrequency', (select items from skills_frequency),
  'gapUseCases', (select items from gap_use_cases),
  'seniorityPyramid', (select items from seniority_pyramid),
  'gapAnalysis', public.insights_gap_analysis_v1(p_tenant_ids, p_target_skills, p_target_role)
);
$$;

grant execute on function public.insights_dashboard_snapshot_v1(uuid[], integer, text[], text) to authenticated;

select public.refresh_insights_candidate_skill_facts_v1(null);
