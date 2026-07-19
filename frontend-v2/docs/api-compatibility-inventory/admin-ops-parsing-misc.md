# API compatibility inventory — admin, ops, parsing-lab, ask/agent, misc

Seeded from the remaining mapper functions in `frontend/src/lib/platformApi.ts` (everything
outside candidates/search/shortlist/jobs/insights), `frontend/src/lib/api/json.ts`,
`frontend/src/lib/contracts.ts`, and `frontend/src/lib/platformApiTypes.ts`. See ticket 05
checklist item "Create a durable compatibility inventory...".

Endpoint/operation names below match the `action` values in
`supabase/functions/platform/index.ts`'s switch statement, or the standalone function name for
`ask`/`agent`.

**Headline finding for this slice**: almost none of the snake_case fallback aliases in this
part of `platformApi.ts` are real. Every admin/provisioning/runtime-config endpoint here is
backed by hand-written TypeScript in `supabase/functions/_shared/*.ts` that already returns
camelCase JSON (built with object literals like `{ tenantId, iconUrl, ... }`), and every
ops/DB-row endpoint (`parser_profiles`, `ops_alerts`, `system_health`) is backed by a Postgres
function/table that only ever returns snake_case (Postgres never produces camelCase on its
own). There is no verified case in this slice of the *same* endpoint legitimately emitting both
casings — the dual-casing `??` chains look like defensive copy-paste, not evidence of real
backend drift. Treat every alias below marked "not found in current backend" as **not** a
candidate for the canonical adapter's accepted-variant list.

---

## `parsing_overview` (parsing-lab overview + per-document rows)

Backend: RPC `parsing_overview_page_v1` (current definition:
`supabase/migrations/20260504094000_parsing_overview_review_risk_v1.sql:325-383`), invoked from
`supabase/functions/platform/candidates.ts:114-134` (`getParsingOverview`, thin passthrough of
`data`). The RPC returns one `jsonb_build_object` with keys `overallParsedPercentage`,
`averageConfidence`, `documentsCount`, `completedCount`, `needsReviewCount`, `failedCount`,
`documentsWithWarnings`, `missingContactCount`, `lowCoverageCount`, `itemsTotalCount`,
`pageLimit`, `pageOffset`, `workspaceRollups` (array), `items` (array) — **all camelCase,
always present** (every summary field is `coalesce(...)`'d server-side to a number, never
absent).

Frontend: `frontend/src/lib/platformApi.ts:279-324` (`fetchParsingOverviewRpc`).

### Dead branch — legacy raw-row fallback
`fetchParsingOverviewRpc` (`platformApi.ts:295-323`) branches on `Array.isArray(payload.items)`:
if true, maps the new camelCase shape (see below); if false, calls
`buildParsingOverview(asArray(payload.documents), asArray(payload.candidates), ...)` — a
completely different code path that expects raw `source_documents`/`candidates`/
`candidate_profiles`/`processing_runs` DB rows (see `fetchParsingOverviewSnapshotRpc`,
`platformApi.ts:219-231`, and its use in `getParsingDocument`/`parsing_document` below, which
*does* still use that raw-row shape for a different action).
- **Evidence**: the current `parsing_overview_page_v1` RPC (migration `20260504094000`, the
  latest of three migrations touching this function — `20260503170500`, `20260503194500`,
  `20260504094000`) unconditionally returns an object with `items` as a JSON array (`coalesce(
  jsonb_agg(...), '[]'::jsonb)` — empty array, not absent, when there are no rows). The
  `payload.items` key is therefore **always** present and always an array for this action; the
  `buildParsingOverview(...)` fallback branch is unreachable against the current backend.
- **BANNED PATTERN**: this is exactly the "Function → RPC → cache" style multi-path branching
  gaps-and-recommendations.md Part 2 §3 calls out — one request should be one path. Do not carry
  the raw-row fallback branch forward for this action; if a per-document raw-row need still
  exists, it belongs under the separate `parsing_document` action below, not as a fallback here.

