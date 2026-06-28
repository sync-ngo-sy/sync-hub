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
set row_security = off
as $$
with scoped_candidates as (
  select c.tenant_id, c.id, c.latest_document_id
  from public.candidates c
  where public.can_read_candidate(c.tenant_id, c.id)
    and (
      c.hub_visibility = 'platform'
      or coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or c.tenant_id = any(p_tenant_ids)
    )
),
scoped_documents as (
  select distinct sd.id
  from public.source_documents sd
  join scoped_candidates sc
    on sc.tenant_id = sd.tenant_id
   and (sc.id = sd.candidate_id or sc.latest_document_id = sd.id)
),
scoped_companies as (
  select distinct lower(trim(company)) as company
  from public.candidate_search_cache csc
  join scoped_candidates sc
    on sc.tenant_id = csc.tenant_id
   and sc.id = csc.candidate_id
  cross join lateral unnest(coalesce(csc.companies, '{}'::text[])) company
  where trim(company) <> ''
)
select
  (select count(*) from scoped_documents) as document_count,
  (select count(*) from scoped_candidates) as candidate_count,
  (select count(*) from scoped_companies) as company_count;
$$;

grant execute on function public.workspace_stats_v1(uuid[]) to authenticated;
