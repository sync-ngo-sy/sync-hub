create or replace function public.candidates_list_page_v1(
  p_tenant_ids uuid[] default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_query text default null,
  p_status text default null,
  p_role text default null,
  p_source text default null,
  p_location text default null,
  p_updated_from timestamptz default null,
  p_updated_to timestamptz default null,
  p_group_by text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
with workspace_tenants as (
  select t.id
  from public.tenants t
  where public.is_tenant_member(t.id)
    and (
      coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or t.id = any(p_tenant_ids)
    )
),
candidate_corpus as (
  select csc.*
  from public.candidate_search_cache csc
  where public.can_read_candidate(csc.tenant_id, csc.candidate_id)
    and (
      csc.hub_visibility = 'platform'
      or coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or csc.tenant_id = any(p_tenant_ids)
    )
),
search_params as (
  select trim(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9+#.@_-]+', ' ', 'g')) as query
),
latest_application as (
  select distinct on (ja.candidate_source_tenant_id, ja.candidate_id)
    ja.candidate_source_tenant_id as tenant_id,
    ja.candidate_id,
    ja.status,
    ja.source,
    jp.title as job_title,
    ja.updated_at
  from public.job_applications ja
  join workspace_tenants wt on wt.id = ja.tenant_id
  join public.job_postings jp on jp.id = ja.job_posting_id
  where ja.candidate_id is not null
    and ja.candidate_source_tenant_id is not null
  order by ja.candidate_source_tenant_id, ja.candidate_id, ja.submitted_at desc, ja.updated_at desc
),
latest_source as (
  select distinct on (sd.tenant_id, sd.candidate_id)
    sd.tenant_id,
    sd.candidate_id,
    sd.source_type
  from public.source_documents sd
  join candidate_corpus cc
    on cc.tenant_id = sd.tenant_id
   and cc.candidate_id = sd.candidate_id
  where sd.candidate_id is not null
  order by sd.tenant_id, sd.candidate_id, sd.updated_at desc
),
base as (
  select
    csc.tenant_id,
    csc.candidate_id,
    coalesce(nullif(trim(csc.name), ''), 'Unnamed candidate') as name,
    csc.email,
    coalesce(nullif(trim(csc.location), ''), '') as location,
    coalesce(nullif(trim(csc.primary_role), ''), '') as primary_role,
    csc.status as parse_status,
    csc.seniority,
    csc.updated_at,
    la.status as application_status,
    coalesce(nullif(trim(la.job_title), ''), '') as applied_role,
    coalesce(la.source, ls.source_type, 'unknown') as source_label,
    coalesce(la.status, csc.status, 'unknown') as stage_key,
    case
      when la.status is not null then initcap(replace(la.status, '_', ' '))
      when csc.status = 'completed' then 'Indexed'
      else initcap(replace(coalesce(csc.status, 'unknown'), '_', ' '))
    end as stage_label,
    coalesce(nullif(trim(la.job_title), ''), nullif(trim(csc.primary_role), ''), 'Unassigned role') as role_label,
    coalesce(nullif(trim(csc.location), ''), 'Unknown location') as location_label
  from candidate_corpus csc
  left join latest_application la
    on la.tenant_id = csc.tenant_id
   and la.candidate_id = csc.candidate_id
  left join latest_source ls
    on ls.tenant_id = csc.tenant_id
   and ls.candidate_id = csc.candidate_id
),
filtered as (
  select
    base.*,
    case coalesce(nullif(trim(p_group_by), ''), '')
      when 'status' then base.stage_key
      when 'role' then base.role_label
      when 'source' then base.source_label
      when 'location' then base.location_label
      else null
    end as group_key,
    case coalesce(nullif(trim(p_group_by), ''), '')
      when 'status' then base.stage_label
      when 'role' then base.role_label
      when 'source' then initcap(replace(base.source_label, '_', ' '))
      when 'location' then base.location_label
      else null
    end as group_label
  from base
  cross join search_params sp
  where (
    sp.query = ''
    or position(sp.query in trim(regexp_replace(lower(coalesce(base.name, '')), '[^a-z0-9+#.@_-]+', ' ', 'g'))) > 0
    or position(sp.query in trim(regexp_replace(lower(coalesce(base.email, '')), '[^a-z0-9+#.@_-]+', ' ', 'g'))) > 0
  )
  and (
    coalesce(nullif(trim(p_status), ''), '') = ''
    or base.stage_key = trim(p_status)
  )
  and (
    coalesce(nullif(trim(p_role), ''), '') = ''
    or base.role_label ilike '%' || trim(p_role) || '%'
    or base.primary_role ilike '%' || trim(p_role) || '%'
    or base.applied_role ilike '%' || trim(p_role) || '%'
  )
  and (
    coalesce(nullif(trim(p_source), ''), '') = ''
    or base.source_label = trim(p_source)
  )
  and (
    coalesce(nullif(trim(p_location), ''), '') = ''
    or base.location_label ilike '%' || trim(p_location) || '%'
    or base.location ilike '%' || trim(p_location) || '%'
  )
  and (
    p_updated_from is null
    or base.updated_at >= p_updated_from
  )
  and (
    p_updated_to is null
    or base.updated_at <= p_updated_to
  )
),
ordered as (
  select *
  from filtered
  order by
    group_key asc nulls last,
    updated_at desc nulls last,
    name asc
),
page as (
  select *
  from ordered
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0))
),
totals as (
  select count(*)::bigint as total_count from filtered
),
group_summaries as (
  select
    group_key,
    group_label,
    count(*)::integer as candidate_count
  from filtered
  where group_key is not null
  group by group_key, group_label
  order by candidate_count desc, group_label asc
),
filter_options as (
  select jsonb_build_object(
    'statuses',
      coalesce(
        (select jsonb_agg(v order by v) from (select distinct stage_key as v from base order by 1 limit 50) status_values),
        '[]'::jsonb
      ),
    'roles',
      coalesce(
        (select jsonb_agg(v order by v) from (select distinct role_label as v from base where role_label <> 'Unassigned role' order by 1 limit 50) role_values),
        '[]'::jsonb
      ),
    'sources',
      coalesce(
        (select jsonb_agg(v order by v) from (select distinct source_label as v from base order by 1 limit 50) source_values),
        '[]'::jsonb
      ),
    'locations',
      coalesce(
        (select jsonb_agg(v order by v) from (select distinct location_label as v from base where location_label <> 'Unknown location' order by 1 limit 50) location_values),
        '[]'::jsonb
      )
  ) as payload
)
select jsonb_build_object(
  'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'tenantId', page.tenant_id,
            'candidateId', page.candidate_id,
            'name', page.name,
            'email', page.email,
            'location', page.location,
            'primaryRole', page.primary_role,
            'appliedRole', nullif(page.applied_role, ''),
            'stage', page.stage_label,
            'stageKey', page.stage_key,
            'source', page.source_label,
            'seniority', page.seniority,
            'updatedAt', page.updated_at,
            'groupKey', page.group_key,
            'groupLabel', page.group_label
          )
          order by page.group_key asc nulls last, page.updated_at desc nulls last, page.name asc
        )
        from page
      ),
      '[]'::jsonb
    ),
  'itemsTotalCount', (select total_count from totals),
  'pageLimit', greatest(1, least(coalesce(p_limit, 50), 200)),
  'pageOffset', greatest(0, coalesce(p_offset, 0)),
  'groupBy', nullif(trim(p_group_by), ''),
  'groups',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'key', group_summaries.group_key,
            'label', group_summaries.group_label,
            'count', group_summaries.candidate_count
          )
          order by group_summaries.candidate_count desc, group_summaries.group_label asc
        )
        from group_summaries
      ),
      '[]'::jsonb
    ),
  'filterOptions', (select payload from filter_options)
);
$$;

grant execute on function public.candidates_list_page_v1(
  uuid[],
  integer,
  integer,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) to authenticated;
