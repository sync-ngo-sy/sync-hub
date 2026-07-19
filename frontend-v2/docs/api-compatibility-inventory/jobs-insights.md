# API compatibility inventory — jobs & insights

Seeded from `frontend/src/features/jobs/apiMappers.ts`, `frontend/src/features/insights/api.ts`,
`frontend/src/features/insights/reportApiMappers.ts`, and the related methods in
`frontend/src/lib/platformApi.ts`. See ticket 05 checklist item "Create a durable compatibility
inventory". Endpoint/operation names below are the `action` values from
`supabase/functions/platform/index.ts`'s switch statement, or the route for non-`platform`
functions.

Backend evidence was read directly from the current Supabase Edge Function source and, for the
two RPC-backed insights endpoints, the current SQL migration that defines them (the most recent
`create or replace function` wins when a function was redefined across migrations).

**Headline finding**: unlike a codebase where "the backend is inconsistently cased everywhere,"
this domain splits cleanly by *transport*:
- Every endpoint that is a thin wrapper over a Postgres table select (`job_postings`, `job_posting`,
  `matching_runs`, `matching_run`, `job_shortlists`, `job_shortlist`, `job_applications`,
  `insight_report_runs`, `insight_report_run`) returns **snake_case only** — the table's real column
  names, verified against the `*Select` column-list constants in `supabase/functions/platform/jobs.ts`
  and `insightReportRunSelect` in `supabase/functions/_shared/platformOps.ts`.
- Every endpoint whose payload is assembled in code (LLM structured output, or a `jsonb_build_object`
  in a Postgres RPC) returns **camelCase only** — `extract_job_posting`, `insights_dashboard`,
  `insights_gap_analysis`, `start_insight_report`/report generation, and the standalone `public-jobs`
  function (which does its own camelCase mapping server-side).

Given that split, **almost every alias in the current frontend mappers is speculative** — the
frontend defends against both casings on every field "just in case," but for any given field only
one casing has ever actually been observed on the wire. The adapters that replace these mappers
should accept only the verified casing per field, not carry the unverified alternate forward.

---

## `job_postings` (list), `job_posting` (get), `save_job_posting`

Backend: `supabase/functions/platform/jobs.ts` — `jobPostingSelect` (lines 38–71), a literal
Postgres `select()` column list against the `job_postings` table. `save_job_posting` inserts/updates
the same table and returns the same select shape.

All fields below are **verified snake_case-only** — the table has no camelCase columns, so every
`??`-paired camelCase alternate in `mapRemoteJobPosting` (`frontend/src/features/jobs/apiMappers.ts:29-64`)
is unevidenced.

### `tenantId`
- **Accepted wire names**: `tenant_id`
- **Evidence**: `jobPostingSelect` includes `tenant_id` (jobs.ts:40); frontend reads `record.tenant_id ?? record.tenantId` (apiMappers.ts:33) — `tenantId` never observed
- **Required/nullable/optional**: required (non-null FK)
- **Null/absence handling**: frontend currently does `String(... ?? "")` — a missing value silently becomes `""`, a **BANNED PATTERN** (a real ID should never coerce to empty string; treat as a parse failure)
- **Retirement notes**: drop the `tenantId` alias entirely

### `employerName`, `employerCountry`, `jobDescription`, `seniorityLevel`, `employmentType`
- **Accepted wire names**: `employer_name`, `employer_country`, `job_description`, `seniority_level`, `employment_type` respectively
- **Evidence**: all present verbatim in `jobPostingSelect` (jobs.ts:42-49); frontend's camelCase alternates (apiMappers.ts:35,36,38,41,42) never observed
- **Required/nullable/optional**: required, non-null strings on the table
- **Null/absence handling**: same `String(x ?? "")`-to-empty-string BANNED PATTERN as above, repeated per field
- **Retirement notes**: drop all camelCase alternates

### `employerRegion`
- **Accepted wire names**: `employer_region`
- **Evidence**: `jobPostingSelect` (jobs.ts:44); enum-constrained in Postgres (`normalizeRegion` on the backend). Frontend's `normalizeEmployerRegion` (apiMappers.ts:25-27) silently defaults any unrecognized value (including a genuinely missing one) to `"GCC"` — flagged below as a banned pattern
- **Required/nullable/optional**: required, one of `EU`/`USA`/`GCC`
- **Null/absence handling**: see banned patterns
- **Retirement notes**: drop `employerRegion` camelCase alias; keep the enum, but replace the silent default with a parse failure on an unrecognized/missing value

### `requiredSkills`, `preferredSkills`, `keyResponsibilities`
- **Accepted wire names**: `required_skills`, `preferred_skills`, `key_responsibilities`
- **Evidence**: `jobPostingSelect` (jobs.ts:46,47,54); these are Postgres `text[]` columns, always arrays, never the camelCase form
- **Required/nullable/optional**: required, defaults to `{}` at the DB level (empty array, not null)
- **Null/absence handling**: `toStringArray` silently returns `[]` for anything non-array-like — acceptable *only* if genuinely optional; here it's DB-guaranteed non-null so a missing/malformed value should fail parsing, not silently empty
- **Retirement notes**: drop camelCase alternates

