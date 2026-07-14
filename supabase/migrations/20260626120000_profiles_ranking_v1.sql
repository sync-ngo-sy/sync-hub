-- SCRUM-20 Profiles Ranking: tenant-scoped, admin-editable ranking formula.
-- The scoring engine lives in the `rank` edge function; this table only stores
-- the configurable formula (criteria, caps, and per-rule points) as JSON so an
-- admin can retune the rubric without a redeploy. When a tenant has no row the
-- edge function falls back to the built-in default formula (the SCRUM rubric).

create table if not exists public.ranking_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null default 'Ranking formula',
  description text not null default '',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  version text not null default 'v1',
  formula_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, version)
);

create index if not exists idx_ranking_profiles_tenant_status
  on public.ranking_profiles (tenant_id, status, updated_at desc);

create trigger set_updated_at_ranking_profiles
before update on public.ranking_profiles
for each row execute function public.set_updated_at();

alter table public.ranking_profiles enable row level security;

-- Any active member can read the formula (the ranked list explains scores to
-- every reviewer). Only tenant owners/admins (or platform admins) can change it.
create policy ranking_profiles_read on public.ranking_profiles
for select using (public.is_tenant_member(tenant_id));

create policy ranking_profiles_write on public.ranking_profiles
for all using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

-- Promote one profile to `active` for its tenant and demote the others. Mirrors
-- publish_parser_profile_v1 so the admin UI has a single atomic activate call.
create or replace function public.publish_ranking_profile_v1(p_profile_id uuid)
returns public.ranking_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.ranking_profiles%rowtype;
begin
  select *
    into v_profile
  from public.ranking_profiles
  where id = p_profile_id;

  if v_profile.id is null then
    raise exception 'ranking_profile_not_found';
  end if;

  if not public.is_tenant_admin(v_profile.tenant_id) then
    raise exception 'not_authorized';
  end if;

  update public.ranking_profiles
     set status = case when id = p_profile_id then 'active' else 'draft' end
   where tenant_id = v_profile.tenant_id
     and status <> 'archived';

  select *
    into v_profile
  from public.ranking_profiles
  where id = p_profile_id;

  return v_profile;
end;
$$;

grant execute on function public.publish_ranking_profile_v1(uuid) to authenticated;
