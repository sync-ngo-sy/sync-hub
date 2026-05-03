create index if not exists idx_candidate_profiles_tenant_source_updated
  on public.candidate_profiles (tenant_id, source_document_id, updated_at desc);

create or replace function public.parsing_overview_compact_v1(
  p_tenant_ids uuid[] default null
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
    base.*,
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
    coalesce(base.run_status, base.candidate_status, 'queued') as display_status,
    array(
      select distinct warning
      from unnest(base.parse_warnings || base.run_warnings) warning
      where nullif(trim(warning), '') is not null
    ) as warnings
  from base
),
scored as (
  select
    features.*,
    coalesce(array_length(features.warnings, 1), 0) as warnings_count,
    (
      case when features.profile_json <> '{}'::jsonb then 10 else 0 end
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
items as (
  select
    scored.*,
    case
      when scored.display_status = 'failed' then 0
      else greatest(0, least(100, round(scored.coverage_score - least(10, scored.warnings_count * 2))::integer))
    end as parsed_percentage
  from scored
),
summary_items as (
  select
    items.*,
    case
      when items.display_status in ('failed', 'partial_failed') or items.parsed_percentage < 55 or items.extraction_confidence < 45 then 'critical'
      when items.parsed_percentage < 75 or items.extraction_confidence < 65 then 'review'
      else 'healthy'
    end as quality_band,
    (
      items.parsed_percentage < 75
      or items.extraction_confidence < 65
      or items.display_status in ('failed', 'partial_failed')
    ) as needs_attention
  from items
)
select jsonb_build_object(
  'overallParsedPercentage', coalesce(round(avg(parsed_percentage))::integer, 0),
  'averageConfidence', coalesce(round(avg(extraction_confidence))::integer, 0),
  'documentsCount', count(*)::integer,
  'completedCount', count(*) filter (where display_status = 'completed')::integer,
  'needsReviewCount', count(*) filter (where needs_attention)::integer,
  'failedCount', count(*) filter (where display_status in ('failed', 'partial_failed'))::integer,
  'items', coalesce(
    jsonb_agg(
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
    ) filter (where document_id is not null),
    '[]'::jsonb
  )
)
from summary_items;
$$;

grant execute on function public.parsing_overview_compact_v1(uuid[]) to authenticated;
