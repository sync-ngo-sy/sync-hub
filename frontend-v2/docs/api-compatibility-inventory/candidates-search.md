# API compatibility inventory — candidates & search

Seeded from `frontend/src/features/candidates/apiMappers.ts`, `frontend/src/features/search/apiMappers.ts`,
and the candidate/search/compare/shortlist methods in `frontend/src/lib/platformApi.ts`. See ticket 05
checklist item "Create a durable compatibility inventory...". `ask`/`agent` mapping (`mapRemoteAsk`,
`mapRemoteAgent`) is candidate-ID-shaped but belongs to the chat/sync-ai feature, not candidates/search —
covered by the admin-ops-parsing-misc slice, not here. Job shortlists (`job_shortlists`/`job_shortlist`
platform actions, `mapRemoteJobShortlist`) are a different domain (a shortlist attached to a job posting)
from the candidate shortlist covered here (`shortlist_items` etc.) — covered by the jobs slice.

---

## `candidate_detail` — verified and repaired by ticket 09

Ticket 09 verified the durable profile contract against the worker producer and repaired the Edge Function
query before its adapter shipped. The canonical dossier deliberately reads identity, title, experience,
skills, education, projects, languages, certifications, and summary from the worker-owned `profile_json`;
it does not reproduce the old mapper's speculative reads from unselected dossier-row columns.
The post-implementation review also made the selected tenant IDs a fail-closed constraint on the dossier,
profile, evidence-chunk, and original-document queries; membership RLS remains the outer authorization
boundary, while the explicit filter enforces the user's current UI scope.

Before ticket 09, `getCandidateDetail` queried `candidate_dossier_v1` with:

```
.select("profile_json, timeline_json, skill_matrix_json, profile_attributes, raw_text, confidence, missing_fields, parse_warnings")
```

`profile_attributes` and `raw_text` are not columns on `candidate_dossier_v1`, so that request failed before
it could return any dossier. Ticket 09 removed both nonexistent columns and added an explicit 404 response
for a missing candidate. The successful `candidate` payload now contains `profile_json`,
`timeline_json`, `skill_matrix_json`, `confidence`, `missing_fields`, `parse_warnings`, `location`,
`summary_short`, and `long_summary`.

That result becomes `payload.candidate` (`supabase/functions/platform/index.ts`, `result.candidate`).
But `frontend/src/lib/platformApi.ts:741-751` (`getCandidate`) passes that same narrow object straight into
`mapRemoteCandidate(candidateRow, ...)` as `row`, and `mapRemoteCandidate`
(`frontend/src/features/candidates/apiMappers.ts:172-650`) reads `row.candidate_id`, `row.name`,
`row.location`, `row.top_skills`, `row.email`, `row.phone`, `row.source_uri`, `row.storage_path`,
`row.original_filename`, `row.mime_type`, `row.seniority`, `row.headline`, `row.current_title`,
`row.years_experience`, `row.primary_role`, `row.short_summary`, `row.long_summary`, `row.summary_short`,
`row.strengths`, `row.risks`, `row.recommended_roles`, `row.links` — **none of which are in the 8-column
select list above.**

