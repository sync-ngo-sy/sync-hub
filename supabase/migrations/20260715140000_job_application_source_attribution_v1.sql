create table if not exists public.job_application_source_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint job_application_source_categories_name_nonempty_chk check (char_length(trim(name)) > 0)
);

create unique index if not exists idx_job_application_source_categories_tenant_name_uidx
on public.job_application_source_categories (tenant_id, lower(name));

create index if not exists idx_job_application_source_categories_tenant_active
on public.job_application_source_categories (tenant_id, is_active, name);

create table if not exists public.job_application_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_posting_id uuid not null references public.job_postings (id) on delete cascade,
  source_category_id uuid not null references public.job_application_source_categories (id) on delete restrict,
  token text not null,
  label text not null default '',
  source_detail text not null default '',
  campaign_name text not null default '',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  is_active boolean not null default true,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint job_application_links_token_nonempty_chk check (char_length(trim(token)) > 0)
);

create unique index if not exists idx_job_application_links_token_uidx
on public.job_application_links (token);

create index if not exists idx_job_application_links_job_active
on public.job_application_links (job_posting_id, is_active, created_at desc);

alter table public.job_applications
add column if not exists application_link_id uuid references public.job_application_links (id) on delete set null;

create index if not exists idx_job_applications_application_link
on public.job_applications (application_link_id)
where application_link_id is not null;

create trigger set_updated_at_job_application_source_categories
before update on public.job_application_source_categories
for each row execute function public.set_updated_at();

create trigger set_updated_at_job_application_links
before update on public.job_application_links
for each row execute function public.set_updated_at();

alter table public.job_application_source_categories enable row level security;
alter table public.job_application_links enable row level security;

create policy job_application_source_categories_select on public.job_application_source_categories
for select using (public.is_tenant_editor(tenant_id));

create policy job_application_source_categories_write on public.job_application_source_categories
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

create policy job_application_links_select on public.job_application_links
for select using (public.is_tenant_editor(tenant_id));

create policy job_application_links_write on public.job_application_links
for all using (public.is_tenant_editor(tenant_id))
with check (public.is_tenant_editor(tenant_id));

grant select, insert, update, delete on public.job_application_source_categories to authenticated;
grant select, insert, update, delete on public.job_application_links to authenticated;

drop index if exists public.idx_job_applications_public_active_email_uidx;

create unique index if not exists idx_job_applications_public_active_email_uidx
on public.job_applications (job_posting_id, lower(applicant_email))
where status <> 'withdrawn';
