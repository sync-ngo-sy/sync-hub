import { hueFromId, mapDebugEvidenceSnippet } from "@/features/candidates/apiMappers";
import type {
  CandidateShortlistInput,
  CandidateShortlistItem,
  SearchDebugResponse,
  SearchFilterOptions,
  SearchFilters,
  SearchResponse,
} from "@/lib/contracts";
import { asArray, asRecord, toNumber, toStringArray, type JsonRecord } from "@/lib/api/json";
import type { CandidateSearchFacetRow, CandidateShortlistRow } from "@/lib/api/platformRows";
import { formatSeniorityValue, normalizeLocationValue, normalizeSeniorityValue, normalizeSkillList, SEARCH_SKILL_TABLE } from "@/lib/searchTaxonomy";

export function mapRemoteShortlistItem(row: CandidateShortlistRow): CandidateShortlistItem {
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    candidateId: row.candidate_id,
    candidateName: row.candidate_name ?? "Unknown candidate",
    currentTitle: row.current_title ?? "Candidate",
    location: row.location ?? "Unknown",
    yearsExperience: typeof row.years_experience === "number" ? row.years_experience : null,
    seniority: row.seniority,
    primaryRole: row.primary_role,
    topSkills: toStringArray(row.top_skills),
    matchRate: typeof row.match_rate === "number" ? row.match_rate : null,
    cvUrl: row.cv_url,
    originalFilename: row.original_filename,
    sourceQuery: row.source_query ?? "",
    searchSnapshot: asRecord(row.search_snapshot),
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function shortlistInputPayload(item: CandidateShortlistInput) {
  return {
    tenant_id: item.tenantId,
    candidate_id: item.candidateId,
    candidate_name: item.candidateName,
    current_title: item.currentTitle,
    location: item.location,
    years_experience: item.yearsExperience ?? null,
    seniority: item.seniority ?? null,
    primary_role: item.primaryRole ?? null,
    top_skills: item.topSkills ?? [],
    match_rate: item.matchRate ?? null,
    cv_url: item.cvUrl ?? null,
    original_filename: item.originalFilename ?? null,
    source_query: item.sourceQuery ?? "",
    search_snapshot: item.searchSnapshot ?? {},
    notes: item.notes ?? "",
  };
}

function dedupeSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function normalizeSearchFilters(filters: SearchFilters) {
  return {
    role: filters.role?.trim() || null,
    seniority: normalizeSeniorityValue(filters.seniority) ?? null,
    min_years_experience:
      typeof filters.minYearsExperience === "number" && filters.minYearsExperience > 0
        ? filters.minYearsExperience
        : null,
    location: normalizeLocationValue(filters.location, { allowFallback: false }) ?? null,
    skills: normalizeSkillList(filters.skills ?? []),
    companies: dedupeSorted((filters.companies ?? []).map((company) => company.trim())),
  };
}

export function debugFiltersFromSearchFilters(filters: SearchFilters) {
  const normalized = normalizeSearchFilters(filters);
  return {
    role: normalized.role,
    seniority: normalized.seniority,
    minYearsExperience: normalized.min_years_experience,
    location: normalized.location,
    skills: normalized.skills,
    companies: normalized.companies,
  };
}

function mapSearchIntentFilters(record: JsonRecord): SearchFilters {
  return {
    role: typeof record.role === "string" ? record.role : undefined,
    seniority: typeof record.seniority === "string" ? record.seniority : undefined,
    minYearsExperience: typeof record.min_years_experience === "number" ? record.min_years_experience : 0,
    location: typeof record.location === "string" ? record.location : undefined,
    skills: toStringArray(record.skills),
    companies: toStringArray(record.companies),
  };
}

export function createEmptySearchFilterOptions(): SearchFilterOptions {
  return {
    seniority: [],
    skills: [],
    companies: [],
    locations: [],
  };
}

function normalizeBackendMatchScore(rawScore: unknown) {
  const normalized = Math.max(0, Math.min(1, toNumber(rawScore)));
  return Math.round((1 - Math.exp(-6 * normalized)) * 100);
}

function calibrateBackendMatchRate(rawScore: unknown, subscores: JsonRecord = {}) {
  const retrievalSignal = Math.max(
    toNumber(subscores.semantic_similarity),
    Math.min(1, toNumber(subscores.max_chunk_rrf) * 40),
    Math.min(1, toNumber(subscores.avg_top3_chunk_rrf) * 45),
  );
  const weightedSignal = Math.max(
    Math.max(0, toNumber(rawScore)),
    (0.5 * retrievalSignal)
      + (0.14 * toNumber(subscores.role_match))
      + (0.12 * toNumber(subscores.skill_match))
      + (0.08 * toNumber(subscores.experience_match))
      + (0.06 * toNumber(subscores.seniority_match))
      + (0.07 * toNumber(subscores.name_match))
      + (0.03 * toNumber(subscores.company_match)),
  );

  if (weightedSignal <= 0) {
    return 0;
  }
  return Math.min(99, Math.max(1, Math.round((1 - Math.exp(-3.2 * weightedSignal)) * 100)));
}

function backendMatchRate(record: JsonRecord, subscores: JsonRecord) {
  const backendRate = toNumber(record.match_rate, NaN);
  if (Number.isFinite(backendRate) && backendRate >= 0) {
    return Math.round(Math.max(0, Math.min(100, backendRate)));
  }
  return calibrateBackendMatchRate(record.score, subscores) || normalizeBackendMatchScore(record.score);
}

export function mapRemoteSearch(payload: JsonRecord): SearchResponse {
  const rawResults = asArray(payload.results);
  const meta = asRecord(payload.meta);
  const intent = asRecord(meta.intent);

  return {
    results: rawResults.map((row) => {
      const record = asRecord(row);
      const subscores = asRecord(record.subscores);
      const matchedFilters = asRecord(record.matched_filters);
      const rate = backendMatchRate(record, subscores);
      const rawScore = toNumber(record.score_raw ?? record.score);

      return {
        tenantId: record.tenant_id ? String(record.tenant_id) : null,
        candidateId: String(record.candidate_id),
        name: String(record.name ?? "Unknown candidate"),
        currentTitle: String(record.current_title ?? "Candidate"),
        headline: String(record.summary_short ?? record.current_title ?? "Candidate"),
        location: String(record.location ?? "Unknown"),
        yearsExperience: toNumber(record.years_experience),
        seniority: String(record.seniority ?? "unknown"),
        primaryRole: String(record.primary_role ?? "generalist"),
        topSkills: toStringArray(matchedFilters.matched_skills),
        matchScore: rate,
        backendMatchRate: rate,
        backendScoreRaw: rawScore,
        matchSignals: {
          semantic: toNumber(subscores.semantic_similarity),
          skill: toNumber(subscores.skill_match),
          experience: toNumber(subscores.experience_match),
        },
        shortSummary: String(record.summary_short ?? ""),
        strengths: [],
        risks: [],
        recommendedRoles: [],
        stage: "Retrieved",
        avatarHue: hueFromId(String(record.candidate_id)),
        matchNarrative: String(record.summary_short ?? "Live result from backend search ranking."),
      };
    }),
    nextCursor: typeof payload.next_cursor === "number" ? payload.next_cursor : null,
    meta: {
      count: toNumber(meta.count, rawResults.length),
      rankVersion: String(meta.rank_version ?? "v2-rate"),
      source: "remote",
      intentSource: typeof meta.intent_source === "string" ? meta.intent_source as SearchResponse["meta"]["intentSource"] : undefined,
      intent: Object.keys(intent).length ? mapSearchIntentFilters(intent) : undefined,
    },
  };
}

export function mapRemoteSearchDebug(payload: JsonRecord): SearchDebugResponse {
  const request = asRecord(payload.request);
  const analysis = asRecord(payload.analysis);
  const embedding = asRecord(analysis.embedding);
  const rawResults = asArray(payload.results);
  const explicitFilters = asRecord(request.explicit_filters);
  const llmIntent = asRecord(analysis.llm_intent);
  const resolvedIntent = asRecord(analysis.resolved_intent);
  const meta = asRecord(payload.meta);

  const normalizeFilters = (record: JsonRecord) => ({
    role: typeof record.role === "string" ? record.role : null,
    seniority: typeof record.seniority === "string" ? record.seniority : null,
    minYearsExperience: typeof record.min_years_experience === "number" ? record.min_years_experience : null,
    location: typeof record.location === "string" ? record.location : null,
    skills: toStringArray(record.skills),
    companies: toStringArray(record.companies),
  });

  return {
    request: {
      query: String(request.query ?? ""),
      limit: toNumber(request.limit, rawResults.length),
      offset: toNumber(request.offset, 0),
      tenantIds: toStringArray(request.tenant_ids),
      explicitFilters: normalizeFilters(explicitFilters),
    },
    analysis: {
      intentSource: String(analysis.intent_source ?? "explicit") as SearchDebugResponse["analysis"]["intentSource"],
      llmIntent: Object.keys(llmIntent).length ? normalizeFilters(llmIntent) : null,
      resolvedIntent: normalizeFilters(resolvedIntent),
      embedding: {
        provider: String(embedding.provider ?? "unknown"),
        version: typeof embedding.version === "string" ? embedding.version : null,
        dimensions: toNumber(embedding.dimensions, 0),
        preview: asArray(embedding.preview).map((value) => toNumber(value)),
      },
      rpcPayload: asRecord(analysis.rpc_payload),
      engine: {
        usesLexical: Boolean(analysis.uses_lexical),
        usesSemantic: Boolean(analysis.uses_semantic),
        usesNameBoost: Boolean(analysis.uses_name_boost),
        strictFilters: toStringArray(analysis.strict_filters),
      },
    },
    results: rawResults.map((row) => {
      const record = asRecord(row);
      const subscoresRecord = asRecord(record.subscores);
      const rate = backendMatchRate(record, subscoresRecord);
      return {
        tenantId: record.tenant_id ? String(record.tenant_id) : null,
        candidateId: String(record.candidate_id),
        name: String(record.name ?? "Unknown candidate"),
        currentTitle: String(record.current_title ?? "Candidate"),
        location: String(record.location ?? "Unknown"),
        yearsExperience: toNumber(record.years_experience),
        seniority: String(record.seniority ?? "unknown"),
        primaryRole: String(record.primary_role ?? "generalist"),
        scoreRaw: toNumber(record.score_raw ?? record.score),
        matchRate: rate,
        displayedMatchScore: rate,
        subscores: Object.fromEntries(
          Object.entries(subscoresRecord).map(([key, value]) => [key, toNumber(value)]),
        ),
        matchedFilters: asRecord(record.matched_filters),
        summaryShort: String(record.summary_short ?? ""),
        evidence: asArray(record.evidence).map((item, index) => mapDebugEvidenceSnippet(asRecord(item), index)),
      };
    }),
    nextCursor: typeof payload.next_cursor === "number" ? payload.next_cursor : null,
    meta: {
      count: toNumber(meta.count, rawResults.length),
      rankVersion: String(meta.rank_version ?? "v2-rate"),
      source: "remote",
    },
    rawResponse: payload,
  };
}

export function createFallbackSearchFilterOptions(): SearchFilterOptions {
  const fallbackSeniorityValues = ["junior", "mid", "senior", "staff-plus"];

  return {
    seniority: fallbackSeniorityValues.map((value) => ({
      value,
      label: formatSeniorityValue(value) || value,
    })),
    skills: dedupeSorted(SEARCH_SKILL_TABLE.map((entry) => String(entry.value))),
    companies: [],
    locations: [],
  };
}

export function mapSearchFilterOptions(rows: CandidateSearchFacetRow[]): SearchFilterOptions {
  const seniority = dedupeSorted(
    rows
      .map((row) => row.seniority ?? "")
      .filter((value) => value && value !== "unclassified"),
  ).map((value) => ({
    value,
    label: formatSeniorityValue(value) || value,
  }));

  const skills = dedupeSorted(normalizeSkillList(rows.flatMap((row) => row.skills ?? [])));
  const companies = dedupeSorted(
    rows.flatMap((row) => row.companies ?? []),
  );
  const locations = dedupeSorted(
    rows
      .map((row) => normalizeLocationValue(row.location))
      .filter((value): value is string => Boolean(value)),
  );

  const fallback = createFallbackSearchFilterOptions();

  return {
    seniority: seniority.length ? seniority : fallback.seniority,
    skills: skills.length ? skills : fallback.skills,
    companies: companies.length ? companies : fallback.companies,
    locations: locations.length ? locations : fallback.locations,
  };
}
