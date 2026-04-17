create table if not exists public.parser_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  extraction_provider text not null default 'openai-compatible',
  extraction_model text not null default '',
  parser_version text not null default '1.0.0',
  model_version text not null default '1.0.0',
  prompt_version text not null default '1.0.0',
  chunk_version text not null default '1.0.0',
  embedding_provider text not null default 'deterministic',
  embedding_model text not null default 'multilingual-e5-base',
  embedding_version text not null default 'deterministic-fnv1a-768-v2',
  chunking_profile text not null default 'standard',
  ocr_enabled boolean not null default false,
  allow_heuristic_fallback boolean not null default true,
  prompt_template text not null default '',
  notes text not null default '',
  last_evaluated_at timestamptz,
  avg_parse_percentage integer,
  avg_confidence integer,
  documents_evaluated integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, slug)
);

create index if not exists idx_parser_profiles_tenant_status
  on public.parser_profiles (tenant_id, status, updated_at desc);

create trigger set_updated_at_parser_profiles
before update on public.parser_profiles
for each row execute function public.set_updated_at();

alter table public.parser_profiles enable row level security;

create policy parser_profiles_read on public.parser_profiles
for select using (public.is_tenant_member(tenant_id));

create policy parser_profiles_write on public.parser_profiles
for all using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

create or replace function public.publish_parser_profile_v1(p_profile_id uuid)
returns public.parser_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.parser_profiles%rowtype;
begin
  select *
    into v_profile
  from public.parser_profiles
  where id = p_profile_id;

  if v_profile.id is null then
    raise exception 'parser_profile_not_found';
  end if;

  if not public.is_tenant_admin(v_profile.tenant_id) then
    raise exception 'not_authorized';
  end if;

  update public.parser_profiles
     set status = case when id = p_profile_id then 'active' else 'draft' end
   where tenant_id = v_profile.tenant_id
     and status <> 'archived';

  update public.parser_profiles
     set last_evaluated_at = coalesce(last_evaluated_at, timezone('utc', now()))
   where id = p_profile_id;

  select *
    into v_profile
  from public.parser_profiles
  where id = p_profile_id;

  return v_profile;
end;
$$;

grant execute on function public.publish_parser_profile_v1(uuid) to authenticated;
