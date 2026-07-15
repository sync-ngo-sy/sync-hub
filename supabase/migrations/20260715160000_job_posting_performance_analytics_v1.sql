create table if not exists public.job_posting_detail_views (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_posting_id uuid not null references public.job_postings (id) on delete cascade,
  source_label text not null default 'Direct / untracked',
  application_link_id uuid,
  viewer_fingerprint text not null,
  viewed_at timestamptz not null default timezone('utc', now()),
  constraint job_posting_detail_views_fingerprint_nonempty_chk
    check (char_length(trim(viewer_fingerprint)) > 0)
);

create index if not exists idx_job_posting_detail_views_job_viewed
on public.job_posting_detail_views (job_posting_id, viewed_at desc);

create index if not exists idx_job_posting_detail_views_dedup
on public.job_posting_detail_views (job_posting_id, viewer_fingerprint, viewed_at desc);

create index if not exists idx_job_posting_detail_views_source
on public.job_posting_detail_views (job_posting_id, source_label, viewed_at desc);

alter table public.job_posting_detail_views enable row level security;

create policy job_posting_detail_views_select on public.job_posting_detail_views
for select using (public.is_tenant_editor(tenant_id));

grant select on public.job_posting_detail_views to authenticated;

create or replace function public.job_application_source_label_v1(
  p_source text,
  p_metadata jsonb
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(
        case
          when coalesce(p_metadata -> 'sourceAttribution' ->> 'categoryName', '') <> ''
            and coalesce(p_metadata -> 'sourceAttribution' ->> 'sourceDetail', '') <> ''
            then (p_metadata -> 'sourceAttribution' ->> 'categoryName')
              || ' · '
              || (p_metadata -> 'sourceAttribution' ->> 'sourceDetail')
          when coalesce(p_metadata -> 'sourceAttribution' ->> 'categoryName', '') <> ''
            then p_metadata -> 'sourceAttribution' ->> 'categoryName'
          else null
        end
      ),
      ''
    ),
    case
      when coalesce(p_source, '') <> '' and p_source <> 'public_job_board' then p_source
      else 'Direct / untracked'
    end
  );
$$;

grant execute on function public.job_application_source_label_v1(text, jsonb) to authenticated, service_role;