### `postedDate`, `applicationDeadline`, `closedAt`, `createdByUserId`, `updatedByUserId`, `closedByUserId`, `publicSlug`, `publicTitle`, `publicSummary`, `publicDescription`, `publicLocation`, `publicPublishedAt`
- **Accepted wire names**: `posted_date`, `application_deadline`, `closed_at`, `created_by_user_id`, `updated_by_user_id`, `closed_by_user_id`, `public_slug`, `public_title`, `public_summary`, `public_description`, `public_location`, `public_published_at`
- **Evidence**: all present verbatim in `jobPostingSelect` (jobs.ts:50-68); genuinely nullable columns
- **Required/nullable/optional**: nullable — `nullableString` is the correct shape (not a banned pattern here, since `null` is a real, intended state)
- **Retirement notes**: drop camelCase alternates; the nullable handling itself is fine to carry forward as-is

### `locationInfo`, `aiProfile`, `aiConfidence`
- **Accepted wire names**: `location_info`, `ai_profile`, `ai_confidence`
- **Evidence**: `jobPostingSelect` (jobs.ts:53,55,56) — JSONB columns
- **Required/nullable/optional**: required, defaults to `{}`
- **Null/absence handling**: `asRecord` silently coercing a malformed value to `{}` hides a genuine backend/data bug — should fail parsing instead
- **Retirement notes**: drop camelCase alternates

### `isPublic`, `publicApplyEnabled`
- **Accepted wire names**: `is_public`, `public_apply_enabled`
- **Evidence**: `jobPostingSelect` (jobs.ts:61,67) — boolean columns
- **Required/nullable/optional**: required booleans
- **Null/absence handling**: `mapRemoteJobPosting` (apiMappers.ts:60) has a peculiar double-negative default: `record.public_apply_enabled === false || record.publicApplyEnabled === false ? false : true` — i.e. *anything other than exactly `false`* (including `undefined`/missing/malformed) silently becomes `true`. **BANNED PATTERN**: a missing required boolean must fail parsing, not default to the more-permissive value (this one is security/product relevant — it controls whether the public apply form is open)
- **Retirement notes**: replace with `z.boolean()` (required, no default)

### `createdAt`, `updatedAt`
- **Accepted wire names**: `created_at`, `updated_at`
- **Evidence**: `jobPostingSelect` (jobs.ts:69,70) — Postgres timestamp columns, always present
- **Required/nullable/optional**: required
- **Null/absence handling**: `String(x ?? "")` — same empty-string BANNED PATTERN
- **Retirement notes**: drop camelCase alternates; use `z.string()` (or `z.iso.datetime()`), required

---

## `extract_job_posting`

Backend: `supabase/functions/platform/jobs.ts:445-519` (`extractJobPosting`). The response is
`{ ...payload, ...fields, modelProvider, modelName, promptVersion, inputHash }` where `payload` is
LLM structured output validated against `jobExtractionSchema` in
`supabase/functions/_shared/jobMatching.ts:389-474`, and `fields` comes from `extractionToJobFields`
(same file, line 227). **This entire payload is emitted as camelCase JS object literals — there is
no snake_case path.** The `model_provider`/`model_name`/`prompt_version`/`input_hash` snake_case
names exist only in the `job_ai_extractions` audit-table insert (jobs.ts:494-497) — a separate,
frontend-invisible write — not in the response returned to the caller.

### `requiredSkills`, `preferredSkills` (each `{name, confidence, evidence}[]`), `seniorityLevel`, `employmentType` (each `{value, confidence, evidence}`), `location` (`{country, city, region, remotePolicy, confidence}`), `keyResponsibilities`, `warnings` (`{type, message}[]`)
- **Accepted wire names**: camelCase only — `requiredSkills`, `preferredSkills`, `seniorityLevel`, `employmentType`, `location`, `keyResponsibilities`, `warnings`
- **Evidence**: `jobExtractionSchema.required` (jobMatching.ts:465-474) marks every one of these as a JSON-Schema-required top-level key with `additionalProperties: false`, so the LLM call itself cannot return a snake_case variant
- **Required/nullable/optional**: all required, non-null (schema-enforced)
- **Null/absence handling**: frontend's `record.requiredSkills ?? record.required_skills` (apiMappers.ts:110) etc. — the snake_case half of every alias here is unevidenced; drop it
- **Retirement notes**: `location` is currently read by the frontend as a bare `asRecord(record.location)` cast to `JobExtractionResult["location"]` with **no field validation at all** — this is worth calling out separately as a gap (not an alias) for whoever builds the adapter: it should be a real nested schema (`country`/`city`/`region` nullable strings, `remotePolicy` string, `confidence` number), not an unchecked cast