### Per-summary-item fields (`items[]`, mapped by `mapRemoteParsingSummary`, `platformApi.ts:233-266`)
All of these are plain camelCase reads with a `??` default — there is only one wire name per
field (no real alias), so these are **not multi-name aliases**, but several default a field the
backend already guarantees non-null or guarantees-with-its-own-default, which is a **redundant
defensive default masking a required field** rather than a legitimate optional/nullable case:

- `documentId`, `tenantId`, `candidateName`, `currentTitle`, `mimeType`, `status`, `qualityBand`, `parsedPercentage`, `extractionConfidence`, `rawTextLength`, `needsAttention` — SQL does **not** `coalesce()` these (lines 341-379 of the migration); if the underlying `quality_items` CTE ever produced null here it would currently be silently masked (`documentId` → `""`, `candidateName` → `"Unassigned candidate"`, `qualityBand` → forced to `"critical"` via the ternary at `platformApi.ts:252-256`). **BANNED PATTERN candidate** — these should become required fields in the canonical schema that fail parsing if absent, not defaulted.
- `sourceType`, `sourceUri`, `uploadedAt`, `parserVersion`, `modelVersion`, `promptVersion`, `embeddingVersion` — SQL *does* `coalesce()` these server-side already (e.g. `coalesce(source_type, 'upload')`, `coalesce(parser_version, 'unknown')`), so the frontend's matching `?? "upload"` / `?? "unknown"` defaults are inert double-coverage, not wrong, just redundant once a schema enforces "always present."
- `candidateId` — genuinely nullable (a document can have no linked candidate yet); frontend's `typeof row.candidateId === "string" ? row.candidateId : null` handling is correct as-is, carry forward as `z.string().nullable()`.
- `warnings`, `missingFields`, `keyFindings` — SQL always returns a `to_jsonb(...)` array (possibly empty), never absent; `toStringArray` degrading a non-array to `[]` is dead-code defensiveness for this endpoint specifically.

### `workspaceRollups[]` (`mapRemoteWorkspaceRollup`, `platformApi.ts:268-277`)
`tenantId`, `candidates`, `documents`, `averageParse`, `needsReview`, `failed` — all
camelCase-only, all server-`coalesce()`'d to 0/`''` in the RPC (lines 316-323, 337-349). No
alias, only redundant defensive defaulting. No retirement notes beyond "make required."

---

## `parsing_document` (single-document parsing detail)

Backend: `supabase/functions/platform/candidates.ts:164-249` (`getParsingDocument`) — this is a
**different** code path from `parsing_overview`: it does direct `.select()` reads against
`source_documents`, `candidates`, `candidate_profiles`, `processing_runs` and returns the **raw
snake_case DB rows** (`{ documents: [...], candidates: [...], profiles: [...], runs: [...] }`,
explicit column lists at lines 172, 195, 203, 210 — e.g. `original_filename`, `source_type`,
`current_title`, `years_experience`, `parser_version`, `error_message`).

Frontend: `fetchParsingDocumentSnapshot` (`platformApi.ts:334-348`) reads this shape as-is (typed
`ParsingSourceDocumentRow`/`ParsingCandidateRow`/etc. from `lib/api/platformRows.ts` — not
audited here, out of this slice's file list, but note its existence: a per-feature ticket
building this adapter needs those row types as the wire-schema starting point) and hands it to
`buildParsingDocumentDetail` in `frontend/src/lib/parsingQuality.ts` (also not in this slice —
that file contains the actual per-field transform/derivation logic and should be read directly
by whichever ticket owns this endpoint's adapter, since it's substantial derived-field logic,
not a simple alias chain).
- **Retirement note**: this endpoint and `parsing_overview` currently disagree on wire shape
  (one hand-built camelCase JSON via RPC, one raw snake_case table rows) for what is
  conceptually the same "parsing overview" feature. Worth flagging to backend as a candidate for
  unification later; not a frontend fix.

---

## `parser_profiles` / `save_parser_profile` / `publish_parser_profile`

