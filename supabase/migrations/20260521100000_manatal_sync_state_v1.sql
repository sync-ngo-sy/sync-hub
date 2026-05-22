create table if not exists public.manatal_candidate_sync (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  manatal_candidate_id text not null,
  manatal_updated_at timestamptz,
  manatal_full_name text not null default '',
  manatal_email text not null default '',
  resume_url text not null default '',
  resume_sha256 text not null default '',
  source_document_id uuid,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'skipped', 'failed')),
  last_synced_at timestamptz,
  error_message text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, manatal_candidate_id)
);

create index if not exists idx_manatal_candidate_sync_tenant_status
  on public.manatal_candidate_sync (tenant_id, sync_status, updated_at desc);

create index if not exists idx_manatal_candidate_sync_tenant_updated
  on public.manatal_candidate_sync (tenant_id, manatal_updated_at desc);

create index if not exists idx_manatal_candidate_sync_resume_sha
  on public.manatal_candidate_sync (tenant_id, resume_sha256);

drop trigger if exists set_updated_at_manatal_candidate_sync on public.manatal_candidate_sync;
create trigger set_updated_at_manatal_candidate_sync
before update on public.manatal_candidate_sync
for each row execute function public.set_updated_at();

alter table public.manatal_candidate_sync enable row level security;

drop policy if exists manatal_candidate_sync_read on public.manatal_candidate_sync;
create policy manatal_candidate_sync_read
on public.manatal_candidate_sync
for select
using (public.is_tenant_member(tenant_id));

drop policy if exists manatal_candidate_sync_write on public.manatal_candidate_sync;
create policy manatal_candidate_sync_write
on public.manatal_candidate_sync
for all
using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

grant select, insert, update, delete on public.manatal_candidate_sync to authenticated;
