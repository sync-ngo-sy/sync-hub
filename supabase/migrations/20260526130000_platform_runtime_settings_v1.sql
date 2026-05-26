create table if not exists public.platform_runtime_settings (
  key text primary key,
  value text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_platform_runtime_settings_updated_at
  on public.platform_runtime_settings (updated_at desc);

drop trigger if exists set_updated_at_platform_runtime_settings on public.platform_runtime_settings;
create trigger set_updated_at_platform_runtime_settings
before update on public.platform_runtime_settings
for each row execute function public.set_updated_at();

alter table public.platform_runtime_settings enable row level security;

drop policy if exists platform_runtime_settings_read on public.platform_runtime_settings;
create policy platform_runtime_settings_read on public.platform_runtime_settings
for select using (public.is_platform_admin());

drop policy if exists platform_runtime_settings_write on public.platform_runtime_settings;
create policy platform_runtime_settings_write on public.platform_runtime_settings
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select, insert, update, delete on public.platform_runtime_settings to authenticated;