Backend: `supabase/functions/platform/parserProfiles.ts`.
- `getParserProfiles` (lines 31-49): `.select(parserProfileSelect)` — explicit snake_case column
  list (`tenant_id`, `extraction_provider`, `extraction_model`, `parser_version`,
  `model_version`, `prompt_version`, `chunk_version`, `embedding_provider`, `embedding_model`,
  `embedding_version`, `chunking_profile`, `ocr_enabled`, `allow_heuristic_fallback`,
  `prompt_template`, `last_evaluated_at`, `avg_parse_percentage`, `avg_confidence`,
  `documents_evaluated`, `created_at`, `updated_at`) — **snake_case only, no camelCase variant
  ever returned.**
- `saveParserProfile`/`publishParserProfile` (lines 52-121) return the same
  `parserProfileSelect` shape (insert/update/RPC `.select()`), so identical wire shape across all
  three actions.

Frontend: `mapRemoteParserProfile` (`platformApi.ts:469-498`) reads `row.tenant_id`,
`row.extraction_provider`, etc. directly — **no alias chains at all**, single wire name per
field, matches backend exactly. Nothing to flag as speculative here.

### `<canonicalFieldName>` — `allowHeuristicFallback`
- **Accepted wire names**: none — the frontend **hardcodes `false`** (`platformApi.ts:488`)
  regardless of what `row.allow_heuristic_fallback` actually contains; the value is never read.
- **Evidence**: `frontend/src/lib/platformApi.ts:488`; backend column exists
  (`parserProfiles.ts:20`) and is always written as `false` on save too
  (`parserProfiles.ts:82`, hardcoded, ignoring `profile.allowHeuristicFallback` from the request
  body).
- **Required/nullable/optional**: effectively a constant, not real data, today.
- **Null/absence handling**: n/a.
- **Retirement notes**: this looks like an intentionally-disabled feature flag (kept as a column
  for future use) rather than a compatibility concern. The canonical schema can model it as
  `z.literal(false)` or simply omit it from the canonical type and note the constant business
  rule in a comment — but do **not** wire up `row.allow_heuristic_fallback` as if it were live
  data; that would silently diverge from today's product behavior.

- `description ?? ""`, `notes ?? ""` (`platformApi.ts:475,490`): legitimate — backend
  `parserProfileSelect` always returns these columns (never omitted from the select list), and
  they're genuinely nullable text columns; model as `z.string().nullable()` → decide in the
  canonical schema whether `null` or `""` is the canonical empty representation (spec says
  optional/nullable data should be modeled as such, not defaulted at parse time — the `?? ""`
  here is a presentation default that arguably belongs after parsing, not inside the adapter).

---

## `list_admin_tenants`

Backend: `supabase/functions/_shared/platformProvisioning.ts:93-154` (`listAdminTenants`).
Returns hand-built objects: `{ tenantId, slug, name, iconUrl, createdAt, membershipCount,
candidateCount, documentCount }` — **100% camelCase, always present** (every field is populated
from a `Map.get(...) ?? 0` or direct property access server-side; `iconUrl` is
`tenant.icon_url ?? ""` server-side already).

Frontend: `mapTenantAdminSummary` (`platformApi.ts:512-531`).

### `tenantId`, `iconUrl`, `createdAt`, `membershipCount`, `candidateCount`, `documentCount`
- **Accepted wire names** (as currently coded, precedence order): `tenantId ?? tenant_id`,
  `iconUrl ?? icon_url`, `createdAt ?? created_at`, `membershipCount ?? membership_count`,
  `candidateCount ?? candidate_count`, `documentCount ?? document_count`.
- **Evidence**: `frontend/src/lib/platformApi.ts:512-531` (frontend); backend
  (`platformProvisioning.ts:144-153`) confirms **only** the camelCase name is ever emitted — the
  snake_case half of every one of these pairs is **not found in current backend source**.
- **Required/nullable/optional**: all required and always-present per current backend.
- **Null/absence handling**: `createdAt` has real null-handling logic (`typeof === "string" ? ... : null`) even though backend always sends a string (`tenant.created_at` from a NOT NULL-ish column) — harmless over-caution, but not a real alias.
- **Retirement notes**: **speculative — do not carry the snake_case variants forward.** Canonical schema should accept only the camelCase wire names, marked required, and fail loud if a required one is missing rather than defaulting to `""`/`0`.

