create or replace function public.bootstrap_tenant_v1(
  p_name text,
  p_slug text default null
)
returns table (
  tenant_id uuid,
  slug text,
  name text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(btrim(p_name), '');
  v_slug text;
  v_tenant_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_name is null then
    raise exception 'tenant_name_required';
  end if;

  v_slug := coalesce(
    nullif(lower(regexp_replace(coalesce(nullif(btrim(p_slug), ''), v_name), '[^a-z0-9]+', '-', 'g')), ''),
    ''
  );
  v_slug := trim(both '-' from v_slug);

  if v_slug = '' then
    raise exception 'tenant_slug_required';
  end if;

  insert into public.tenants (slug, name, created_by)
  values (v_slug, v_name, v_user_id)
  returning id into v_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role, status)
  values (v_tenant_id, v_user_id, 'owner', 'active');

  return query
  select
    t.id,
    t.slug,
    t.name,
    tm.role
  from public.tenants t
  join public.tenant_memberships tm
    on tm.tenant_id = t.id
   and tm.user_id = v_user_id
  where t.id = v_tenant_id;
exception
  when unique_violation then
    raise exception 'tenant_slug_taken';
end;
$$;

grant execute on function public.bootstrap_tenant_v1(text, text) to authenticated;
