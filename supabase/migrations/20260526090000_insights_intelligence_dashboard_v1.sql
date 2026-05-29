alter table public.candidates
  add column if not exists job_family text,
  add column if not exists job_family_confidence numeric,
  add column if not exists job_family_taxonomy_version text,
  add column if not exists job_family_inferred_at timestamptz,
  add column if not exists job_family_review_status text,
  add column if not exists job_family_review_reason text;

alter table public.candidate_search_cache
  add column if not exists job_family text,
  add column if not exists job_family_confidence numeric,
  add column if not exists job_family_taxonomy_version text,
  add column if not exists job_family_inferred_at timestamptz,
  add column if not exists job_family_review_status text,
  add column if not exists job_family_review_reason text;

create table if not exists public.job_family_taxonomies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  version text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  taxonomy_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, version)
);

create table if not exists public.insights_candidate_facts (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  indexed_at timestamptz not null,
  updated_at timestamptz not null,
  location text,
  seniority text not null default 'unclassified',
  job_family text not null default 'Unclassified',
  job_family_confidence numeric not null default 0,
  job_family_review_status text not null default 'auto_accepted',
  job_family_review_reason text,
  skills text[] not null default '{}'::text[],
  years_experience numeric,
  refreshed_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, candidate_id)
);

create table if not exists public.insights_query_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  query_type text not null,
  filters jsonb not null default '{}'::jsonb,
  duration_ms integer,
  row_count integer,
  trace_id text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.job_family_taxonomies enable row level security;
alter table public.insights_candidate_facts enable row level security;
alter table public.insights_query_audit enable row level security;

drop policy if exists job_family_taxonomies_read on public.job_family_taxonomies;
create policy job_family_taxonomies_read
  on public.job_family_taxonomies
  for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists job_family_taxonomies_write on public.job_family_taxonomies;
create policy job_family_taxonomies_write
  on public.job_family_taxonomies
  for all
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists insights_candidate_facts_read on public.insights_candidate_facts;
create policy insights_candidate_facts_read
  on public.insights_candidate_facts
  for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists insights_query_audit_read on public.insights_query_audit;
create policy insights_query_audit_read
  on public.insights_query_audit
  for select
  using (tenant_id is null or public.is_tenant_admin(tenant_id));

drop policy if exists insights_query_audit_insert on public.insights_query_audit;
create policy insights_query_audit_insert
  on public.insights_query_audit
  for insert
  with check (tenant_id is null or public.is_tenant_member(tenant_id));

create index if not exists idx_job_family_taxonomies_tenant_status
  on public.job_family_taxonomies (tenant_id, status, updated_at desc);

create index if not exists idx_insights_candidate_facts_tenant_updated
  on public.insights_candidate_facts (tenant_id, updated_at desc);

create index if not exists idx_insights_candidate_facts_tenant_job_family
  on public.insights_candidate_facts (tenant_id, job_family, seniority);

create index if not exists idx_insights_candidate_facts_tenant_review
  on public.insights_candidate_facts (tenant_id, job_family_review_status, refreshed_at desc);

create index if not exists idx_insights_candidate_facts_skills
  on public.insights_candidate_facts using gin (skills);

create index if not exists idx_insights_query_audit_tenant_created
  on public.insights_query_audit (tenant_id, created_at desc);

grant select on public.job_family_taxonomies to authenticated;
grant select on public.insights_candidate_facts to authenticated;
grant select, insert on public.insights_query_audit to authenticated;

create trigger set_updated_at_job_family_taxonomies
before update on public.job_family_taxonomies
for each row execute function public.set_updated_at();