---

## `create_tenant_account` / `add_user_to_tenant`

Backend: `supabase/functions/_shared/platformProvisioning.ts:156-291`. Both return the identical
hand-built shape: `{ userId, email, tenantId, tenantName, tenantSlug, tenantIcon, role,
folderName }` — **100% camelCase, always present**, including `role` (always the
server-normalized, validated role string — `normalizeRole(body.role, "owner")` for
`create_tenant_account`, `normalizeRole(body.role, "recruiter")` for `add_user_to_tenant`).

Frontend: `mapAccountProvisionResult` (`platformApi.ts:569-581`), shared by both actions.

### `userId`, `tenantId`, `tenantName`, `tenantSlug`, `tenantIcon`, `folderName`
- **Accepted wire names**: each has a `camelCase ?? snake_case` pair, e.g. `userId ?? user_id`.
- **Evidence**: `platformApi.ts:571-579`; backend never emits the snake_case half for this
  endpoint (`platformProvisioning.ts:222-231`, `281-290`) — **speculative, not found in current
  backend.**
- **Retirement notes**: do not carry snake_case variants forward for this endpoint.

### `role` — **BANNED PATTERN, this is the ticket's own named example**
- **Current code**: `role: String(record.role ?? "owner")` (`platformApi.ts:578`), used for
  **both** `create_tenant_account` (whose own default really is `"owner"`, so this happens to be
  harmless there) **and** `add_user_to_tenant` (whose backend default is `"recruiter"`, not
  `"owner"` — see `platformProvisioning.ts:243`). If the `add_user_to_tenant` response ever
  omitted `role` (it doesn't today, but the frontend code doesn't know that), this shared mapper
  would silently grant the mapped user `"owner"`-level display/assumptions instead of
  `"recruiter"`. `role` is a **security-sensitive, privilege-bearing field** — issue
  `06-api-layer-isolation.md` and `gaps-and-recommendations.md` Part 0 rule 4 name this exact
  pattern ("today a missing `role` becomes `\"owner\"`") as the banned-pattern archetype.
- **Evidence**: backend always includes `role` in both responses (`platformProvisioning.ts:229`,
  `288`) — the field is genuinely always present today, so this is a **latent** bug, not
  currently triggered, but the canonical adapter must make `role` a required field with no
  default and let a missing/invalid value fail parsing rather than silently resolving to
  `"owner"`.
- **Retirement notes**: do not carry any default forward for `role` on this or any
  privilege-bearing field. Validate against the known enum (`owner | admin | recruiter |
  viewer`, per `MEMBERSHIP_ROLES` in `platformProvisioning.ts:5`) and fail loud otherwise.

---

## `get_platform_runtime_config` / `save_platform_runtime_config`

Backend: `supabase/functions/_shared/platformRuntimeSettings.ts:120-224`
(`buildPlatformRuntimeConfigView`, called directly by both actions — `save_...` calls it again
at the end to return the fresh view). Returns `{ settings: [{ key, value, source, envName }],
updatedAt }` — **100% camelCase, always present** (`settings` is always a full mapped array over
the fixed `RUNTIME_SETTING_KEYS` list, never partial or absent).

Frontend: `mapPlatformRuntimeConfig`, `mapRuntimeConfigSource` (`platformApi.ts:533-567`).

### `envName`, `updatedAt`
- **Accepted wire names**: `envName ?? env_name`; `updatedAt ?? updated_at`.
- **Evidence**: `platformApi.ts:548-553,561-565`; backend never emits `env_name`/`updated_at`
  camelCase-adjacent snake variants for this endpoint (`platformRuntimeSettings.ts:153-158,
  120-123`) — **speculative, not found in current backend.**
- **Retirement notes**: do not carry snake_case variants forward.

