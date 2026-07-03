-- 🔴 Security Fix: ingestion_capacity_snapshot_v1 IDOR
--
-- Problem:
--   1. security_definer → runs as postgres, bypasses all RLS.
--   2. p_tenant_id defaults to NULL → returns cross-tenant totals
--      for ALL tenants when called without arguments.
--   3. No membership check → any authenticated user can query
--      any tenant's stats by passing an arbitrary tenant_id (IDOR).
--
-- Impact: ANY authenticated user (or anon via default Supabase grants)
-- can call this function and read ingestion stats (record counts for
-- candidates, profiles, chunks, skills, documents, storage bytes)
-- across ALL tenants — or for any specific tenant they don't belong to.
--
-- Fix:
--   1. REVOKE from anon → block anonymous callers
--   2. Remove default NULL → p_tenant_id is now required
--   3. Add is_tenant_member() check → IDOR protection
--   4. security_invoker → run as calling user, not postgres
--   5. Remove "p_tenant_id is null or" branches → no cross-tenant dumps

-- Step 1: Revoke anon access
revoke execute on function public.ingestion_capacity_snapshot_v1(uuid, text) from anon;

-- Step 2: Recreate function with security fixes
create or replace function public.ingestion_capacity_snapshot_v1(
  p_tenant_id uuid,                    -- required, no default
  p_storage_bucket text default 'cv-originals'
)
returns table (
  database_bytes bigint,
  storage_bytes bigint,
  table_counts jsonb
)
language plpgsql
security invoker
set search_path = public, storage
as $$
begin
  -- Guard: require tenant_id
  if p_tenant_id is null then
    raise exception 'tenant_id is required';
  end if;

  -- Guard: caller must be a member of this tenant
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'Access denied: not a member of this tenant';
  end if;

  return query
  select
    pg_database_size(current_database())::bigint as database_bytes,
    coalesce(
      (
        select sum(coalesce((o.metadata ->> 'size')::bigint, 0))
        from storage.objects o
        where o.bucket_id = p_storage_bucket
          and o.name like p_tenant_id::text || '/%'
      ),
      0
    )::bigint as storage_bytes,
    jsonb_build_object(
      'source_documents',    (select count(*) from public.source_documents    sd  where sd.tenant_id  = p_tenant_id),
      'candidates',          (select count(*) from public.candidates          c   where c.tenant_id   = p_tenant_id),
      'candidate_profiles',  (select count(*) from public.candidate_profiles  cp  where cp.tenant_id  = p_tenant_id),
      'candidate_summaries', (select count(*) from public.candidate_summaries cs  where cs.tenant_id  = p_tenant_id),
      'candidate_skill_map', (select count(*) from public.candidate_skill_map csm where csm.tenant_id = p_tenant_id),
      'candidate_chunks',    (select count(*) from public.candidate_chunks    cc  where cc.tenant_id  = p_tenant_id),
      'processing_runs',     (select count(*) from public.processing_runs    pr  where pr.tenant_id  = p_tenant_id)
    ) as table_counts;
end;
$$;

-- Keep grant for authenticated + service_role only
grant execute on function public.ingestion_capacity_snapshot_v1(uuid, text)
  to authenticated, service_role;