create or replace function public.infer_job_family_label_v1(
  p_primary_role text,
  p_title text,
  p_skills text[],
  p_role_tags text[] default '{}'::text[]
)
returns text
language sql
immutable
as $$
  with normalized as (
    select
      lower(concat_ws(' ', coalesce(p_primary_role, ''), coalesce(array_to_string(p_role_tags, ' '), ''))) as role_text,
      lower(coalesce(p_title, '')) as title_text,
      lower(coalesce(array_to_string(p_skills, ' '), '')) as skill_text
  ),
  scores as (
    select 'Full-Stack Engineering' as family,
      (case when role_text ~ '(^| )full-stack($| )' or title_text ~ 'full[- ]?stack' then 100 else 0 end) +
      (case when role_text ~ '(^| )backend($| )' and role_text ~ '(^| )frontend($| )' then 80 else 0 end) +
      (case when skill_text ~ '(react|angular|vue|html|css|tailwind)' and skill_text ~ '(node.js|nestjs|laravel|django|fastapi|asp.net|postgresql|mysql|mongodb|rest apis)' then 35 else 0 end) as score
    from normalized
    union all
    select 'Backend Engineering',
      (case when role_text ~ '(^| )backend($| )' then 90 else 0 end) +
      (case when title_text ~ '(backend|back-end|api|server|platform)' then 55 else 0 end) +
      (case when skill_text ~ '(node.js|nestjs|express|java|spring|python|django|fastapi|laravel|php|asp.net|.net|c#|postgresql|mysql|mongodb|redis|rest apis|graphql)' then 45 else 0 end)
    from normalized
    union all
    select 'Frontend Engineering',
      (case when role_text ~ '(^| )frontend($| )' then 90 else 0 end) +
      (case when title_text ~ '(frontend|front-end|ui engineer|web developer)' then 55 else 0 end) +
      (case when skill_text ~ '(react|next.js|angular|vue|javascript|typescript|html|css|tailwind|bootstrap|redux)' then 45 else 0 end)
    from normalized
    union all
    select 'Mobile Engineering',
      (case when role_text ~ '(^| )mobile($| )' then 95 else 0 end) +
      (case when title_text ~ '(mobile|android|ios|flutter|react native)' then 55 else 0 end) +
      (case when skill_text ~ '(flutter|dart|android|ios|swift|kotlin|react native|firebase)' then 50 else 0 end)
    from normalized
    union all
    select 'AI & Machine Learning',
      (case when role_text ~ '(^| )ml($| )' then 95 else 0 end) +
      (case when title_text ~ '(machine learning|ml engineer|ai engineer|data scientist|llm)' then 60 else 0 end) +
      (case when skill_text ~ '(machine learning|deep learning|tensorflow|pytorch|scikit|keras|opencv|nlp|llm|computer vision)' then 55 else 0 end)
    from normalized
    union all
    select 'Data & Analytics',
      (case when role_text ~ '(^| )data($| )' then 90 else 0 end) +
      (case when title_text ~ '(data analyst|data engineer|business intelligence|bi developer|analytics)' then 60 else 0 end) +
      (case when skill_text ~ '(sql|power bi|tableau|excel|pandas|numpy|etl|data analysis|data visualization)' then 40 else 0 end)
    from normalized
    union all
    select 'Cloud, DevOps & SRE',
      (case when role_text ~ '(^| )devops($| )' then 95 else 0 end) +
      (case when title_text ~ '(devops|sre|site reliability|cloud|infrastructure)' then 60 else 0 end) +
      (case when skill_text ~ '(docker|kubernetes|terraform|aws|azure|google cloud|gcp|ci/cd|linux|jenkins|ansible|helm)' then 55 else 0 end)
    from normalized
    union all
    select 'Cybersecurity',
      (case when role_text ~ '(^| )security($| )' then 95 else 0 end) +
      (case when title_text ~ '(security|cyber|soc|penetration|threat|siem)' then 60 else 0 end) +
      (case when skill_text ~ '(cybersecurity|security|soc operations|siem|penetration testing|vulnerability|threat detection|incident response)' then 55 else 0 end)
    from normalized
    union all
    select 'QA & Test Automation',
      (case when role_text ~ '(^| )qa($| )' then 95 else 0 end) +
      (case when title_text ~ '(qa|quality assurance|test automation|tester)' then 60 else 0 end) +
      (case when skill_text ~ '(selenium|playwright|cypress|jest|testing|test automation|quality assurance)' then 55 else 0 end)
    from normalized
    union all
    select 'Product & Design',
      (case when title_text ~ '(product designer|ui/ux|ux designer|product manager)' then 70 else 0 end) +
      (case when skill_text ~ '(figma|ui/ux|wireframing|prototyping|user research|product management)' then 55 else 0 end)
    from normalized
    union all
    select 'Software Engineering',
      (case when role_text ~ '(^| )generalist($| )' then 40 else 0 end) +
      (case when title_text ~ '(software|developer|engineer|programmer)' then 35 else 0 end) +
      (case when skill_text ~ '(git|github|apis|javascript|python|java|sql|problem solving)' then 25 else 0 end)
    from normalized
  ),
  best as (
    select family, score
    from scores
    order by score desc, family
    limit 1
  )
  select case when score >= 40 then family else 'Unclassified' end
  from best;
$$;

