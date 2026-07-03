drop view if exists candidate_dossier_v1 cascade;

create or replace view candidate_dossier_v1 as
select
  c.id as candidate_id,
  c.tenant_id,
  c.name,
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
  c.status,

  -- PROFILE CORE
  cp.profile_json,
  cp.timeline_json,
  cp.skill_matrix_json,
  cp.missing_fields,
  cp.parse_warnings,
  cp.raw_text,  -- ✅ FIX الأساسي

  -- SUMMARY LAYER
  cs.short_summary,
  cs.long_summary,
  cs.strengths,
  cs.risks,
  cs.recommended_roles,
  cs.evidence_refs,
  cs.confidence,

  -- SOURCE DOC
  sd.id as source_document_id,
  sd.original_filename,
  sd.mime_type,
  sd.storage_path,
  sd.source_uri

from candidates c
left join candidate_profiles cp
  on cp.tenant_id = c.tenant_id
 and cp.candidate_id = c.id
left join candidate_summaries cs
  on cs.tenant_id = c.tenant_id
 and cs.candidate_id = c.id
left join source_documents sd
  on sd.tenant_id = c.tenant_id
 and sd.id = c.latest_document_id;