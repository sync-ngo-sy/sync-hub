create table if not exists public.insight_report_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  initiated_by_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  report_type text not null check (report_type in ('corpus_overview', 'gap_brief', 'job_family_analysis')),
  input_config jsonb not null default '{}'::jsonb,
  report_payload jsonb,
  failure_reason text,
  llm_provider text,
  llm_model text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.insight_report_runs enable row level security;

drop policy if exists insight_report_runs_select on public.insight_report_runs;
create policy insight_report_runs_select
  on public.insight_report_runs
  for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists insight_report_runs_write on public.insight_report_runs;
create policy insight_report_runs_write
  on public.insight_report_runs
  for all
  using (public.is_tenant_editor(tenant_id))
  with check (public.is_tenant_editor(tenant_id));

create index if not exists idx_insight_report_runs_tenant_created
  on public.insight_report_runs (tenant_id, created_at desc);

grant select, insert, update on public.insight_report_runs to authenticated;