### `source` (`mapRuntimeConfigSource`, `platformApi.ts:533-537`)
- Enum-validates against `"database" | "environment" | "unset"`, defaulting anything else to
  `"unset"`. Backend's `SettingSource` type (`platformRuntimeSettings.ts:111`) only ever produces
  exactly those three values (`platformRuntimeSettings.ts:147-151`) — so this is a **correct,
  intentional enum-fallback pattern already**, not a bug: it's the one place in this slice where
  defaulting-on-invalid-enum is arguably fine because the value only ever means "unrecognized
  status, show neutral state," not a security or required-data concern. Still, per the ticket's
  "invalid enums/ranges fail" rule, the stricter reading is that this should fail parsing on an
  unrecognized value instead of coercing to `"unset"`, since the enum is fully known and closed.
  Flag as a judgment call for whoever builds this adapter, not a clear-cut carry-forward.

### `updatedAt` nullability
- Genuinely nullable — backend can return `null` if the settings table is empty
  (`platformRuntimeSettings.ts:134-137`). Frontend's null handling (`typeof === "string" ? ... :
  null`, implicitly null otherwise) is correct; model as `z.string().nullable()`.

---

## `workspace_stats`

Backend: `supabase/functions/_shared/platformOps.ts:161-173` (`getWorkspaceStats`) — RPC
`workspace_stats_v1`, returns `data[0]` or the literal fallback object `{ document_count: 0,
candidate_count: 0, company_count: 0 }` — **snake_case only, always present** (either from the
RPC row or the hardcoded fallback, both snake_case).

Frontend: `fetchWorkspaceStatsRpc` (`platformApi.ts:208-217`) — `toNumber(row.document_count)`,
`toNumber(row.candidate_count)`, `toNumber(row.company_count)`. **No alias chain** — single wire
name per field, matches backend exactly. `toNumber(..., fallback=0)` defaulting non-finite to 0
is broad numeric coercion the ticket wants replaced with a real required-number parse (backend
guarantees these are always numeric today, so this should be `z.number()` failing loud instead
of silently substituting 0 on e.g. a `null` or malformed value).

---

## `system_health`

Backend: `supabase/functions/_shared/platformOps.ts:417-...` (`getSystemHealth`) — composes RPC
`ops_health_snapshot_v1` (returns snake_case columns: `severity`, `component`, `tenant_id`,
`alert_key`, `message`, `current_value`, `threshold`, `first_seen_at`, `last_seen_at`,
`dedupe_key`, `runbook_url`, `context_json` — confirmed via
`supabase/migrations/20260503210000_ops_monitoring_v1.sql:280-298`) plus derived
latency/worker/event data, and hand-assembles a final response object (not fully traced field-by-
field in this pass — the function is long; whoever builds this adapter should read
`platformOps.ts:417-587` in full).

### BANNED PATTERN — no adapter at all
Frontend: `platformApi.ts:1242-1248`:
```ts
async getSystemHealth() {
  try {
    return await invokePlatform<SystemHealth>("system_health");
  } catch {
    return mock.getSystemHealth();
  }
},
```
This is a **blind generic-cast with zero runtime validation** — exactly the `invoke<T>()`
pattern `issue 06-api-layer-isolation.md` and `spec.md`'s API-transport section explicitly ban
("no generic `<T>` cast... Feature-owned compatibility adapters parse the payload"). There is no
`mapRemote*` function for this endpoint at all today. Also note: **no `tenant_ids` are ever
passed** to this call (compare to every other admin/ops call, which forwards `tenantIds`) — worth
flagging to whoever builds this feature ticket as a possible existing bug (system health always
queries all tenants regardless of the caller's scope), not something to silently replicate
without a decision.
- **Retirement notes**: this needs a real wire schema + adapter built from scratch when the
  ops/system-health screen is ported; there is no existing alias chain to preserve because there
  is no existing parsing at all.

---

## `ops_alerts` / `ops_ack_alert`

Backend: `supabase/functions/_shared/platformOps.ts:587-597` (`getOpsAlerts`, RPC
`ops_evaluate_alerts_v1`) and `:1264-1277` (`acknowledgeOpsAlert`, RPC `ops_ack_alert_v1`). Both
RPCs are typed `returns setof public.ops_alerts` / `returns public.ops_alerts`
(`supabase/migrations/20260503210000_ops_monitoring_v1.sql:639-786`) — i.e. they return the raw
`ops_alerts` table row shape: `dedupe_key, severity, component, tenant_id, alert_key, status,
message, current_value, threshold, runbook_url, context_json, first_seen_at, last_seen_at,
resolved_at, acknowledged_at, acknowledged_by` — **snake_case only, always**. Postgres table rows
returned via `returns setof <table>` can never produce a camelCase variant.

Frontend: `mapRemoteOpsAlert` (`platformApi.ts:583-620`).

### `dedupeKey`, `tenantId`, `alertKey`, `runbookUrl`, `firstSeenAt`, `lastSeenAt`
- **Accepted wire names** (as currently coded): each has `snake_case ?? camelCase` pairs, e.g.
  `record.dedupe_key ?? record.dedupeKey`.
- **Evidence**: `platformApi.ts:586,589-594,595,606-611,612-617`; backend confirms **only**
  snake_case is ever emitted (migration lines above) — the camelCase half of every pair is
  **speculative, not found in current backend.**
- **Required/nullable/optional**: `tenantId`/`runbookUrl` are genuinely nullable (platform-wide
  alerts have `tenant_id is null`; not every alert has a runbook) — frontend's null-vs-undefined
  handling there is correct, keep as `z.string().nullable()`.
- **Null/absence handling — `firstSeenAt`/`lastSeenAt`**: `String(record.first_seen_at ??
  record.firstSeenAt ?? new Date().toISOString())` — **BANNED PATTERN**: both columns are `not
  null default timezone('utc', now())` at the schema level
  (`ops_monitoring_v1.sql:16-17`), i.e. always present from Postgres. Defaulting to
  `new Date().toISOString()` (the *client's* current time) on a missing value silently
  fabricates a timestamp that never happened on the server, exactly the "malformed response →
  silently defaults instead of throwing" pattern Part 0 rule 4 bans. Should be required fields
  that fail parsing if ever absent.
- **`currentValue`/`threshold`**: `record.current_value === null || undefined ? null :
  toNumber(record.current_value, 0)` — genuinely nullable numeric columns
  (`current_value numeric`, `threshold numeric`, no NOT NULL in the migration for these two)
  correctly modeled as nullable; the inner `toNumber(..., 0)` fallback-on-non-numeric is still
  broad coercion that should fail loud instead, given the column is typed `numeric` server-side.
- **`context`**: `asRecord(record.context_json ?? record.context)` — backend only ever has
  `context_json` (migration line 20, `context_json jsonb`); `record.context` is **speculative,
  not found in current backend.**

---

## `ask` (standalone Edge Function, not a `platform` action)

Backend: `supabase/functions/ask/index.ts` — every response branch (guardrail-blocked,
empty-scope, success; lines 47-60, 113-127, 199-211) returns the identical snake_case shape:
`{ intent, facts, citations, context_blocks, extractive_answer, meta: { candidate_count, top_k,
answer_source, scope_source, resolved_candidate_ids } }` — **snake_case only, no camelCase
variant anywhere in this function**, and every field in every branch is always present (no
optional keys).

Frontend: `mapRemoteAsk` (`platformApi.ts:398-437`). No alias chains — every read is a single
snake_case wire name (`payload.intent`, `payload.context_blocks`,
`asRecord(payload.meta).candidate_count`, etc.), matching backend exactly. The `??` defaults
present (`payload.intent ?? "why_matched"`, `payload.extractive_answer ?? ""`, etc.) are
therefore all **redundant defensive defaults on always-present fields**, not real aliases — flag
for "make required, don't default" the same as the parsing-overview items above, not as
compatibility aliases to preserve.

- **`facts[].candidateId`/`candidateName`**: `record.candidate_id ?? record.candidateId`,
  `record.candidate_name ?? record.candidateName` — need verification against
  `supabase/functions/ask/helpers.ts` (`buildDeterministicFacts`, referenced at
  `ask/index.ts:162` but not read in this pass — **flag for whoever builds this adapter**: the
  facts-array shape is built in `helpers.ts`, not `index.ts`, and wasn't traced field-by-field
  here; verify there before assuming the camelCase half is dead, unlike the rest of this
  endpoint).

---

## `agent` (standalone Edge Function, not a `platform` action)

Backend: `supabase/functions/agent/index.ts` — every response branch (lines 59-71, 124-137,
142-154, 216-228, 299-309) returns `{ answer, citations, context_blocks, meta: {
candidate_count, top_k, answer_source, scope_source, resolved_candidate_ids } }`. **`answer` is
always present in every branch; `extractive_answer` is never emitted anywhere in this file.**

Frontend: `mapRemoteAgent` (`platformApi.ts:439-467`).

### `answer`
- **Current code**: `answer: String(payload.answer ?? payload.extractive_answer ?? "")`
  (`platformApi.ts:444`).
- **Evidence**: backend (`agent/index.ts`, all 5 response sites) never emits `extractive_answer`
  — that field name belongs to the *sibling* `ask` function's response shape, not `agent`'s. This
  reads as copy-paste from `mapRemoteAsk` rather than a real observed variant.
- **Retirement notes**: **speculative — `extractive_answer` fallback should not be carried
  forward** for the `agent` endpoint's canonical schema. `answer` should be modeled as required
  with no fallback name.
- The remaining `meta.*` fields in `mapRemoteAgent` are identical in shape and behavior to
  `mapRemoteAsk`'s `meta.*` handling above (same redundant-default pattern, not real aliases).

---

## `json.ts` helpers — what each silently does (none of this survives)

`frontend/src/lib/api/json.ts` (38 lines) is the generic coercion toolkit used throughout this
slice (and the candidates/search/jobs/insights slices, per other audits). Per
`issues/06-api-layer-isolation.md`, **none of it survives into `frontend-v2`** — replaced by
explicit per-field Zod parsing in each feature's wire schema.

- **`asRecord(value)`**: returns `value` cast as `JsonRecord` if it's a non-array object,
  otherwise returns `{}`. Silently converts `null`/`undefined`/non-object payloads into an empty
  object rather than failing — every downstream `record.x` read then silently becomes
  `undefined` instead of surfacing "the response wasn't shaped like I expected." This is the
  root enabler of most of the redundant-default patterns documented above.
- **`asArray(value)`**: returns `value` if it's an `Array`, else `[]`. Same silent-degrade
  pattern for arrays — a malformed non-array response becomes an invisible empty list instead of
  an error.
- **`toStringArray(value)`**: `asArray(value).map(item => String(item).trim()).filter(Boolean)`
  — coerces every array element to a string via `String(...)` (so `123` → `"123"`, `null` →
  `"null"` the *string*, `{}` → `"[object Object]"`) and silently drops empty/falsy results. Zero
  type safety; a wrong-shaped element becomes a garbage string rather than a parse failure.
- **`toNumber(value, fallback = 0)`**: `Number(value)`, and if not finite, returns `fallback`
  (default `0`). This is the single most common source of "malformed/missing numeric field
  silently becomes 0" across every endpoint audited in this slice (`workspace_stats`, ops
  `current_value`/`threshold`, parsing-overview counts, etc.).
- **`nullableString(value)`**: returns `value` if it's a non-empty-after-trim string, else `null`
  — not observed in use anywhere in this slice's audited functions, but exists as a general
  helper; same "degrade silently to null instead of failing" philosophy as the rest.
- **`errorMessage(error)`**: not parsing infrastructure — extracts a display string from a
  caught error (`Error.message`, else `JSON.stringify`, else `String(error)`). Per
  `issue 06-api-layer-isolation.md`, this one function is explicitly **not** superseded by the
  adapter/schema work; it's an error-display concern owned by
  `issues/07-error-handling-observability.md` instead. Note for whoever builds the error-mapping
  layer: every current usage of `errorMessage(...)` in `platformApi.ts` feeds a raw
  backend-or-JS error string directly into a thrown `Error`'s message
  (e.g. `platformApi.ts:644-646, 656-657`), which then risks reaching the UI verbatim —
  Part 0 rule 6 ("never show raw error text") applies to all of these call sites.

`frontend/src/lib/contracts.ts` (1122 lines) and `frontend/src/lib/platformApiTypes.ts` (151
lines): skimmed for this slice's domains (`WorkspaceStats`, `ManatalSyncStatus`,
`ParsingOverview`, `ParserProfile`, `AskResponse`, `AgentResponse`,
`PlatformRuntimeConfig(Source|Field)`, `SystemHealth`, `OpsAlert`, `TenantAdminSummary`,
`AccountProvisionResult`). Both files are pure `type`/`export type` declarations with **no
runtime validation or fallback logic** of their own — they describe the *already-mapped*
canonical shape the mapper functions above produce, not the wire shape, and contain no alias
information beyond what's already documented above from the mapper functions themselves.
`platformApiTypes.ts` specifically (the `PlatformApi` interface + a couple of options types) has
zero `??`/coercion expressions — confirmed via direct grep, no findings there.

---

## Banned patterns found (silent defaults / broad coercion — do not carry forward)

1. **`role` silently defaulting to `"owner"`** in `mapAccountProvisionResult`
   (`platformApi.ts:578`) — the ticket's own named example of a privilege-bearing silent default;
   shared by both `create_tenant_account` and `add_user_to_tenant`, where the latter's real
   default should be `"recruiter"`, not `"owner"`. See full writeup above.
2. **`getSystemHealth` has no adapter at all** — a blind `invokePlatform<SystemHealth>(...)`
   generic cast with zero runtime validation, the exact anti-pattern the transport ticket bans.
   Also silently omits `tenant_ids` from the request compared to every sibling admin/ops call —
   flag as a possible existing bug, not something to replicate unexamined.
3. **`parsing_overview`'s dead legacy-shape fallback branch** (`buildParsingOverview(...)` in
   `fetchParsingOverviewRpc`) — the current backend RPC always returns the new `items`-array
   shape; the raw-row fallback path is unreachable dead code masquerading as compatibility.
4. **`ops_alerts`' `firstSeenAt`/`lastSeenAt` defaulting to `new Date().toISOString()`** — both
   columns are `NOT NULL` at the schema level; defaulting to the *client's* current time on a
   hypothetically-missing value would fabricate a server timestamp that never happened.
5. **Widespread redundant `??` defaults on fields the current backend already guarantees
   present** (parsing-overview summary/rollup fields, `ask`/`agent` top-level fields,
   `workspace_stats` counts, ops `current_value`/`threshold`) — not security bugs individually,
   but all instances of the same anti-pattern Part 0 rule 4 targets: a required field should fail
   loud if the contract is ever violated, not silently substitute a default that hides the
   violation.
6. **Speculative camelCase/snake_case alias pairs with no backend evidence** — the large majority
   of dual-casing `??` chains in this slice (`list_admin_tenants`, `create_tenant_account`,
   `add_user_to_tenant`, `get_platform_runtime_config`, `ops_alerts`, `mapRemoteAgent`'s
   `extractive_answer` fallback). Every backend source file checked in this slice confirms these
   endpoints emit **exactly one** casing, never both — the "alias" is dead code, not
   evidence of real backend variation. Do not seed the canonical adapters' accepted-wire-name
   lists with these; if the backend is ever observed emitting the other casing in a captured real
   response, that would be new evidence requiring a fresh inventory entry, not something to
   pre-accept now.
7. **`toNumber(value, fallback)` and `String(value ?? default)` used as blanket coercion**
   throughout `json.ts` and every mapper in this slice — broad, type-unsafe coercion that turns
   malformed responses into plausible-looking-but-wrong data instead of a parse failure. This is
   the single biggest structural finding of the slice: it's not really 20 separate bugs, it's one
   toolkit (`json.ts`) applied uniformly, which is exactly why the ticket retires the whole file
   rather than patching call sites individually.
