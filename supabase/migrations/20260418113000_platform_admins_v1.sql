create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

create policy platform_admins_self_read on public.platform_admins
for select using (user_id = auth.uid() or public.is_platform_admin());

create policy platform_admins_manage on public.platform_admins
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

create or replace function public.is_tenant_member(target_tenant uuid)
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
      where tm.tenant_id = target_tenant
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    );
$$;

create or replace function public.is_tenant_editor(target_tenant uuid)
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
      where tm.tenant_id = target_tenant
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner', 'admin', 'recruiter')
    );
$$;

create or replace function public.is_tenant_admin(target_tenant uuid)
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
      where tm.tenant_id = target_tenant
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner', 'admin')
    );
$$;

grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_tenant_editor(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;
