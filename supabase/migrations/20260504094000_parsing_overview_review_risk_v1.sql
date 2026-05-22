drop function if exists public.parsing_overview_page_v1(uuid[], integer, integer, boolean);

create or replace function public.parsing_overview_page_v1(
  p_tenant_ids uuid[] default null,
  p_limit integer default 100,
  p_offset integer default 0,
  p_needs_review_only boolean default false,
  p_query text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
with scoped_tenants as (
  select t.id
  from public.tenants t
  where public.is_tenant_member(t.id)
    and (
      coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or t.id = any(p_tenant_ids)
    )
),
search_params as (
  select trim(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9+#.@_-]+', ' ', 'g')) as query
),
latest_runs as (
  select distinct on (pr.tenant_id, pr.source_document_id)
    pr.tenant_id,
    pr.source_document_id,
    pr.status,
    pr.parser_version,
    pr.model_version,
    pr.prompt_version,
    pr.embedding_version,
    coalesce(pr.warnings, '{}'::text[]) as warnings
  from public.processing_runs pr
  join scoped_tenants st on st.id = pr.tenant_id
  where pr.source_document_id is not null
  order by pr.tenant_id, pr.source_document_id, pr.created_at desc
),
base as (
  select
    sd.id as document_id,
    sd.tenant_id,
    sd.candidate_id,
    sd.source_type,
    sd.original_filename,
    sd.mime_type,
    sd.source_uri,
    sd.created_at,
    c.name as candidate_name_raw,
    c.headline,
    c.current_title,
    c.location,
    c.years_experience,
    c.seniority,
    c.primary_role,
    c.top_skills,
    c.email,
    c.phone,
    c.links,
    c.summary_short,
    c.status as candidate_status,
    csc.skills as cached_skills,
    csc.companies as cached_companies,
    csc.summary_confidence,
    coalesce(cps.profile_json, cpc.profile_json, '{}'::jsonb) as profile_json,
    coalesce(cps.timeline_json, cpc.timeline_json, '[]'::jsonb) as timeline_json,
    coalesce(cps.confidence, cpc.confidence, csc.summary_confidence, 0) as confidence,
    coalesce(cps.missing_fields, cpc.missing_fields, '{}'::text[]) as missing_fields,
    coalesce(cps.parse_warnings, cpc.parse_warnings, '{}'::text[]) as parse_warnings,
    lr.status as run_status,
    lr.parser_version,
    lr.model_version,
    lr.prompt_version,
    lr.embedding_version,
    coalesce(lr.warnings, '{}'::text[]) as run_warnings
  from public.source_documents sd
  join scoped_tenants st on st.id = sd.tenant_id
  left join public.candidates c
    on c.tenant_id = sd.tenant_id
   and c.id = sd.candidate_id
  left join public.candidate_search_cache csc
    on csc.tenant_id = sd.tenant_id
   and csc.candidate_id = sd.candidate_id
  left join public.candidate_profiles cps
    on cps.tenant_id = sd.tenant_id
   and cps.source_document_id = sd.id
  left join public.candidate_profiles cpc
    on cps.candidate_id is null
   and cpc.tenant_id = sd.tenant_id
   and cpc.candidate_id = sd.candidate_id
  left join latest_runs lr
    on lr.tenant_id = sd.tenant_id
   and lr.source_document_id = sd.id
),
features as (
  select
    base.document_id,
    base.tenant_id,
    base.candidate_id,
    base.source_type,
    base.original_filename,
    base.mime_type,
    base.source_uri,
    base.created_at,
    0 as raw_text_length,
    round((least(greatest(coalesce(base.confidence, 0), 0), 1) * 100)::numeric)::integer as extraction_confidence,
    coalesce(nullif(trim(base.profile_json ->> 'name'), ''), base.candidate_name_raw, 'Unassigned candidate') as candidate_name,
    coalesce(nullif(trim(base.profile_json ->> 'current_title'), ''), base.current_title, 'Title not parsed') as display_title,
    coalesce(nullif(trim(base.profile_json ->> 'headline'), ''), base.headline, '') as display_headline,
    coalesce(nullif(trim(base.profile_json ->> 'location'), ''), base.location, '') as display_location,
    coalesce(nullif(trim(base.profile_json ->> 'email'), ''), base.email, '') as display_email,
    coalesce(nullif(trim(base.profile_json ->> 'phone'), ''), base.phone, '') as display_phone,
    coalesce(nullif(trim(base.profile_json ->> 'summary'), ''), base.summary_short, '') as display_summary,
    case
      when (base.profile_json ->> 'years_experience') ~ '^[0-9]+(\.[0-9]+)?$'
        then (base.profile_json ->> 'years_experience')::numeric
      else coalesce(base.years_experience, 0)
    end as display_years_experience,
    coalesce(nullif(trim(base.profile_json ->> 'seniority'), ''), base.seniority, '') as display_seniority,
    coalesce(
      nullif(trim(case when jsonb_typeof(base.profile_json -> 'role_tags') = 'array' then base.profile_json -> 'role_tags' ->> 0 else null end), ''),
      base.primary_role,
      ''
    ) as display_primary_role,
    greatest(
      case when jsonb_typeof(base.profile_json -> 'skills') = 'array' then jsonb_array_length(base.profile_json -> 'skills') else 0 end,
      coalesce(array_length(base.top_skills, 1), 0),
      coalesce(array_length(base.cached_skills, 1), 0)
    ) as skills_count,
    coalesce(array_length(base.cached_companies, 1), 0) as companies_count,
    case when jsonb_typeof(base.timeline_json) = 'array' then jsonb_array_length(base.timeline_json) else 0 end as timeline_count,
    case when jsonb_typeof(base.profile_json -> 'education') = 'array' then jsonb_array_length(base.profile_json -> 'education') else 0 end as education_count,
    case when jsonb_typeof(base.profile_json -> 'projects') = 'array' then jsonb_array_length(base.profile_json -> 'projects') else 0 end as projects_count,
    greatest(
      case when jsonb_typeof(base.profile_json -> 'links') = 'array' then jsonb_array_length(base.profile_json -> 'links') else 0 end,
      coalesce(array_length(base.links, 1), 0)
    ) as links_count,
    coalesce(base.cached_skills, base.top_skills, '{}'::text[]) as search_skills,
    coalesce(base.cached_companies, '{}'::text[]) as search_companies,
    coalesce(base.run_status, base.candidate_status, 'queued') as display_status,
    base.parser_version,
    base.model_version,
    base.prompt_version,
    base.embedding_version,
    base.missing_fields,
    array(
      select distinct warning
      from unnest(base.parse_warnings || base.run_warnings) warning
      where nullif(trim(warning), '') is not null
    ) as warnings,
    case when base.profile_json <> '{}'::jsonb then 10 else 0 end as profile_score
  from base
),
scored as (
  select
    features.*,
    coalesce(array_length(features.warnings, 1), 0) as warnings_count,
    (
      features.profile_score
      + case
          when features.candidate_name <> 'Unassigned candidate' and (features.display_title <> 'Title not parsed' or features.display_headline <> '') then 16
          when features.candidate_name <> 'Unassigned candidate' or features.display_title <> 'Title not parsed' or features.display_headline <> '' then 8.8
          else 0
        end
      + case when features.display_location <> '' then 4 else 0 end
      + case when features.display_email <> '' and features.display_phone <> '' then 8 when features.display_email <> '' or features.display_phone <> '' then 4.4 else 0 end
      + case when features.skills_count >= 6 then 14 when features.skills_count >= 2 then 7.7 else 0 end
      + case
          when features.timeline_count >= 3 or features.projects_count >= 2 or features.companies_count >= 3 then 18
          when features.timeline_count >= 1 or features.projects_count >= 1 or features.companies_count >= 1 or features.display_years_experience > 0 then 9.9
          else 0
        end
      + case when features.education_count >= 1 then 8 else 0 end
      + case when features.projects_count >= 2 then 6 when features.projects_count = 1 then 3.3 else 0 end
      + case when features.links_count >= 2 then 4 when features.links_count = 1 then 2.2 else 0 end
      + case when char_length(features.display_summary) > 120 then 4 when char_length(features.display_summary) > 0 then 2.2 else 0 end
      + case
          when features.display_years_experience > 0 and features.display_seniority <> '' and features.display_primary_role <> '' then 8
          when features.display_years_experience > 0 or features.display_seniority <> '' or features.display_primary_role <> '' then 4.4
          else 0
        end
    ) as coverage_score
  from features
),
summary_items as materialized (
  select
    scored.document_id,
    scored.tenant_id,
    scored.candidate_id,
    scored.candidate_name,
    scored.display_title,
    scored.display_email,
    scored.display_phone,
    scored.original_filename,
    scored.mime_type,
    scored.source_type,
    scored.source_uri,
    scored.created_at,
    scored.raw_text_length,
    scored.extraction_confidence,
    scored.display_status,
    scored.parser_version,
    scored.model_version,
    scored.prompt_version,
    scored.embedding_version,
    scored.missing_fields,
    scored.warnings,
    scored.warnings_count,
    scored.timeline_count,
    scored.skills_count,
    regexp_replace(
      lower(
        concat_ws(
          ' ',
          scored.document_id::text,
          scored.candidate_id::text,
          scored.original_filename,
          scored.mime_type,
          scored.source_type,
          scored.source_uri,
          scored.candidate_name,
          scored.display_title,
          scored.display_location,
          scored.display_email,
          scored.display_phone,
          scored.display_summary,
          scored.display_seniority,
          scored.display_primary_role,
          scored.display_status,
          scored.parser_version,
          scored.model_version,
          scored.prompt_version,
          array_to_string(scored.search_skills, ' '),
          array_to_string(scored.search_companies, ' '),
          array_to_string(scored.missing_fields, ' '),
          array_to_string(scored.warnings, ' ')
        )
      ),
      '[^a-z0-9+#.@_-]+',
      ' ',
      'g'
    ) as search_text,
    case
      when scored.display_status = 'failed' then 0
      else greatest(0, least(100, round(scored.coverage_score - least(10, scored.warnings_count * 2))::integer))
    end as parsed_percentage
  from scored
),
quality_items as materialized (
  select
    summary_items.*,
    case
      when summary_items.display_status in ('failed', 'partial_failed') or summary_items.parsed_percentage < 55 or summary_items.extraction_confidence < 45 then 'critical'
      when summary_items.extraction_confidence < 65
        or summary_items.candidate_name = 'Unassigned candidate'
        or summary_items.display_title = 'Title not parsed'
        or summary_items.skills_count < 2
        or (
          summary_items.display_email = ''
          and summary_items.display_phone = ''
          and summary_items.missing_fields && array['contact', 'email', 'phone']
        )
        or (summary_items.missing_fields && array['name'] and summary_items.candidate_name = 'Unassigned candidate')
        or (summary_items.missing_fields && array['current_title'] and summary_items.display_title = 'Title not parsed')
        or (summary_items.missing_fields && array['skills'] and summary_items.skills_count < 2)
        then 'review'
      else 'healthy'
    end as quality_band,
    (
      summary_items.parsed_percentage < 55
      or summary_items.extraction_confidence < 65
      or summary_items.display_status in ('failed', 'partial_failed')
      or summary_items.candidate_name = 'Unassigned candidate'
      or summary_items.display_title = 'Title not parsed'
      or summary_items.skills_count < 2
      or (
        summary_items.display_email = ''
        and summary_items.display_phone = ''
        and summary_items.missing_fields && array['contact', 'email', 'phone']
      )
      or (summary_items.missing_fields && array['name'] and summary_items.candidate_name = 'Unassigned candidate')
      or (summary_items.missing_fields && array['current_title'] and summary_items.display_title = 'Title not parsed')
      or (summary_items.missing_fields && array['skills'] and summary_items.skills_count < 2)
    ) as needs_attention
  from summary_items
),
filtered_items as (
  select quality_items.*
  from quality_items
  cross join search_params
  where (not p_needs_review_only or needs_attention)
    and (
      search_params.query = ''
      or not exists (
        select 1
        from regexp_split_to_table(search_params.query, '\s+') as tokens(token)
        where token <> ''
          and quality_items.search_text not like '%' || token || '%'
      )
    )
),
page_items as (
  select *
  from filtered_items
  order by needs_attention desc, parsed_percentage asc, original_filename asc
  limit greatest(0, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0))
),
workspace_rollups as (
  select
    tenant_id,
    count(distinct candidate_id) filter (where candidate_id is not null) as candidates,
    count(*) as documents,
    coalesce(round(avg(parsed_percentage))::integer, 0) as average_parse,
    count(*) filter (where needs_attention) as needs_review,
    count(*) filter (where display_status in ('failed', 'partial_failed')) as failed
  from quality_items
  group by tenant_id
)
select jsonb_build_object(
  'overallParsedPercentage', coalesce((select round(avg(parsed_percentage))::integer from quality_items), 0),
  'averageConfidence', coalesce((select round(avg(extraction_confidence))::integer from quality_items), 0),
  'documentsCount', coalesce((select count(*)::integer from quality_items), 0),
  'completedCount', coalesce((select count(*)::integer from quality_items where display_status = 'completed'), 0),
  'needsReviewCount', coalesce((select count(*)::integer from quality_items where needs_attention), 0),
  'failedCount', coalesce((select count(*)::integer from quality_items where display_status in ('failed', 'partial_failed')), 0),
  'documentsWithWarnings', coalesce((select count(*)::integer from quality_items where warnings_count > 0), 0),
  'missingContactCount', coalesce((select count(*)::integer from quality_items where missing_fields && array['email', 'phone']), 0),
  'lowCoverageCount', coalesce((select count(*)::integer from quality_items where parsed_percentage < 70), 0),
  'itemsTotalCount', coalesce((select count(*)::integer from filtered_items), 0),
  'pageLimit', greatest(0, least(coalesce(p_limit, 100), 500)),
  'pageOffset', greatest(0, coalesce(p_offset, 0)),
  'workspaceRollups', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'tenantId', tenant_id,
          'candidates', candidates,
          'documents', documents,
          'averageParse', average_parse,
          'needsReview', needs_review,
          'failed', failed
        )
        order by documents desc, needs_review desc, tenant_id
      )
      from workspace_rollups
    ),
    '[]'::jsonb
  ),
  'items', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'documentId', document_id,
          'tenantId', tenant_id,
          'candidateId', candidate_id,
          'candidateName', candidate_name,
          'currentTitle', display_title,
          'originalFilename', original_filename,
          'mimeType', mime_type,
          'sourceType', coalesce(source_type, 'upload'),
          'sourceUri', coalesce(source_uri, ''),
          'uploadedAt', coalesce(created_at::text, ''),
          'parsedPercentage', parsed_percentage,
          'extractionConfidence', extraction_confidence,
          'rawTextLength', raw_text_length,
          'status', display_status,
          'qualityBand', quality_band,
          'parserVersion', coalesce(parser_version, 'unknown'),
          'modelVersion', coalesce(model_version, 'unknown'),
          'promptVersion', coalesce(prompt_version, 'unknown'),
          'embeddingVersion', coalesce(embedding_version, 'unknown'),
          'warnings', to_jsonb(warnings),
          'missingFields', to_jsonb(missing_fields),
          'keyFindings', to_jsonb(array[
            case when timeline_count > 0 then timeline_count::text || ' roles parsed' else 'No experience timeline' end,
            case when skills_count > 0 then skills_count::text || ' skills normalized' else 'No skills normalized' end,
            case when warnings_count > 0 then warnings_count::text || ' warnings raised' else 'No parser warnings' end
          ]),
          'needsAttention', needs_attention
        )
        order by needs_attention desc, parsed_percentage asc, original_filename asc
      )
      from page_items
    ),
    '[]'::jsonb
  )
);
$$;

grant execute on function public.parsing_overview_page_v1(uuid[], integer, integer, boolean, text) to authenticated;
;