Those columns do exist on `candidate_dossier_v1` (confirmed: `supabase/functions/compare/index.ts:49-51`
selects `tenant_id, candidate_id, name, current_title, years_experience, seniority, top_skills,
short_summary, long_summary, strengths, risks, recommended_roles` from the same view successfully, and the
frontend's own `CandidateDossierRow` type in `frontend/src/lib/api/platformRows.ts:15-55` declares them).
The `candidate_detail` action's select statement is simply narrower than what its own consumer needs.
`row.metadata` (used at `apiMappers.ts:193-199`) is not selected either, so `asRecord(row.metadata)` is
always `{}`.

Also, `payload.candidate ?? payload.dossier` at `platformApi.ts:741-743`: the backend response only ever
has a `candidate` key (`index.ts:145`), never `dossier` — the `?? payload.dossier` half is speculative/dead.

Separately, the backend _does_ build a rich, already-snake_case-normalized `profile` object
(`index.ts:149-186`: `job_readiness_level`, `preferred_work_mode`, `years_of_experience`, `primary_skills`,
`notice_period`, `english_proficiency`, `expected_salary`, `is_pre_screened`, `sync_affiliation`,
`internal_vetting_notes`, `current_location_city`, `willingness_to_relocate`, `external_profiles`,
`ai_profile_summary`, `employment_type_preference`, `last_interaction_date`, `status`) — but
`mapRemoteCandidate` never reads `payload.profile` at all. It only reads a locally-built `profile` variable
merged from `row.profile_json` + `row.profile_attributes` + `row.metadata` (JSONB blobs on the dossier row,
not the backend's normalized object). **This backend-normalized `profile` object appears to be dead wire
data today** — flag this to the backend/product owner rather than silently wiring it in or silently
dropping it; the new adapter should decide deliberately which of the two `profile` shapes (backend's
normalized object vs. the dossier row's raw JSONB) is canonical, not silently keep both like today.

The producer contract is verified at `worker/src/cv_intelligence_worker/schema.py` (`CandidateProfile`) and
`worker/src/cv_intelligence_worker/integrations/supabase/rows.py` (`profile_payload` and `timeline_json`).
It emits snake_case only. The ticket-09 fixture mirrors that producer and the repaired Edge response.

---

## `search` — `POST /functions/v1/search` (direct function invoke, not a `platform` action)

**Ticket-10 verification:** the v2 adapter accepts only the exact snake_case contract documented below,
including both verified result-meta shapes (fast search and RPC search), and maps it to a strict canonical
camelCase schema before React Query caching. Fixture tests reject speculative camelCase result fields. The
request adapter sends the URL-backed query, skill/location/seniority/company filters, pagination offset,
and tenant scope to this direct function.

Backend: `supabase/functions/search/index.ts`, row shape built by
`supabase/functions/_shared/searchScoring.ts` (`mapFastProfileResult` for the fast path,
`search_candidates_with_rate_v1` / `search_candidates_v1` RPC for the embedding path — confirmed identical
column set in `supabase/migrations/20260501010000_search_match_rate_v1.sql:65-82`: `tenant_id,
candidate_id, name, current_title, location, years_experience, seniority, primary_role, score, score_raw,
match_rate, subscores, matched_filters, summary_short, evidence, meta`), then every row passes through
`attachMatchRates()` (`_shared/searchScoring.ts:242-260`) before being returned.

Frontend mapper: `mapRemoteSearch` (`frontend/src/features/search/apiMappers.ts:143-193`).

### `results[].candidateId`, `.name`, `.currentTitle`, `.location`, `.yearsExperience`, `.seniority`, `.primaryRole`, `.shortSummary`/`.matchNarrative` (from `summary_short`)

- **Accepted wire names**: single wire name each — `candidate_id`, `name`, `current_title`, `location`,
  `years_experience`, `seniority`, `primary_role`, `summary_short`. No camelCase variants are read by the
  mapper for these fields.
- **Evidence**: backend confirmed at `_shared/searchScoring.ts:739-761` (fast path) and
  `20260501010000_search_match_rate_v1.sql:65-82` (RPC path) — both emit identical snake_case names.
- **Required/nullable/optional**: `candidate_id`, `name` effectively required (backend always sets a
  fallback string like `"Unknown candidate"` server-side, per `searchScoring.ts:741`). Others always present
  with server-side defaults (`"Candidate"`, `"Unknown"`, `0`, `"unknown"`, `"generalist"`, `""`).
- **Null/absence handling**: not applicable — backend guarantees presence via `?? default` on its own side
  before ever serializing (`_shared/searchScoring.ts:741-746`).
- **Retirement notes**: none — this is the canonical, currently-correct shape.

### `results[].matchScore` / `.backendMatchRate` (from `match_rate`)

- **Accepted wire names**: `match_rate` only, via `backendMatchRate()` helper
  (`apiMappers.ts:135-141`), which falls back to a client-side `calibrateBackendMatchRate`/
  `normalizeBackendMatchScore` recompute if `match_rate` is missing/non-finite.
- **Evidence**: `_shared/searchScoring.ts:242-260` (`attachMatchRates`) guarantees `match_rate` is _always_
  present and valid (0-100) on every result row, for both search paths, before the HTTP response is built.
  **The client-side recompute fallback is dead code under the current backend** — not a real alias, just
  defensive duplication of business logic that now lives server-side. Recommend the new adapter treat
  `match_rate` as a required field and drop the client-side recalibration entirely (or keep it only as an
  explicit last-resort, documented as unreachable under current backend behavior, not modeled as an accepted
  wire variant).
- **Required/nullable/optional**: required, integer 0-100.
- **Retirement notes**: drop the recompute fallback logic when this feature is rebuilt.

### `results[].backendScoreRaw` (from `score_raw ?? score`)

- **Accepted wire names**: `score_raw` (precedence), `score` (fallback).
- **Evidence**: both fields are always present post-`attachMatchRates` (`searchScoring.ts:253-257` sets both
  unconditionally). The `?? score` fallback is redundant/defensive, not a real legacy-shape alias — backend
  never omits `score_raw`.
- **Retirement notes**: safe to require `score_raw` only in the canonical schema.

### `results[].topSkills` (from `matched_filters.matched_skills`)

- **Accepted wire name**: `matched_filters.matched_skills` only.
- **Evidence**: backend field `matched_filters: { required_skills, matched_skills, required_companies,
matched_companies, role, seniority, min_years_experience, location }` — confirmed
  `_shared/searchScoring.ts:751-760`.
- **Required/nullable/optional**: `matched_filters` always present (object), `matched_skills` always an
  array (possibly empty).

### `results[].matchSignals.{semantic,skill,experience}` (from `subscores.*`)

- **Accepted wire names**: `subscores.semantic_similarity`, `subscores.skill_match`,
  `subscores.experience_match` — single names, confirmed present in both search paths
  (`searchScoring.ts:716-737`, migration `20260501010000...sql:82` `subscores jsonb`).

### `meta.rankVersion` (from `meta.rank_version ?? "v2-rate"`) and `meta.intentSource` (from `meta.intent_source`)

- **Accepted wire names**: `rank_version`, `intent_source` — single names.
- **Evidence**: both branches of `search/index.ts` (lines 184-196 and 261-270) always include
  `rank_version` and `intent_source` in `meta`. The `?? "v2-rate"` default in the frontend mapper is
  defensive-only; the field is never actually absent from the current backend.
- **Retirement notes**: safe to model `rankVersion` as required, not defaulted, once verified against a live
  payload.

### `meta.count`

- **Meaning**: count of results in the current response page, not the total number of matching candidates.
- **Evidence**: both response branches set `count: results.length` after applying `limit` and `offset`.
- **Canonical name**: the v2 adapter maps this to `meta.pageCount`; pagination uses `next_cursor` and never
  presents this value as a result-set total.

### `meta.intent` (from `meta.intent`, mapped via `mapSearchIntentFilters`)

- **Accepted wire names**: `intent.role`, `intent.seniority`, `intent.min_years_experience`,
  `intent.location`, `intent.skills`, `intent.companies` — all single snake_case names, confirmed present in
  `search/index.ts:187-188/265` (`intent: filters`, where `filters` is `resolveSearchFilters(...)`'s
  output — snake_case per its call site at `search/index.ts:142-154`).

### `nextCursor` (from `next_cursor`)

- **Accepted wire name**: `next_cursor` only, typed `number | null`. Confirmed
  `search/index.ts:183/260`.

**No genuinely conflicting or legacy-named aliases were found in `mapRemoteSearch` — the search endpoint's
wire shape is uniformly snake_case and single-sourced.** The only "aliasing" present is defensive fallback
code for fields the backend always supplies.

---

## `search-debug` — `POST /functions/v1/search-debug`

Not independently traced to backend source in this pass (no `supabase/functions/search-debug/index.ts`
content reviewed beyond confirming its existence) — flag as **needs a dedicated read-through** when the
search feature ticket is built. Frontend mapper `mapRemoteSearchDebug`
(`apiMappers.ts:195-272`) reuses the same field-access pattern as `mapRemoteSearch` for its `results[]`
(no aliasing observed there either), plus additional `request`/`analysis` sections
(`request.explicit_filters`, `analysis.llm_intent`, `analysis.resolved_intent`,
`analysis.embedding.{provider,version,dimensions,preview}`, `analysis.rpc_payload`,
`analysis.uses_lexical/uses_semantic/uses_name_boost/strict_filters`) — all single snake_case wire names,
no `??` aliasing present in the mapper. Treat as provisionally clean pending a direct read of
`supabase/functions/search-debug/helpers.ts` and `index.ts`.

---

## `search` filter options — platform action `search_filter_options`

**Ticket-10 verification:** the v2 adapter requires the exact four-array response documented below. Its
scope-keyed query calls the platform action directly; no static values or alternate wire names are accepted
by the adapter.

Backend: `supabase/functions/_shared/platformOps.ts:105-156` (`getSearchFilterOptions`), invoked via the
`platform` aggregator (`supabase/functions/platform/index.ts:93-97`).

### `skills`, `companies`, `seniority`, `locations`

- **Accepted wire names**: single names (`skills`, `companies`, `seniority`, `locations`), each `string[]`.
- **Evidence**: `_shared/platformOps.ts:132-156` returns exactly this shape; frontend
  `fetchSearchFacetRows` (`platformApi.ts:163-205`) reads `payload.skills`, `payload.companies`,
  `payload.seniority`, `payload.locations` directly — no aliasing.
- **Retirement notes**: none needed; already clean. Note `createFallbackSearchFilterOptions()`
  (`search/apiMappers.ts:274-291`) is a **product-level presentational fallback** (hardcoded seniority
  list + a static skill table) applied only when the backend returns empty arrays — this is legitimate
  post-parse UI fallback per the spec's allowance, not a wire alias, and should stay in presentation code,
  not the adapter.

---

## `candidates` — platform action `candidates_list`

Backend: `supabase/functions/platform/candidates.ts:136-162` (`getCandidatesList`) calls RPC
`candidates_list_page_v1`, defined in
`supabase/migrations/20260605120000_candidates_list_page_v1.sql:193-243`.

**The RPC's JSON output is already fully camelCase** — `items[].{tenantId, candidateId, name, email,
location, primaryRole, appliedRole, stage, stageKey, source, seniority, updatedAt, groupKey, groupLabel}`,
and top-level `{items, itemsTotalCount, pageLimit, pageOffset, groupBy, groups: [{key, label, count}],
filterOptions: {statuses, roles, sources, locations}}` (migration lines 193-243).

### Every field in `mapRemoteCandidateListItem` (`frontend/src/features/candidates/apiMappers.ts:652-684`) and `mapRemoteCandidateListResponse` (`apiMappers.ts:686-723`)

- **Canonical fields**: `tenantId`, `candidateId`, `name`, `email`, `location`, `primaryRole`, `appliedRole`,
  `stage`, `stageKey`, `source`, `seniority`, `updatedAt`, `groupKey`, `groupLabel` (items); `items`,
  `itemsTotalCount`, `pageLimit`, `pageOffset`, `groupBy`, `groups`, `filterOptions` (response).
- **Accepted wire names in the current frontend mapper**: each field checks camelCase _or_ a snake_case
  fallback, e.g. `row.tenantId ?? row.tenant_id`, `row.candidateId ?? row.candidate_id`, `row.primaryRole ??
row.primary_role ?? row.current_title`, `row.appliedRole` / `row.applied_role`, `row.stageKey ??
row.stage_key ?? row.stage`, `row.updatedAt ?? row.updated_at`, `row.groupKey ?? row.group_key`,
  `row.groupLabel ?? row.group_label`; and at the response level `payload.groupBy ?? payload.group_by`,
  `payload.filterOptions ?? payload.filter_options`, `payload.items ?? payload.data ?? payload.rows`,
  `payload.itemsTotalCount ?? payload.items_total_count ?? payload.total`, `payload.pageLimit ??
payload.page_limit`, `payload.pageOffset ?? payload.page_offset`.
- **Evidence**: the RPC (migration source, ground truth for this endpoint) **only ever emits the camelCase
  form**. None of the snake_case variants (`tenant_id`, `candidate_id`, `primary_role`, `applied_role`,
  `stage_key`, `updated_at`, `group_key`, `group_label`, `group_by`, `filter_options`, `data`, `rows`,
  `total`, `page_limit`, `page_offset`) appear anywhere in `candidates_list_page_v1`'s `jsonb_build_object`
  calls. **These are all speculative/dead aliases** — flag as such, do not carry forward as verified.
  Exception: `row.primaryRole ?? row.primary_role ?? row.current_title` — `current_title` isn't emitted by
  this RPC either, also speculative here (it's a real field on other endpoints, just not this one).
- **Required/nullable/optional**: per the SQL, `items[]` fields are all present (backend coalesces empty
  strings/nulls itself, e.g. `coalesce(nullif(trim(...)), 'Unnamed candidate')`); `appliedRole`/`groupKey`/
  `groupLabel` are nullable (`nullif(...)`, or `null` when no `group_by`).
- **Retirement notes**: this is a strong candidate for **deleting all snake_case aliases outright** in the
  new adapter — a single fixture-based test against this migration's actual shape should be sufficient
  confirmation before doing so.

---

## `candidates` — platform action `candidate_detail`

See the ⚠️ top finding above for the major structural gap. Additional specific aliases within
`mapRemoteCandidate` (`apiMappers.ts:172-650`), scoped to the merged `profile` object
(`{...asRecord(row.profile_json), ...asRecord(row.profile_attributes), ...asRecord(row.metadata)}` —
**note `row.metadata` is confirmed always empty**, see top finding):

**Ticket-09 verification:** the current worker persists one strict snake_case `profile_json` shape. The v2
adapter accepts that shape only. The old mapper's camelCase and legacy-title aliases are speculative and are
rejected by fixture tests. `profile.years_of_experience` is a second, backend-verified enriched column; when
it is non-null and conflicts with `profile_json.years_experience`, parsing fails.

| Canonical field                                                    | Accepted wire names (precedence)                                                                                                                        | Notes                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `currentTitle`                                                     | `profile_json.current_title` only                                                                                                                       | Worker-verified; camelCase/`job_title`/`title` aliases are rejected                                                                                                                                                      |
| `headline`                                                         | `profile.headline`, `profile.summary`, `profile.short_summary`, `profile.current_title`, `row.headline`/`row.short_summary`/`row.summary_short` (dead)  | default `"Candidate"`                                                                                                                                                                                                    |
| `yearsExperience`                                                  | `profile_json.years_experience`; verified cross-check `profile.years_of_experience`                                                                     | Both are exact numbers; conflict fails; no default/coercion                                                                                                                                                              |
| `yearsOfExperience` (separate canonical field, duplicate of above) | `profile.years_of_experience`, `profile.yearsExperience`, `row.years_experience` (dead)                                                                 | note: two canonical fields (`yearsExperience` and `yearsOfExperience`) exist side by side in `CandidateDetail` today for what looks like the same concept — flag to the ticket that owns this schema, may be collapsible |
| `seniority`                                                        | `row.seniority` (dead), `profile.seniority`, `profile.level`, `profile.experience_level`                                                                | passed through `normalizeSeniority()` (buckets to Senior/Mid/Junior/Professional) — this bucketing is presentation logic, not wire parsing                                                                               |
| `topSkills`/`primarySkills`                                        | `profile.skills`, `profile.primary_skills`, `profile.technical_skills`, `profile.core_skills`, `profile.skill_matrix`, fallback `row.top_skills` (dead) | `primarySkills` separately tries `profile.primary_skills ?? profile.primarySkills ?? profile.skills`                                                                                                                     |
| `employmentTypePreference`                                         | `profile.employment_type_preference`, `profile.employmentTypePreference`                                                                                |                                                                                                                                                                                                                          |
| `externalLinks`/`externalProfiles`                                 | `row.external_links` (dead), `profile.external_links`, `profile.externalLinks`                                                                          | then parsed into linkedin/github/portfolio by URL hostname matching (presentation logic)                                                                                                                                 |
| `englishProficiency`                                               | `profile.english_proficiency`, `profile.english`, `profile.language_level`                                                                              |                                                                                                                                                                                                                          |
| `currentLocationCity`                                              | `profile.current_location_city`, `profile.currentLocationCity`, `profile.location_city`, `profile.city`, fallback `row.location` (dead)                 |                                                                                                                                                                                                                          |
| `lastInteractionDate`                                              | `profile.last_interaction_date`, `profile.lastInteractionDate`                                                                                          |                                                                                                                                                                                                                          |
| `aiProfileSummary`                                                 | `profile.ai_profile_summary`, `profile.aiProfileSummary`                                                                                                |                                                                                                                                                                                                                          |
| `certifications`                                                   | `profile.certifications`, `profile.certificates`, `profile.licenses`                                                                                    |                                                                                                                                                                                                                          |
| `languages`                                                        | `profile.languages`, `profile.language`                                                                                                                 |                                                                                                                                                                                                                          |
| `expectedSalary`                                                   | `profile.expected_salary.amount`, `.currency` (default `"USD"`)                                                                                         |                                                                                                                                                                                                                          |
| `matchScore`/`backendMatchRate`/`backendScoreRaw`                  | `rowMeta.match_score ?? rowMeta.match_rate ?? rowMeta.score_raw ?? profile.match_score`                                                                 | **`rowMeta` is cast from `row` (the same under-selected dossier row, see top finding) — these fields are not in the 8-column select list either, likely always `undefined` today**                                       |

### BANNED PATTERN found: `role_tags` — no default-injection bug found, but flag `stage: "Indexed"` and `matchSignals.semantic: 0` as hardcoded, not wire-derived

- `apiMappers.ts:470` hardcodes `stage: "Indexed"` unconditionally (not a parsing default — always this
  literal, regardless of response). `apiMappers.ts:443` hardcodes `matchSignals.semantic: 0` unconditionally
  for candidate-detail views (search results _do_ get a real `semantic` value from `subscores`, but
  candidate-detail never has subscores available, so this is a structural "not applicable here" value, not
  a defaulted-away-a-real-value bug). Neither is the `role → "owner"` class of bug, but both should be
  modeled explicitly as constants in the canonical schema/presentation layer, not disguised as parsed wire
  data.
- The specific **missing-`role`-becomes-`"owner"`** bug (from ticket 05's own example text) was **not found
  in this candidates/search slice** — it's in `auth`/membership-role handling, out of this slice's scope
  (handled directly for the auth feature, not by a fork).

---

## `candidates` — platform actions `shortlist_items`, `save_shortlist_item`, `delete_shortlist_item`, `clear_shortlist_items`

Backend: `supabase/functions/platform/shortlist.ts`. `shortlistSelect` (lines 11-30) and the `saveShortlistItem`
upsert payload (lines 91-111) both use a single, consistent snake_case field set: `user_id`, `tenant_id`,
`candidate_id`, `candidate_name`, `current_title`, `location`, `years_experience`, `seniority`,
`primary_role`, `top_skills`, `match_rate`, `cv_url`, `original_filename`, `source_query`,
`search_snapshot`, `notes`, `created_at`, `updated_at`.

**Ticket-11 implementation contract:** the v2 adapter accepts only that exact snake_case item shape for
both the list and save responses. It preserves the database-nullable fields (`years_experience`,
`seniority`, `primary_role`, `match_rate`, `cv_url`, `original_filename`) as `null`, accepts PostgreSQL
timestamp offsets, and rejects missing fields, wrong scalar types, extra/speculative camelCase keys, and
malformed `{ ok: true }` mutation acknowledgements. Request encoders emit `tenant_ids` for read/clear,
an exact snake_case `item` for save, and `tenant_id` + `candidate_id` for delete. Raw fixture tests cover
the item/list/acknowledgement shapes and their rejection cases before any value reaches React Query.

### All fields in `mapRemoteShortlistItem` (`search/apiMappers.ts:14-35`)

- **Accepted wire names**: single snake_case name per field, exact match to `shortlistSelect` — **no
  aliasing at all**. Confirmed clean 1:1 mapping.
- **Required/nullable/optional**: matches DB nullability as returned; mapper applies UI-only defaults
  (`?? "Unknown candidate"`, `?? "Candidate"`, `?? "Unknown"`, `?? ""`) for a few fields — these are
  legitimate presentation-layer defaults for genuinely-nullable columns, not alias resolution.
- **Retirement notes**: none — already the target shape, this mapper can become a near-identical Zod
  wire schema with minimal changes.

---

## `compare` — `POST /functions/v1/compare`

Backend: `supabase/functions/compare/index.ts`.

### Response shape is a **confirmed real dual-shape**, not speculative

- **Cached path** (lines 38-45): `{ source: "cached_artifact", artifact_key, artifact_version, comparison:
<comparison_json column> }` — the comparison data is **nested under `comparison`**.
- **Fresh-compute path** (lines 103-111): `{ source: "deterministic_fallback", overlap,
recommended_candidate_id, items: [...], meta: { compared_count } }` — **flat, top-level**.
- The frontend's `mapRemoteComparison` (`platformApi.ts:350-396`) handling —
  `nested = asRecord(payload.comparison); normalized = Object.keys(nested).length ? nested : payload;` —
  is a **legitimate, backend-verified encoding of this real dual shape**, not a speculative alias. Keep this
  pattern in the new adapter (as an explicit Zod union/discriminated-by-presence check on `comparison`, or by
  checking `source === "cached_artifact"`).

### Cached `comparison_json` — verified (ticket 12), and it is **not** the fresh-compute shape

The open question above is now closed. `comparison_artifacts.comparison_json` is written by the worker
(`worker/src/cv_intelligence_worker/supabase.py:589-599`) as `dataclass_to_dict(ComparisonArtifact)`
(`worker/src/cv_intelligence_worker/schema.py:144-162`, built in `artifacts.py:55-95`):

```
{ tenant_id, candidate_ids: [...], overall_summary, items: [{ candidate_id, score, matched_skills,
  gaps, evidence_refs }], overlap, recommended_candidate_id, evidence_refs, artifact_version }
```

Differences from the fresh-compute shape that matter to the frontend:

- **Artifact items carry no dossier detail** — no `tenant_id`, `name`, `current_title`,
  `years_experience`, `seniority`, `strengths`, `risks`, or `summary`; only scoring fields plus
  `evidence_refs`. The old `mapRemoteComparison` papered over this with `String(record.name ?? "Unknown
  candidate")` etc., i.e. it rendered invented values for a whole cached comparison. The v2 canonical model
  makes this explicit instead: `comparisonItemSchema.detail` is `null` on the cached path.
- **`overall_summary` and `evidence_refs` exist only on the artifact**; `meta.compared_count` only on the
  fresh path.
- **`recommended_candidate_id` is `""`**, not `null`, when the artifact has no ranked candidate
  (`artifacts.py:93`) — the adapter maps empty string to `null`.

Both variants have raw fixture tests in `src/features/compare/api/compareApi.test.ts`
(`src/test/fixtures/compare.ts`), including the source/body-shape conflict cases.

### `source` (top-level)

- **Accepted wire names**: `source` (top-level) or `normalized.source` — confirmed the backend always puts
  `source` at the top level in both paths (line 40, line 104); the `normalized.source` fallback path is for
  the (unverified) cached-artifact-nested case and is plausible but not directly confirmed.

### `recommendedCandidateId`

- **Accepted wire names**: `recommended_candidate_id` only. **`recommendedCandidateId` (camelCase) is
  confirmed speculative** — never emitted (`index.ts:106`).

### `items[].candidateId`, `.currentTitle`, `.yearsExperience`, `.matchedSkills`

- **Accepted wire names**: `candidate_id`, `current_title`, `years_experience`, `matched_skills` only
  (`index.ts:84-98`). **All camelCase variants (`candidateId`, `currentTitle`, `yearsExperience`,
  `matchedSkills`) read by `mapRemoteComparison` (`platformApi.ts:369-380`) are confirmed speculative/dead.**

### `meta.comparedCount`

- **Accepted wire names**: `meta.compared_count` only (`index.ts:109`). `meta.comparedCount` (camelCase)
  is confirmed speculative.

### Fields with no aliasing (already clean, single wire name)

`tenant_id`, `name`, `seniority`, `score`, `gaps`, `strengths`, `risks`, `summary` (`summary` itself has a
real, backend-confirmed alias: `row.short_summary ?? row.long_summary ?? ""`, `index.ts:98` — genuine
dual-source, not speculative).

**Retirement notes**: every camelCase variant in `mapRemoteComparison` can be deleted outright — the backend
has never emitted them (confirmed from current source, not just "not found").

---

## `lib/api/json.ts` helper audit (usage in this slice)

- **`asRecord(value)`** — used pervasively to coerce `unknown` → `Record<string, unknown>` with a `{}`
  fallback for non-objects. Every call site in this slice should become an explicit Zod object schema (or
  `z.record()` only where the shape is genuinely free-form, e.g. `search_snapshot`, `profile_json`).
- **`asArray(value)`** — coerces to `[]` on non-array. Replace with `z.array(...)` per field; a genuinely
  optional/nullable array should be modeled as such, not silently emptied.
- **`toStringArray(value)`** — maps + trims + filters. Replace with `z.array(z.string())` plus an explicit
  `.transform()` for trim/filter semantics if that behavior is still wanted (verify against product intent —
  today this also silently drops non-string array entries).
- **`toNumber(value, fallback = 0)`** — the highest-risk helper: any non-finite value (including `undefined`,
  `NaN`, objects, `null`) silently becomes `0` (or the given fallback) with no way to distinguish
  "genuinely zero" from "missing/malformed." This is the general form of the banned defaulting pattern —
  every use of `toNumber` on a field that should be _required_ (e.g. `yearsExperience`, `matchRate` in
  places where the backend guarantees presence) must become `z.number()` (fails loud), not
  `z.number().catch(0)` or similar.
- **`nullableString`** — not used in this slice's reviewed files (candidates/search); no findings.
- **`errorMessage`** — out of scope, superseded by the error-handling ticket per the ticket-05 reference doc.

---

## Banned patterns found (silent defaults / broad coercion — do not carry forward)

1. **`candidate_detail`'s under-selected dossier row** (see ⚠️ top finding) — not a silent default so much
   as silent `undefined`-propagation into `String(undefined ?? ...)` chains; the practical effect is the
   same class of bug (malformed/missing data rendered as if valid). Highest-priority item in this file.
2. **`row.metadata` always empty** — `getCandidateDetail`'s select never includes `metadata`, so
   `asRecord(row.metadata)` in `mapRemoteCandidate` (`apiMappers.ts:198`) is always `{}`. Dead code, not a
   real merge source.
3. **`payload.dossier` fallback in `getCandidate`** (`platformApi.ts:742`) — backend never sends `dossier`,
   only `candidate`. Speculative, drop it.
4. **Blanket `toNumber(..., 0)` on fields that should be required** — see json.ts audit above; this is the
   generalized form of the `role → "owner"` pattern ticket 05 calls out, applied to numeric fields throughout
   this slice (`yearsExperience`, `matchScore` inputs, etc.).
5. **Client-side match-rate recompute in `backendMatchRate()`** (`search/apiMappers.ts:135-141`) is dead
   code under the current backend (see `search` section above) — not unsafe, but duplicate, unreachable
   business logic that should not be ported forward as "handling a wire variant."
6. **All camelCase aliases in `mapRemoteComparison`** (`recommendedCandidateId`, `candidateId`,
   `currentTitle`, `yearsExperience`, `matchedSkills`, `comparedCount`) — confirmed speculative against
   current backend source, not real accepted variants.
7. **All snake_case aliases in `mapRemoteCandidateListItem`/`mapRemoteCandidateListResponse`** — confirmed
   speculative; the RPC backing `candidates_list` only ever emits camelCase.

The known **missing-`role`-becomes-`"owner"`** example bug from the ticket text was searched for in this
slice's files and **not found here** — it lives in auth/membership-role handling, outside this slice.