### `warnings[].type`
- **Evidence**: schema requires `type`/`message` on every warning (jobMatching.ts:452-463, `required: ["type", "message"]`); frontend defaults `record.type ?? "WARNING"` (apiMappers.ts:127) if missing. Since the schema makes `type` required and non-optional, a missing value here indicates a genuine LLM/schema-validation failure upstream, not a legitimate omitted-field case
- **Retirement notes**: **BANNED PATTERN** — this default silently launders a validation failure into a fake `"WARNING"` entry; should fail parsing instead

### `modelProvider`, `modelName`, `promptVersion`, `inputHash`
- **Accepted wire names**: camelCase only — `modelProvider`, `modelName`, `promptVersion`, `inputHash`
- **Evidence**: jobs.ts:483-490, object literal spread directly into the HTTP response; the snake_case forms (`model_provider` etc., jobs.ts:494-497) are only ever written to the `job_ai_extractions` table, never returned
- **Required/nullable/optional**: required
- **Retirement notes**: drop the `record.model_provider` / `record.model_name` / `record.prompt_version` / `record.input_hash` aliases (apiMappers.ts:131-134) entirely — genuinely dead, not just unlikely

---

## `start_job_matching_run`, `matching_runs` (list), `matching_run` (get)

Backend: `supabase/functions/platform/jobs.ts` — `matchingRunSelect` (lines 73-94) and
`matchingResultSelect` (lines 96-116), both literal Postgres select lists against
`job_matching_runs` / `job_matching_results`. `start_job_matching_run` and `matching_run` both
return `{ run: <matchingRunSelect row>, results: <matchingResultSelect rows> }` (jobs.ts, `getMatchingRun`); the wrapper keys `run`/`results` themselves have no alias variants in the frontend and need none.

**All fields in both selects are verified snake_case-only** — same situation as `job_postings`
above. The camelCase alternates throughout `mapRemoteJobMatchingRun` and
`mapRemoteJobCandidateMatch` (apiMappers.ts:138-200) are unevidenced.

### `tenantId`, `jobPostingId`, `initiatedByUserId`, `requestedLimit`, `semanticPoolSize`, `rerankPoolSize`, `retrievedCount`, `filteredCount`, `rerankedCount`, `completedCount`, `failureReason`, `matchingConfig`, `jobProfile`, `embeddingProvider`, `embeddingVersion`, `startedAt`, `completedAt`, `createdAt`
- **Accepted wire names**: `tenant_id`, `job_posting_id`, `initiated_by_user_id`, `requested_limit`, `semantic_pool_size`, `rerank_pool_size`, `retrieved_count`, `filtered_count`, `reranked_count`, `completed_count`, `failure_reason`, `matching_config`, `job_profile`, `embedding_provider`, `embedding_version`, `started_at`, `completed_at`, `created_at`
- **Evidence**: every one present verbatim in `matchingRunSelect` (jobs.ts:73-94)
- **Required/nullable/optional**: numeric counters and IDs required; `failure_reason`/`embedding_provider`/`embedding_version`/`started_at`/`completed_at` nullable
- **Null/absence handling**: numeric fields go through `toNumber(x, fallback=0)` (see `json.ts` note below) — a missing/malformed `requested_limit` silently becomes `0`, indistinguishable from a real zero. **BANNED PATTERN** for any of these counters
- **Retirement notes**: drop every camelCase alternate