grant execute on function public.infer_job_family_label_v1(text, text, text[], text[]) to authenticated;

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
  c.phone,
  coalesce(
    nullif(c.job_family, ''),
    nullif(job_family_data.job_family, ''),
    public.infer_job_family_label_v1(c.primary_role, c.current_title, coalesce(array_agg(distinct csm.canonical_skill) filter (where csm.canonical_skill is not null), c.top_skills), coalesce(role_data.role_tags, case when c.primary_role is null then '{}'::text[] else array[c.primary_role] end))
  ) as job_family,
  coalesce(c.job_family_confidence, job_family_data.job_family_confidence, 0) as job_family_confidence,
  coalesce(c.job_family_taxonomy_version, job_family_data.job_family_taxonomy_version, 'default-v1') as job_family_taxonomy_version,
  coalesce(c.job_family_inferred_at, job_family_data.job_family_inferred_at, c.updated_at) as job_family_inferred_at,
  coalesce(c.job_family_review_status, job_family_data.job_family_review_status, 'auto_accepted') as job_family_review_status,
  coalesce(c.job_family_review_reason, job_family_data.job_family_review_reason, '') as job_family_review_reason
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
left join lateral (
  select
    nullif(cp.profile_json #>> '{metadata,job_family}', '') as job_family,
    nullif(cp.profile_json #>> '{metadata,job_family_confidence}', '')::numeric as job_family_confidence,
    nullif(cp.profile_json #>> '{metadata,job_family_taxonomy_version}', '') as job_family_taxonomy_version,
    nullif(cp.profile_json #>> '{metadata,job_family_inferred_at}', '')::timestamptz as job_family_inferred_at,
    nullif(cp.profile_json #>> '{metadata,job_family_review_status}', '') as job_family_review_status,
    nullif(cp.profile_json #>> '{metadata,job_family_review_reason}', '') as job_family_review_reason
) job_family_data on true
left join public.candidate_skill_map csm
  on csm.tenant_id = c.tenant_id
 and csm.candidate_id = c.id
left join public.candidate_summaries s
  on s.tenant_id = c.tenant_id
 and s.candidate_id = c.id
group by c.tenant_id, c.id, s.short_summary, s.confidence, role_data.role_tags, company_data.companies, job_family_data.job_family, job_family_data.job_family_confidence, job_family_data.job_family_taxonomy_version, job_family_data.job_family_inferred_at, job_family_data.job_family_review_status, job_family_data.job_family_review_reason;

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
    job_family,
    job_family_confidence,
    job_family_taxonomy_version,
    job_family_inferred_at,
    job_family_review_status,
    job_family_review_reason,
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
    csr.job_family,
    csr.job_family_confidence,
    csr.job_family_taxonomy_version,
    csr.job_family_inferred_at,
    csr.job_family_review_status,
    csr.job_family_review_reason,
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
    job_family = excluded.job_family,
    job_family_confidence = excluded.job_family_confidence,
    job_family_taxonomy_version = excluded.job_family_taxonomy_version,
    job_family_inferred_at = excluded.job_family_inferred_at,
    job_family_review_status = excluded.job_family_review_status,
    job_family_review_reason = excluded.job_family_review_reason,
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

create or replace function public.refresh_insights_candidate_facts_v1(
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
  insert into public.insights_candidate_facts (
    tenant_id,
    candidate_id,
    indexed_at,
    updated_at,
    location,
    seniority,
    job_family,
    job_family_confidence,
    job_family_review_status,
    job_family_review_reason,
    skills,
    years_experience,
    refreshed_at
  )
  select
    cache.tenant_id,
    cache.candidate_id,
    coalesce(cache.created_at, cache.updated_at, now()),
    coalesce(cache.updated_at, cache.created_at, now()),
    nullif(cache.location, ''),
    coalesce(nullif(cache.seniority, ''), 'unclassified'),
    coalesce(nullif(cache.job_family, ''), public.infer_job_family_label_v1(cache.primary_role, cache.current_title, cache.skills, cache.role_tags), 'Unclassified'),
    coalesce(cache.job_family_confidence, 0),
    coalesce(nullif(cache.job_family_review_status, ''), 'auto_accepted'),
    nullif(cache.job_family_review_reason, ''),
    coalesce(cache.skills, '{}'::text[]),
    cache.years_experience,
    now()
  from public.candidate_search_cache cache
  where (p_tenant_ids is null or cache.tenant_id = any(p_tenant_ids))
  on conflict (tenant_id, candidate_id) do update
  set
    indexed_at = excluded.indexed_at,
    updated_at = excluded.updated_at,
    location = excluded.location,
    seniority = excluded.seniority,
    job_family = excluded.job_family,
    job_family_confidence = excluded.job_family_confidence,
    job_family_review_status = excluded.job_family_review_status,
    job_family_review_reason = excluded.job_family_review_reason,
    skills = excluded.skills,
    years_experience = excluded.years_experience,
    refreshed_at = excluded.refreshed_at;

  get diagnostics refreshed_count = row_count;

  delete from public.insights_candidate_facts facts
  where (p_tenant_ids is null or facts.tenant_id = any(p_tenant_ids))
    and not exists (
      select 1
      from public.candidate_search_cache cache
      where cache.tenant_id = facts.tenant_id
        and cache.candidate_id = facts.candidate_id
    );

  return refreshed_count;
end;
$$;

grant execute on function public.refresh_insights_candidate_facts_v1(uuid[]) to authenticated;

create or replace function public.refresh_job_family_taxonomies_from_corpus_v1(
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
  insert into public.job_family_taxonomies (
    tenant_id,
    name,
    version,
    status,
    taxonomy_json
  )
  select
    tenant_scope.tenant_id,
    'Production corpus job-family taxonomy',
    'production-corpus-v1',
    'active',
    jsonb_build_object(
      'source', 'candidate_search_cache',
      'generatedAt', timezone('utc', now()),
      'families', jsonb_build_array(
        jsonb_build_object('label', 'Backend Engineering', 'productionRoleTags', jsonb_build_array('backend'), 'skillSignals', jsonb_build_array('Node.js', 'NestJS', 'Laravel', 'Java', 'Python', 'PostgreSQL', 'MySQL', 'MongoDB', 'REST APIs', 'GraphQL')),
        jsonb_build_object('label', 'Frontend Engineering', 'productionRoleTags', jsonb_build_array('frontend'), 'skillSignals', jsonb_build_array('React', 'Next.js', 'Angular', 'Vue', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Tailwind CSS')),
        jsonb_build_object('label', 'Full-Stack Engineering', 'productionRoleTags', jsonb_build_array('full-stack', 'backend', 'frontend'), 'skillSignals', jsonb_build_array('React', 'Node.js', 'APIs', 'SQL', 'PostgreSQL', 'MongoDB')),
        jsonb_build_object('label', 'Mobile Engineering', 'productionRoleTags', jsonb_build_array('mobile'), 'skillSignals', jsonb_build_array('Flutter', 'Dart', 'Android', 'iOS', 'React Native', 'Firebase')),
        jsonb_build_object('label', 'AI & Machine Learning', 'productionRoleTags', jsonb_build_array('ml'), 'skillSignals', jsonb_build_array('Machine Learning', 'Python', 'TensorFlow', 'PyTorch', 'NLP', 'Computer Vision')),
        jsonb_build_object('label', 'Data & Analytics', 'productionRoleTags', jsonb_build_array('data'), 'skillSignals', jsonb_build_array('SQL', 'Python', 'Pandas', 'Power BI', 'Tableau', 'Excel', 'ETL')),
        jsonb_build_object('label', 'Cloud, DevOps & SRE', 'productionRoleTags', jsonb_build_array('devops'), 'skillSignals', jsonb_build_array('Docker', 'Kubernetes', 'Terraform', 'AWS', 'Azure', 'Google Cloud', 'CI/CD', 'Linux')),
        jsonb_build_object('label', 'Cybersecurity', 'productionRoleTags', jsonb_build_array('security'), 'skillSignals', jsonb_build_array('Cybersecurity', 'SOC Operations', 'SIEM', 'Penetration Testing', 'Threat Detection')),
        jsonb_build_object('label', 'QA & Test Automation', 'productionRoleTags', jsonb_build_array('qa'), 'skillSignals', jsonb_build_array('Selenium', 'Playwright', 'Cypress', 'Jest', 'Testing', 'Quality Assurance')),
        jsonb_build_object('label', 'Software Engineering', 'productionRoleTags', jsonb_build_array('generalist'), 'skillSignals', jsonb_build_array('Git', 'GitHub', 'APIs', 'Problem Solving', 'JavaScript', 'Python', 'SQL'))
      ),
      'observedPrimaryRoles', coalesce((
        select jsonb_agg(jsonb_build_object('label', primary_role, 'count', value) order by value desc, primary_role)
        from (
          select coalesce(nullif(primary_role, ''), 'unclassified') as primary_role, count(*)::integer as value
          from public.candidate_search_cache corpus
          where corpus.tenant_id = tenant_scope.tenant_id
          group by coalesce(nullif(primary_role, ''), 'unclassified')
          order by value desc, primary_role
          limit 50
        ) primary_roles
      ), '[]'::jsonb),
      'observedRoleTags', coalesce((
        select jsonb_agg(jsonb_build_object('label', role_tag, 'count', value) order by value desc, role_tag)
        from (
          select role_tag, count(*)::integer as value
          from public.candidate_search_cache corpus
          cross join lateral unnest(coalesce(corpus.role_tags, '{}'::text[])) role_tag
          where corpus.tenant_id = tenant_scope.tenant_id
            and nullif(trim(role_tag), '') is not null
          group by role_tag
          order by value desc, role_tag
          limit 50
        ) role_tags
      ), '[]'::jsonb),
      'observedSkills', coalesce((
        select jsonb_agg(jsonb_build_object('label', skill, 'count', value) order by value desc, skill)
        from (
          select skill, count(*)::integer as value
          from public.candidate_search_cache corpus
          cross join lateral unnest(coalesce(corpus.skills, '{}'::text[])) skill
          where corpus.tenant_id = tenant_scope.tenant_id
            and nullif(trim(skill), '') is not null
          group by skill
          order by value desc, skill
          limit 100
        ) skills
      ), '[]'::jsonb)
    )
  from (
    select distinct tenant_id
    from public.candidate_search_cache
    where p_tenant_ids is null or tenant_id = any(p_tenant_ids)
  ) tenant_scope
  on conflict (tenant_id, version) do update
  set
    name = excluded.name,
    status = excluded.status,
    taxonomy_json = excluded.taxonomy_json,
    updated_at = timezone('utc', now());

  get diagnostics refreshed_count = row_count;
  return refreshed_count;
end;
$$;

grant execute on function public.refresh_job_family_taxonomies_from_corpus_v1(uuid[]) to authenticated;

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
  select
    greatest(1, least(200, coalesce(p_top_skills, 50))) as top_skills,
    coalesce(array_remove(p_target_skills, null), '{}'::text[]) as target_skills,
    nullif(trim(coalesce(p_target_role, '')), '') as target_role
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
skills_frequency as (
  select coalesce(jsonb_agg(jsonb_build_object('skill', skill, 'count', value) order by value desc, skill), '[]'::jsonb) as items
  from (
    select skill, count(*)::integer as value
    from facts
    cross join lateral unnest(skills) skill
    where nullif(trim(skill), '') is not null
    group by skill
    order by value desc, skill
    limit (select top_skills from params)
  ) grouped
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
),
target_skills as (
  select lower(trim(skill)) as skill
  from params
  cross join lateral unnest(target_skills) skill
  where nullif(trim(skill), '') is not null
),
candidate_gap_scores as (
  select
    f.candidate_id,
    array(select lower(trim(skill)) from unnest(f.skills) skill where nullif(trim(skill), '') is not null) as normalized_skills
  from facts f
),
candidate_gap_counts as (
  select
    c.candidate_id,
    (select count(*) from target_skills target where target.skill = any(c.normalized_skills))::integer as matched_count,
    (select count(*) from target_skills)::integer as target_count
  from candidate_gap_scores c
),
gap_summary as (
  select jsonb_build_object(
    'targetRole', (select target_role from params),
    'targetSkills', coalesce((select jsonb_agg(skill order by skill) from target_skills), '[]'::jsonb),
    'fullyMatchingCandidates', count(*) filter (where target_count > 0 and matched_count = target_count),
    'partiallyMatchingCandidates', count(*) filter (where target_count > 0 and matched_count > 0 and matched_count < target_count),
    'zeroMatchCandidates', count(*) filter (where target_count > 0 and matched_count = 0),
    'missingSkills', coalesce((
      select jsonb_agg(jsonb_build_object('skill', skill, 'missingFromPartialCandidates', missing_count) order by missing_count desc, skill)
      from (
        select
          target.skill,
          count(*) filter (where gap.matched_count > 0 and not target.skill = any(scores.normalized_skills))::integer as missing_count
        from target_skills target
        cross join candidate_gap_scores scores
        join candidate_gap_counts gap on gap.candidate_id = scores.candidate_id
        group by target.skill
      ) missing
      where missing_count > 0
    ), '[]'::jsonb)
  ) as value
  from candidate_gap_counts
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
  'seniorityPyramid', (select items from seniority_pyramid),
  'gapAnalysis', coalesce((select value from gap_summary), '{}'::jsonb)
);
$$;

grant execute on function public.insights_dashboard_snapshot_v1(uuid[], integer, text[], text) to authenticated;

select public.refresh_candidate_search_cache_v1();
select public.refresh_job_family_taxonomies_from_corpus_v1(null);
select public.refresh_insights_candidate_facts_v1(null);
