create unique index if not exists idx_job_applications_public_active_email_uidx
on public.job_applications (job_posting_id, lower(applicant_email))
where source = 'public_job_board'
  and status <> 'withdrawn';

create or replace function public.public_job_postings_v1()
returns table (
  id text,
  slug text,
  title text,
  summary text,
  description text,
  location text,
  remote_policy text,
  seniority_level text,
  employment_type text,
  required_skills text[],
  preferred_skills text[],
  key_responsibilities text[],
  application_deadline date,
  apply_enabled boolean,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    jp.public_slug as id,
    jp.public_slug as slug,
    coalesce(nullif(jp.public_title, ''), jp.title) as title,
    coalesce(jp.public_summary, '') as summary,
    coalesce(jp.public_description, '') as description,
    coalesce(jp.public_location, jp.location_info ->> 'city', jp.location_info ->> 'country', '') as location,
    coalesce(jp.location_info ->> 'remote_policy', jp.location_info ->> 'remotePolicy', 'Unspecified') as remote_policy,
    jp.seniority_level,
    jp.employment_type,
    jp.required_skills,
    jp.preferred_skills,
    jp.key_responsibilities,
    jp.application_deadline,
    (
      jp.public_apply_enabled
      and (
        jp.application_deadline is null
        or jp.application_deadline >= (timezone('utc', now()))::date
      )
    ) as apply_enabled,
    jp.public_published_at as published_at
  from public.job_postings jp
  where jp.status = 'active'
    and jp.is_public
    and jp.public_slug is not null
  order by jp.public_published_at desc nulls last, jp.posted_date desc nulls last, jp.created_at desc;
$$;

create or replace function public.public_job_detail_v1(p_slug text)
returns table (
  id text,
  slug text,
  title text,
  summary text,
  description text,
  location text,
  remote_policy text,
  seniority_level text,
  employment_type text,
  required_skills text[],
  preferred_skills text[],
  key_responsibilities text[],
  application_deadline date,
  apply_enabled boolean,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.public_job_postings_v1() job
  where job.slug = nullif(btrim(p_slug), '')
  limit 1;
$$;

create or replace function public.submit_public_job_application_v1(
  p_slug text,
  p_application jsonb
)
returns table (
  accepted boolean,
  duplicate boolean,
  application_id uuid,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.job_postings%rowtype;
  v_name text := nullif(btrim(coalesce(p_application ->> 'name', '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_application ->> 'email', '')), ''));
  v_consent boolean := lower(coalesce(p_application ->> 'consent', p_application ->> 'consentGiven', 'false')) = 'true';
  v_idempotency_key text := nullif(btrim(coalesce(p_application ->> 'idempotencyKey', p_application ->> 'idempotency_key', '')), '');
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip text;
  v_user_agent text;
  v_ip_hash text;
  v_user_agent_hash text;
  v_application_id uuid;
  v_submitted_at timestamptz;
begin
  select *
  into v_job
  from public.job_postings jp
  where jp.public_slug = nullif(btrim(p_slug), '')
    and jp.status = 'active'
    and jp.is_public
  limit 1;

  if v_job.id is null then
    raise exception 'job_not_found';
  end if;

  if not v_job.public_apply_enabled
    or (
      v_job.application_deadline is not null
      and v_job.application_deadline < (timezone('utc', now()))::date
    ) then
    raise exception 'applications_closed';
  end if;

  if v_name is null or length(v_name) > 160 then
    raise exception 'applicant_name_required';
  end if;

  if v_email is null or length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'valid_email_required';
  end if;

  if not v_consent then
    raise exception 'consent_required';
  end if;

  v_ip := split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'cf-connecting-ip', ''), ',', 1);
  v_user_agent := coalesce(v_headers ->> 'user-agent', '');
  v_ip_hash := case
    when nullif(btrim(v_ip), '') is null then null
    else encode(sha256(convert_to(btrim(v_ip), 'utf8')), 'hex')
  end;
  v_user_agent_hash := case
    when nullif(btrim(v_user_agent), '') is null then null
    else encode(sha256(convert_to(btrim(v_user_agent), 'utf8')), 'hex')
  end;

  select ja.id, ja.submitted_at
  into v_application_id, v_submitted_at
  from public.job_applications ja
  where ja.job_posting_id = v_job.id
    and lower(ja.applicant_email) = v_email
    and ja.source = 'public_job_board'
    and ja.status <> 'withdrawn'
  order by ja.submitted_at desc
  limit 1;

  if v_application_id is not null then
    return query select true, true, v_application_id, v_submitted_at;
    return;
  end if;

  begin
    insert into public.job_applications (
      tenant_id,
      job_posting_id,
      applicant_name,
      applicant_email,
      applicant_phone,
      applicant_location,
      linkedin_url,
      portfolio_url,
      resume_original_filename,
      cover_note,
      consent_given,
      source,
      idempotency_key,
      ip_hash,
      user_agent_hash
    )
    values (
      v_job.tenant_id,
      v_job.id,
      v_name,
      v_email,
      nullif(left(btrim(coalesce(p_application ->> 'phone', '')), 80), ''),
      nullif(left(btrim(coalesce(p_application ->> 'location', '')), 160), ''),
      nullif(left(btrim(coalesce(p_application ->> 'linkedinUrl', p_application ->> 'linkedin_url', '')), 500), ''),
      nullif(left(btrim(coalesce(p_application ->> 'portfolioUrl', p_application ->> 'portfolio_url', '')), 500), ''),
      nullif(left(btrim(coalesce(p_application ->> 'resumeOriginalFilename', p_application ->> 'resume_original_filename', '')), 255), ''),
      left(coalesce(p_application ->> 'coverNote', p_application ->> 'cover_note', ''), 4000),
      true,
      'public_job_board',
      v_idempotency_key,
      v_ip_hash,
      v_user_agent_hash
    )
    returning id, job_applications.submitted_at
    into v_application_id, v_submitted_at;

    insert into public.job_application_events (
      tenant_id,
      application_id,
      actor_user_id,
      event_type,
      payload
    )
    values (
      v_job.tenant_id,
      v_application_id,
      null,
      'APPLICATION_SUBMITTED',
      jsonb_build_object('source', 'public_job_board')
    );

    return query select true, false, v_application_id, v_submitted_at;
  exception
    when unique_violation then
      select ja.id, ja.submitted_at
      into v_application_id, v_submitted_at
      from public.job_applications ja
      where ja.job_posting_id = v_job.id
        and (
          (v_idempotency_key is not null and ja.idempotency_key = v_idempotency_key)
          or lower(ja.applicant_email) = v_email
        )
      order by ja.submitted_at desc
      limit 1;

      return query select true, true, v_application_id, v_submitted_at;
  end;
end;
$$;

grant execute on function public.public_job_postings_v1() to anon, authenticated;
grant execute on function public.public_job_detail_v1(text) to anon, authenticated;
grant execute on function public.submit_public_job_application_v1(text, jsonb) to anon, authenticated;