### `status` (run-level)
- **Accepted wire names**: `status` (no alias — single key, snake_case n/a since it's one word)
- **Evidence**: `matchingRunSelect` (jobs.ts:78); DB enum `queued`/`running`/`completed`/`cancelled`/`failed`
- **Null/absence handling**: frontend defaults any unrecognized value (including missing) to `"failed"` (apiMappers.ts:140,146) — **BANNED PATTERN**, conflates "the run genuinely failed" with "we couldn't parse the status," which is a meaningfully different, important-to-surface-as-an-error condition
- **Retirement notes**: use a strict `z.enum([...])`, no default

### `tenantId`, `matchingRunId`, `jobPostingId`, `candidateId`, `sourceTenantId`, `rank`, `semanticScore`, `aiScore`, `finalScore`, `matchedSkills`, `missingSkills`, `experienceSummary`, `matchExplanation`, `scoringBreakdown`, `hardFilterPayload`, `candidateSnapshot`, `createdAt` (match-result level)
- **Accepted wire names**: `tenant_id`, `matching_run_id`, `job_posting_id`, `candidate_id`, `candidate_source_tenant_id`, `rank`, `semantic_score`, `ai_score`, `final_score`, `matched_skills`, `missing_skills`, `experience_summary`, `match_explanation`, `scoring_breakdown`, `hard_filter_payload`, `candidate_snapshot`, `created_at`
- **Evidence**: every one present verbatim in `matchingResultSelect` (jobs.ts:96-116). Note the frontend field is `sourceTenantId` but the wire column is `candidate_source_tenant_id` (not `source_tenant_id`) — this is a real, necessary rename (not a casing alias) and must be preserved as such in the adapter, not treated as a speculative alias
- **Required/nullable/optional**: scores/rank required numeric; `candidate_source_tenant_id` nullable
- **Null/absence handling**: `rank`/`semanticScore`/`aiScore`/`finalScore` go through `toNumber(x, 0)` — same **BANNED PATTERN** as above, notably worse here since these are literally the match-quality scores shown to the recruiter; a parse failure must not silently present as "0% match"
- **Retirement notes**: drop camelCase alternates; keep the `candidate_source_tenant_id → sourceTenantId` rename

### `seniorityAlignment`
- **Accepted wire names**: `seniority_alignment`
- **Evidence**: `matchingResultSelect` (jobs.ts:109), DB enum `Exact Match`/`Partial Match`/`Mismatch`
- **Null/absence handling**: frontend's nested nine-branch ternary (apiMappers.ts:168-177) checks both casings and silently defaults anything else to `"Mismatch"` — **BANNED PATTERN**, same reasoning as run `status` above (conflates a real mismatch with a parse failure)
- **Retirement notes**: `z.enum([...])`, no default; drop the `seniorityAlignment` camelCase check entirely (never observed — the column is snake_case only)

---

## `job_shortlists` (list), `job_shortlist` (get), `save_job_shortlist`

Backend: `jobShortlistSelect` (jobs.ts:118-128) against `job_shortlists`;
`job_shortlist_candidates` is read with `select("*")` (jobs.ts:914) rather than a named constant —
flagged below.

### `tenantId`, `jobPostingId`, `matchingRunId`, `ownerUserId`, `createdAt`, `updatedAt` (shortlist level)
- **Accepted wire names**: `tenant_id`, `job_posting_id`, `matching_run_id`, `owner_user_id`, `created_at`, `updated_at`
- **Evidence**: `jobShortlistSelect` (jobs.ts:118-128)
- **Null/absence handling**: same `String(x ?? "")` BANNED PATTERN as job postings above for the required string fields
- **Retirement notes**: drop camelCase alternates

### `tenantId`, `shortlistId`, `candidateId`, `sourceTenantId`, `savedRank`, `savedScore`, `savedResultPayload`, `addedByUserId`, `createdAt` (shortlist-candidate level)
- **Accepted wire names**: `tenant_id`, `shortlist_id`, `candidate_id`, `candidate_source_tenant_id` (→ `sourceTenantId`, same real rename as the matching-result case above, not a casing alias), `saved_rank`, `saved_score`, `saved_result_payload`, `added_by_user_id`, `created_at`
- **Evidence**: `job_shortlist_candidates` is selected with `select("*")` (jobs.ts:914) rather than a named column list — **this is a gap, not confirmed evidence**. Recommend flagging to backend to add an explicit `jobShortlistCandidateSelect` constant (mirroring the other tables) before finalizing the adapter, so the exact returned column set is pinned rather than inferred from the table's current full schema
- **Null/absence handling**: `savedRank`/`savedScore` via `toNumber(x, 0)` — same scores-silently-become-zero **BANNED PATTERN**
- **Retirement notes**: drop camelCase alternates once the explicit select list exists; keep the `sourceTenantId` rename

---

## `job_applications` (list), `update_job_application_status`

Backend: `jobApplicationSelect` (jobs.ts:130-158) against `job_applications`. All snake_case-only,
same pattern as above.

### All simple string/nullable fields (`tenantId`, `jobPostingId`, `candidateId`, `sourceTenantId`, `applicantName`, `applicantEmail`, `applicantPhone`, `applicantLocation`, `linkedinUrl`, `portfolioUrl`, `resumeStoragePath`, `resumeSourceDocumentId`, `resumeOriginalFilename`, `resumeIngestionError`, `coverNote`, `reviewedByUserId`, `reviewedAt`, `createdAt`, `updatedAt`)
- **Accepted wire names**: their snake_case equivalents per `jobApplicationSelect` (jobs.ts:130-158) — `tenant_id`, `job_posting_id`, `candidate_id`, `candidate_source_tenant_id` (→ `sourceTenantId` rename, not alias), `applicant_name`, `applicant_email`, `applicant_phone`, `applicant_location`, `linkedin_url`, `portfolio_url`, `resume_storage_path`, `resume_source_document_id`, `resume_original_filename`, `resume_ingestion_error`, `cover_note`, `reviewed_by_user_id`, `reviewed_at`, `created_at`, `updated_at`
- **Retirement notes**: drop all camelCase alternates

### `resumeIngestionStatus`, `candidateHubVisibility`, `status` (application status)
- **Accepted wire names**: `resume_ingestion_status`, `candidate_hub_visibility`, `status`
- **Evidence**: `jobApplicationSelect` (jobs.ts:145,147,150); DB enums
- **Null/absence handling**: `normalizeResumeIngestionStatus` defaults anything unrecognized to `"not_uploaded"`, `normalizeCandidateHubVisibility` defaults to `"tenant"`, `normalizeJobApplicationStatus` defaults to `"new"` (apiMappers.ts:250-260,283) — all three are **BANNED PATTERNS** for the same reason as the matching-run status: a malformed/missing enum silently becomes a specific, meaningful business state instead of failing
- **Retirement notes**: strict `z.enum([...])` per field, no defaults

### `metadata`
- **Accepted wire names**: `metadata_json`
- **Evidence**: `jobApplicationSelect` (jobs.ts:155) — note the wire column name itself differs from the canonical name (`metadata_json` → `metadata`), a real rename to preserve, not a casing alias. `record.metadata` (no-suffix camelCase) in the current fallback chain (apiMappers.ts:288) is unevidenced
- **Retirement notes**: keep the `metadata_json → metadata` rename; drop the bare `metadata` read

### `consentGiven`
- **Accepted wire names**: `consent_given`
- **Evidence**: `jobApplicationSelect` (jobs.ts:149) — boolean column
- **Null/absence handling**: `Boolean(record.consent_given ?? record.consentGiven)` — `Boolean(undefined)` is `false`, so a missing value silently becomes "consent not given" rather than failing. Lower severity than the `publicApplyEnabled` case (fails closed, not open) but still **BANNED PATTERN** under the ticket's "no privilege/security-bearing defaults" rule, since consent is a compliance-relevant field
- **Retirement notes**: `z.boolean()`, required, no default

---

## `public-jobs` (list/get), separate Edge Function (not the `platform` aggregator)

Backend: `supabase/functions/public-jobs/helpers.ts:70-106` (`publicJob()` mapper) — this backend
function **already does its own explicit DB-row → camelCase transform server-side**, unlike the
`platform` function's raw table passthroughs above. The response is camelCase-only.

### `remotePolicy`, `seniorityLevel`, `employmentType`, `requiredSkills`, `preferredSkills`, `keyResponsibilities`, `applicationDeadline`, `applyEnabled`, `publishedAt`
- **Accepted wire names**: camelCase only, per `publicJob()` (helpers.ts:74-85) reading from snake_case DB columns and re-emitting camelCase keys
- **Evidence**: helpers.ts:70-106, confirmed by reading the function body directly (not inferred)
- **Retirement notes**: every snake_case alternate in `mapRemotePublicJob` (`frontend/src/features/jobs/apiMappers.ts:294-313`) is unevidenced against this endpoint — **do not carry forward**. (These same field names being snake_case-verified against the *internal* `job_postings` table elsewhere in this doc does not apply here; `public-jobs` is a different function with its own already-normalized output.)

### `remotePolicy` — one genuine exception
- **Accepted wire names**: `remotePolicy` (primary), with a real internal fallback to `remote_policy` **inside the `location_info` JSONB blob only** (`locationInfo.remotePolicy ?? locationInfo.remote_policy`, helpers.ts:74-76)
- **Evidence**: `location_info` is free-form JSONB written by the job-edit form over time; the backend itself defends against both casings because *historical* rows may have been written either way before a convention was settled. This is the one alias in this whole domain that is backend-verified as real, not speculative
- **Required/nullable/optional**: defaults to `"Unspecified"` if absent — an intentional, product-approved display fallback (not a banned pattern; this is a genuinely optional field with a sensible default), verified server-side
- **Retirement notes**: **carry this one forward** — either replicate the same `remotePolicy ?? remote_policy` read on the frontend if the frontend ever reads `location_info` directly (it currently doesn't for public jobs — `publicJob()` already resolves it), or note it as backend-owned and no frontend action needed

### `applyEnabled`
- **Accepted wire names**: `applyEnabled` (camelCase, computed server-side as `public_apply_enabled !== false && isDeadlineOpen(...)`, helpers.ts:83-84)
- **Null/absence handling**: frontend's `record.applyEnabled === false || record.apply_enabled === false ? false : true` (apiMappers.ts:310) — same shape as the `publicApplyEnabled` fail-open BANNED PATTERN noted above for job postings, but here the *backend* already resolved deadline + flag into one boolean, so the frontend adapter should just read it as a required boolean, not re-derive with its own default
- **Retirement notes**: `z.boolean()`, required, no default; drop `apply_enabled` alias

### Public job application receipt (`{ receipt: { accepted, duplicate, applicationId, submittedAt } }`)
- **Accepted wire names**: camelCase only — `applicationId`, `submittedAt` (never `application_id`/`submitted_at` at the response level, even though the underlying DB column is `submitted_at` — the Edge Function does the rename before responding)
- **Evidence**: `supabase/functions/public-jobs/index.ts` lines 88-95, 302-309, 390-396 — three call sites building the receipt object literal, all consistently camelCase
- **Required/nullable/optional**: `applicationId`/`submittedAt` always present on success; `duplicate` only present (as `true`) on the duplicate-submission path, otherwise absent (treat as optional-defaulting-to-false at the schema level, not missing-required)
- **Retirement notes**: drop `application_id`/`submitted_at` aliases (apiMappers.ts:340-341). Also: the response is **always** wrapped in a top-level `receipt` key — `mapPublicReceipt`'s `asRecord(payload).receipt ?? payload` fallback-to-bare-payload (apiMappers.ts:336) has no backend evidence; the bare-payload branch is speculative and should be dropped, parsing should require the `receipt` wrapper

---

## `insights_dashboard`

Backend: **two possible paths, both verified as camelCase-only.**
1. Primary: Postgres RPC `insights_dashboard_snapshot_v1`, current definition in
   `supabase/migrations/20260529113000_insights_gap_backend_rpc_v1.sql:477-731` (this migration's
   `create or replace` supersedes an earlier definition in
   `20260526090000_insights_intelligence_dashboard_v1.sql`). The RPC returns a `jsonb_build_object(...)`
   whose keys are all quoted camelCase literals (`'generatedAt'`, `'deltaValue'`, `'deltaPercent'`,
   `'profilesBySeniority'`, `'profilesByLocation'`, `'jobFamilies'`, `'skillsFrequency'`,
   `'gapUseCases'`, `'seniorityPyramid'`, `'gapAnalysis'`) — read directly from the SQL, not inferred.
2. Fallback (only reached if the RPC itself is missing from the DB, `isMissingRpcError`):
   `buildFallbackInsightsDashboard` in `supabase/functions/_shared/insights.ts:679-811`, a plain TS
   object literal, also 100% camelCase (`generatedAt`, `deltaValue`, `deltaPercent`,
   `profilesBySeniority`, `profilesByLocation`, `jobFamilies`, `skillsFrequency`, `gapUseCases`,
   `seniorityPyramid`, `gapAnalysis` — same key set as the RPC path).

**Every single snake_case alternate in `mapRemoteInsightsDashboard`
(`frontend/src/features/insights/api.ts:8-62`) is unevidenced against both current backend paths.**
This is the cleanest domain in this whole inventory: there is no legitimate alias to carry forward.

### `generatedAt`, `deltaValue`, `deltaPercent`
- **Accepted wire names**: camelCase only
- **Evidence**: RPC (migration:664,671-673,679-681 etc. per metric) and fallback (insights.ts:737,745-750) agree
- **Retirement notes**: drop `generated_at`/`delta_value`/`delta_percent` (api.ts:10,17-18)

### `metrics[].trend`
- **Null/absence handling**: `normalizeTrend` (api.ts:4-6) defaults any unrecognized value to `"flat"`. Both backend paths only ever emit `'up'`/`'down'`/`'flat'` (RPC: migration ~lines 671,679; fallback: insights.ts:735) so this default is currently unreachable in practice — but per the ticket's rule, an unreachable default is still a default; recommend a strict `z.enum(["up","down","flat"])` with no fallback so a future backend change that emits something else fails loudly instead of silently flattening
- **Retirement notes**: n/a (no alias), just drop the default behavior

### `profilesBySeniority`, `profilesByLocation`, `jobFamilies`, `skillsFrequency`, `gapUseCases`, `seniorityPyramid`, `gapAnalysis`
- **Accepted wire names**: camelCase only, no aliasing attempted by the frontend for these top-level keys (only their nested fields are aliased, see below) — confirms the frontend author already suspected these were camelCase-only
- **Evidence**: RPC migration:723-729; fallback insights.ts:781-810

### `seniorityPyramid[].jobFamily`
- **Accepted wire names**: camelCase only — `jobFamily`
- **Evidence**: RPC `jsonb_build_object('jobFamily', job_family, ...)` (migration:653); fallback `{ jobFamily, ...values }` (insights.ts:789)
- **Retirement notes**: drop `job_family` alias (api.ts:52)

---

## `insights_gap_analysis`

Backend: Postgres RPC `insights_gap_analysis_v1`, current definition in
`supabase/migrations/20260529113000_insights_gap_backend_rpc_v1.sql:365-460`; fallback
`buildFallbackGapAnalysis` (`supabase/functions/_shared/insights.ts:559-615`). Both camelCase-only,
same conclusion as the dashboard endpoint.

### `targetRole`, `targetSkills`, `fullyMatchingCandidates`, `partiallyMatchingCandidates`, `zeroMatchCandidates`, `missingSkills`
- **Accepted wire names**: camelCase only — `targetRole`, `targetSkills`, `fullyMatchingCandidates`, `partiallyMatchingCandidates`, `zeroMatchCandidates`, `missingSkills`
- **Evidence**: RPC `jsonb_build_object('targetRole', ..., 'targetSkills', ..., 'fullyMatchingCandidates', ..., 'partiallyMatchingCandidates', ..., 'zeroMatchCandidates', ..., 'missingSkills', ...)` (migration:426-443); fallback returns the same key set as a TS object literal (insights.ts:597-614)
- **Retirement notes**: drop every snake_case alternate in `mapRemoteInsightsGapAnalysis` (api.ts:64-85) — all six top-level fields have one

### `missingSkills[].missingFromPartialCandidates`
- **Accepted wire names**: camelCase only — `missingFromPartialCandidates`
- **Evidence**: RPC (migration:436, inside the nested `jsonb_build_object` for each missing-skill row); fallback (insights.ts:604-607)
- **Retirement notes**: drop `missing_from_partial_candidates` alias (api.ts:80)

### `targetRole` nullability
- **Required/nullable/optional**: nullable — RPC uses `nullif(trim(coalesce(p_target_role, '')), '')`, i.e. an empty/whitespace input becomes real SQL `null`. The frontend's current three-way ternary checking `typeof === "string"` for both casings (api.ts:66-70) is more defensive than necessary once the snake_case alias is dropped, but the null-handling itself (nullable, not defaulted to `""`) is correct and should carry forward

---

## `start_insight_report`, `insight_report_runs` (list), `insight_report_run` (get)

Backend: `supabase/functions/_shared/platformOps.ts`. `insightReportRunSelect` (lines 738-752) is a
literal Postgres select against the `insight_report_runs` table — **snake_case-only**, same pattern
as the jobs tables above (this is a genuine mixed-casing domain: the *run metadata* is a DB table,
snake_case; the *report content* is LLM-generated, camelCase).

### `tenantId`, `initiatedByUserId`, `reportType`, `inputConfig`, `failureReason`, `llmProvider`, `llmModel`, `startedAt`, `completedAt`, `createdAt` (run level)
- **Accepted wire names**: `tenant_id`, `initiated_by_user_id`, `report_type`, `input_config`, `failure_reason`, `llm_provider`, `llm_model`, `started_at`, `completed_at`, `created_at`
- **Evidence**: `insightReportRunSelect` (platformOps.ts:738-752)
- **Null/absence handling**: `normalizeRunStatus` (reportApiMappers.ts:29-35) defaults any unrecognized `status` to `"failed"` — same **BANNED PATTERN** as the job-matching-run status field (conflates parse failure with a real failure state); `normalizeReportType` (reportApiMappers.ts:21-27) defaults unrecognized `report_type` to `"corpus_overview"` — **BANNED PATTERN**, silently changes which report the user thinks they're looking at
- **Retirement notes**: drop every camelCase alternate (`tenantId`, `initiatedByUserId`, `reportType`, `failureReason`, `llmProvider`, `llmModel`, `startedAt`, `completedAt`, `createdAt` — reportApiMappers.ts:72-82); strict `z.enum` for `status` and `report_type`, no defaults

### Top-level response shape: `{ run, report }`
- **Accepted wire names**: `run` (the `insightReportRunSelect` row) and `report` — **not** `report_payload`/`reportPayload` at this top level
- **Evidence**: `startInsightReportRun` returns `{ run: updateResult.data, report: generation.payload }` (platformOps.ts:1188); `getInsightReportRun` returns `{ run: runResult.data, report: run.report_payload ?? run.reportPayload ?? null }` (platformOps.ts:1233-1236) — note the backend *itself* still carries a `reportPayload` speculative alias internally at line 1235, worth flagging back if anyone is cleaning up the backend later, but not relevant to what the frontend receives (frontend only ever sees the resolved `report` key)
- **Null/absence handling**: `report` is `null` when the run hasn't completed yet — a real, intended nullable state, not a fallback to defend against
- **Retirement notes**: `mapRemoteInsightReportRunDetail`'s `record.report ?? record.report_payload ?? record.reportPayload` (reportApiMappers.ts:90) — only the first branch (`record.report`) is evidenced; drop the other two

### Report content: `executiveSummary`, `assistantPrompts`
- **Accepted wire names**: camelCase only — `executiveSummary`, `assistantPrompts`
- **Evidence**: LLM structured-output schema in `platformOps.ts` (`executiveSummary`/`assistantPrompts` both in the JSON-schema `required` list, lines ~761-819) — same pattern as job extraction, schema-enforced camelCase with `additionalProperties` constraints
- **Retirement notes**: drop `executive_summary`/`assistant_prompts` aliases (reportApiMappers.ts:53,64)

### `sections[].citations[].metricKey`
- **Accepted wire names**: camelCase only — `metricKey`
- **Evidence**: schema (`platformOps.ts:793-797`, `required: ["metricKey", "label", "value"]`) and every construction site (`platformOps.ts:927,932,946,965,970`) use `metricKey`
- **Retirement notes**: drop `metric_key` alias (reportApiMappers.ts:40)

---

## `json.ts` helpers this domain relies on

Both `frontend/src/features/jobs/apiMappers.ts` and `frontend/src/features/insights/api.ts` import
`asRecord`, `asArray`, `toStringArray`, `toNumber`, `nullableString` from `frontend/src/lib/api/json.ts`
(insights' `reportApiMappers.ts` also hand-rolls local copies of `asRecord`/`asArray`/`nullableString`
rather than importing them — same behavior, duplicated). Per the ticket, none of `json.ts` survives;
each usage needs an explicit per-field zod decision:

- **`asRecord`/`asArray`** silently coerce a non-object/non-array value to `{}`/`[]` instead of
  failing. For every *required* object/array field found above (which is most of them — job postings,
  matching runs, results, shortlists, applications, insight report runs are all effectively
  always-present rows), this hides a genuinely malformed response as an empty value. Only use the
  zod equivalent of "default to empty" where a field is truly optional-and-absent-means-empty (e.g.
  `matched_skills`/`missing_skills` arrays plausibly can be legitimately empty) — everywhere else,
  require the shape and let validation fail.
- **`toNumber(value, fallback=0)`** is the single riskiest helper in this domain: it's used for every
  match score (`semanticScore`/`aiScore`/`finalScore`/`rank`), every insights metric `value`, and
  every count field. A missing or malformed number silently becomes `0`, which for a match score is
  actively misleading (a candidate looks like a 0% match instead of "we couldn't parse this"). This is
  the **BANNED PATTERN** referenced repeatedly above and is the single highest-priority thing for the
  eventual adapters to eliminate — every numeric field needs `z.number()` (required) with parsing
  failing on absence/malformation, not `z.number().default(0)`.
- **`nullableString`** — the one helper here that's actually fine to keep the *behavior* of (not the
  function itself, which goes away) for genuinely nullable string columns; it correctly maps
  "absent/non-string" → `null` rather than inventing a default string.

---

## Banned patterns found (silent defaults / broad coercion — do not carry forward)

1. **Empty-string defaults on required string fields** — `String(record.x ?? record.y ?? "")` throughout
   `mapRemoteJobPosting`, `mapRemoteJobMatchingRun`, `mapRemoteJobCandidateMatch`, `mapRemoteJobShortlist`,
   `mapRemoteJobShortlistCandidate`, `mapRemoteJobApplication` — a missing required ID/timestamp/name
   silently becomes `""` instead of failing parsing.
2. **`toNumber(x, 0)` on match scores and counters** — `rank`, `semanticScore`, `aiScore`, `finalScore`,
   `requestedLimit`, `semanticPoolSize`, `rerankPoolSize`, `retrievedCount`, `filteredCount`,
   `rerankedCount`, `completedCount`, `savedRank`, `savedScore`, every insights `metrics[].value`/
   `deltaValue` — all silently become `0` on malformed/missing input. Highest-severity finding in this
   domain given match scores are directly shown to recruiters as ranking signal.
3. **Enum "safe default" normalizers** — `normalizeJobStatus` → `"draft"`, `normalizeEmployerRegion` →
   `"GCC"`, run `status` → `"failed"`, `seniorityAlignment` → `"Mismatch"`,
   `normalizeResumeIngestionStatus` → `"not_uploaded"`, `normalizeCandidateHubVisibility` → `"tenant"`,
   `normalizeJobApplicationStatus` → `"new"`, insight report `status` → `"failed"`, insight
   `reportType` → `"corpus_overview"` — every one of these conflates "value didn't parse" with a
   specific, meaningful business state, which is exactly the class of bug the ticket calls out by name
   (the known `role → "owner"` precedent).
4. **`publicApplyEnabled`/`applyEnabled` fail-open boolean default** — `=== false ? false : true`
   pattern silently opens public applications for a job posting whose flag failed to parse. Security/
   product-relevant, not just a display nicety.
5. **`consentGiven` fail-closed boolean default** — `Boolean(undefined)` silently records "no consent"
   for a missing value rather than failing; lower blast-radius than #4 but still a compliance-relevant
   field that shouldn't have implicit behavior.
6. **`warnings[].type` defaulting to `"WARNING"`** when the LLM schema already requires it — masks an
   upstream schema-validation failure as a fabricated warning entry.
7. **`mapPublicReceipt`'s bare-payload fallback** (`asRecord(payload).receipt ?? payload`) — the
   backend always wraps in `receipt`; the fallback path has no evidence and would silently accept a
   differently-shaped payload as if it were a valid receipt.
