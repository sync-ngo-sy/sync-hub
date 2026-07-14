-- SCRUM-20 follow-up: persist the per-job-family ranking score on each
-- candidate record. `family_scores` stores one entry per job family computed
-- with the tenant's active ranking formula:
--   {
--     "computed_at": "2026-07-07T09:00:00Z",
--     "formula_version": "v1",
--     "families": {
--       "software-engineering": { "total": 96, "max": 100, "percent": 96, "relevant": true },
--       ...
--     }
--   }
-- Scores are (re)computed by the `rank` edge function (action scores_recompute),
-- automatically after a formula is published, or on demand from the UI.

alter table public.candidates
  add column if not exists family_scores jsonb not null default '{}'::jsonb,
  add column if not exists family_scores_updated_at timestamptz;

-- Expose the stored scores through the dossier view (new columns appended at
-- the end so `create or replace view` stays compatible).
create or replace view public.candidate_dossier_v1 as
select
  c.tenant_id,
  c.id as candidate_id,
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
  c.parse_version,
  c.normalization_version,
  c.embedding_version,
  c.artifact_version,
  cp.profile_json,
  cp.timeline_json,
  cp.skill_matrix_json,
  cp.missing_fields,
  cp.parse_warnings,
  cs.short_summary,
  cs.long_summary,
  cs.strengths,
  cs.risks,
  cs.recommended_roles,
  cs.evidence_refs,
  cs.confidence,
  sd.id as source_document_id,
  sd.original_filename,
  sd.mime_type,
  sd.storage_path,
  sd.source_uri,
  c.family_scores,
  c.family_scores_updated_at
from public.candidates c
left join public.candidate_profiles cp
  on cp.tenant_id = c.tenant_id
 and cp.candidate_id = c.id
left join public.candidate_summaries cs
  on cs.tenant_id = c.tenant_id
 and cs.candidate_id = c.id
left join public.source_documents sd
  on sd.tenant_id = c.tenant_id
 and sd.id = c.latest_document_id;

grant select on public.candidate_dossier_v1 to authenticated;
