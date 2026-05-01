import type {
  AccessRoster,
  AgentResponse,
  AnalyticsSnapshot,
  AskResponse,
  CandidateDetail,
  ComparisonResponse,
  DataConnector,
  IndexingWorkbench,
  ParsingDocumentDetail,
  ParsingOverview,
  ParserProfile,
  ParserProfileInput,
  SearchFilterOptions,
  SearchFilters,
  SearchDebugResponse,
  SearchQueryOptions,
  SearchResponse,
  SystemHealth,
  WorkspaceStats,
} from "@/lib/contracts";
import {
  accessRoster,
  analyticsSnapshot,
  askCandidates,
  compareCandidates,
  dataConnectors,
  defaultCompareIds,
  defaultIntelligenceIds,
  getCandidate,
  getParserProfiles,
  getParsingDocument,
  getWorkspaceStats as getMockWorkspaceStats,
  indexingWorkbench,
  parsingOverview,
  publishParserProfile,
  saveParserProfile,
  searchCandidates,
  systemHealth,
} from "@/data/mockData";
import {
  buildParsingDocumentDetail,
  buildParsingOverview,
  type ParsingCandidateRow,
  type ParsingProcessingRunRow,
  type ParsingProfileRow,
  type ParsingSourceDocumentRow,
} from "@/lib/parsingQuality";
import { formatSeniorityValue, normalizeSeniorityValue, normalizeSkillList, SEARCH_SENIORITY_TABLE, SEARCH_SKILL_TABLE } from "@/lib/searchTaxonomy";
import { hasSupabaseConfig, supabase } from "@/lib/supabaseClient";

type JsonRecord = Record<string, unknown>;

type PlatformApi = {
  search: (query: string, filters: SearchFilters, options?: SearchQueryOptions, tenantIds?: string[]) => Promise<SearchResponse>;
  searchDebug: (query: string, filters: SearchFilters, options?: SearchQueryOptions, tenantIds?: string[]) => Promise<SearchDebugResponse>;
  getSearchFilterOptions: (tenantIds?: string[]) => Promise<SearchFilterOptions>;
  getWorkspaceStats: (tenantIds?: string[]) => Promise<WorkspaceStats>;
  getCandidate: (candidateId: string) => Promise<CandidateDetail>;
  compare: (candidateIds: string[], requiredSkills?: string[]) => Promise<ComparisonResponse>;
  ask: (question: string, candidateIds: string[]) => Promise<AskResponse>;
  agent: (
    question: string,
    candidateIds?: string[],
    messages?: Array<{ role: "user" | "assistant"; content: string }>,
    tenantIds?: string[],
  ) => Promise<AgentResponse>;
  getOriginalDocumentUrl: (storagePath?: string | null, sourceUri?: string | null) => Promise<string | null>;
  getParsingOverview: (tenantIds?: string[]) => Promise<ParsingOverview>;
  getParsingDocument: (documentId: string, tenantIds?: string[]) => Promise<ParsingDocumentDetail>;
  getParserProfiles: (tenantIds?: string[]) => Promise<ParserProfile[]>;
  saveParserProfile: (profile: ParserProfileInput, tenantId?: string) => Promise<ParserProfile>;
  publishParserProfile: (profileId: string, tenantId?: string) => Promise<ParserProfile>;
  getAnalytics: () => Promise<AnalyticsSnapshot>;
  getSystemHealth: () => Promise<SystemHealth>;
  getDataConnectors: () => Promise<DataConnector[]>;
  getIndexingWorkbench: () => Promise<IndexingWorkbench>;
  getAccessRoster: () => Promise<AccessRoster>;
};

type CandidateDossierRow = {
  candidate_id: string;
  name: string;
  headline: string | null;
  current_title: string | null;
  location: string | null;
  years_experience: number | null;
  seniority: string | null;
  primary_role: string | null;
  top_skills: string[] | null;
  email: string | null;
  phone: string | null;
  links: string[] | null;
  summary_short: string | null;
  short_summary: string | null;
  long_summary: string | null;
  strengths: unknown;
  risks: unknown;
  recommended_roles: unknown;
  timeline_json: unknown;
  profile_json: unknown;
  original_filename: string | null;
  mime_type: string | null;
  storage_path: string | null;
  source_uri: string | null;
  confidence: number | null;
};

type CandidateChunkRow = {
  id: string;
  chunk_type: string;
  text: string;
};

type CandidateSearchFacetRow = {
  seniority: string | null;
  skills: string[] | null;
  companies: string[] | null;
  location: string | null;
};

type CandidateTimelineRow = {
  timeline_json: unknown;
};

type ParsingRemoteSnapshot = {
  documents: ParsingSourceDocumentRow[];
  candidates: ParsingCandidateRow[];
  profiles: ParsingProfileRow[];
  runs: ParsingProcessingRunRow[];
};

type ParserProfileRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  extraction_provider: string;
  extraction_model: string;
  parser_version: string;
  model_version: string;
  prompt_version: string;
  chunk_version: string;
  embedding_provider: string;
  embedding_model: string;
  embedding_version: string;
  chunking_profile: string;
  ocr_enabled: boolean;
  allow_heuristic_fallback: boolean;
  prompt_template: string;
  notes: string | null;
  last_evaluated_at: string | null;
  avg_parse_percentage: number | null;
  avg_confidence: number | null;
  documents_evaluated: number | null;
  created_at: string;
  updated_at: string;
};

const STORAGE_BUCKET = "cv-originals";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function toNumber(value: unknown, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function hueFromId(seed: string) {
  return seed.split("").reduce((memo, character) => memo + character.charCodeAt(0), 0) % 360;
}

function dedupeSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function countDistinctEmployers(rows: CandidateTimelineRow[]) {
  return new Set(
    rows.flatMap((row) =>
      asArray(row.timeline_json)
        .map((entry) => String(asRecord(entry).company ?? asRecord(entry).employer ?? "").trim())
        .filter(Boolean)
    ),
  ).size;
}

function normalizeSearchFilters(filters: SearchFilters) {
  return {
    role: filters.role?.trim() || null,
    seniority: normalizeSeniorityValue(filters.seniority) ?? null,
    min_years_experience:
      typeof filters.minYearsExperience === "number" && filters.minYearsExperience > 0
        ? filters.minYearsExperience
        : null,
    location: filters.location?.trim() || null,
    skills: normalizeSkillList(filters.skills ?? []),
    companies: dedupeSorted((filters.companies ?? []).map((company) => company.trim())),
  };
}

function createEmptySearchFilterOptions(): SearchFilterOptions {
  return {
    seniority: [],
    skills: [],
    companies: [],
    locations: [],
  };
}

function createEmptyWorkspaceStats(): WorkspaceStats {
  return {
    documentCount: 0,
    candidateCount: 0,
    companyCount: 0,
  };
}

function buildSearchRpcPayload(
  query: string,
  filters: ReturnType<typeof normalizeSearchFilters>,
  options?: SearchQueryOptions,
  tenantIds?: string[],
) {
  const limit = Math.max(1, Math.min(50, Math.trunc(options?.limit ?? 12)));
  const offset = Math.max(0, Math.trunc(options?.offset ?? 0));

  return {
    p_q: query,
    p_query_embedding: null,
    p_limit: limit,
    p_offset: offset,
    p_role: filters.role,
    p_seniority: filters.seniority,
    p_min_years: filters.min_years_experience,
    p_skills: filters.skills,
    p_embedding_version: null,
    p_rank_version: "v2-rate",
    p_tenant_ids: tenantIds?.length ? tenantIds : null,
    p_filter_role: filters.role,
    p_filter_seniority: filters.seniority,
    p_filter_min_years: filters.min_years_experience,
    p_filter_skills: filters.skills,
    p_filter_companies: filters.companies,
    p_filter_location: filters.location,
  };
}

async function runDirectSearchRpc(
  query: string,
  filters: ReturnType<typeof normalizeSearchFilters>,
  options?: SearchQueryOptions,
  tenantIds?: string[],
) {
  if (!supabase) {
    throw new Error("Missing Supabase browser client configuration.");
  }

  const rpcPayload = buildSearchRpcPayload(query, filters, options, tenantIds);
  let { data, error } = await supabase.rpc("search_candidates_with_rate_v1", rpcPayload);

  if (error && `${error.message}`.includes("search_candidates_with_rate_v1")) {
    const fallback = await supabase.rpc("search_candidates_v1", rpcPayload);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  return {
    rpcPayload,
    rows: asArray(data),
    nextCursor:
      asArray(data).length < rpcPayload.p_limit
        ? null
        : rpcPayload.p_offset + rpcPayload.p_limit,
  };
}

async function runDirectSearchDebugRpc(
  query: string,
  filters: ReturnType<typeof normalizeSearchFilters>,
  options?: SearchQueryOptions,
  tenantIds?: string[],
) {
  const { rpcPayload, rows, nextCursor } = await runDirectSearchRpc(query, filters, options, tenantIds);
  const strictFilters = Object.entries(filters)
    .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : value !== null && value !== ""))
    .map(([key]) => key);

  return {
    request: {
      query,
      limit: rpcPayload.p_limit,
      offset: rpcPayload.p_offset,
      tenant_ids: tenantIds ?? [],
      explicit_filters: filters,
    },
    analysis: {
      intent_source: "rule_based",
      llm_intent: null,
      resolved_intent: filters,
      embedding: {
        provider: "none",
        version: null,
        dimensions: 0,
        preview: [],
      },
      rpc_payload: rpcPayload,
      uses_lexical: Boolean(query.trim()),
      uses_semantic: false,
      uses_name_boost: Boolean(query.trim()),
      strict_filters: strictFilters,
    },
    results: rows,
    next_cursor: nextCursor,
    meta: {
      count: rows.length,
      rank_version: String(rpcPayload.p_rank_version),
      source: "remote",
    },
    raw_response: {
      results: rows,
      next_cursor: nextCursor,
      meta: {
        count: rows.length,
        rank_version: String(rpcPayload.p_rank_version),
        source: "remote",
      },
    },
  } satisfies JsonRecord;
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

function mapEvidenceSnippet(payload: JsonRecord, fallbackIndex: number): CandidateDetail["evidence"][number] {
  return {
    id: String(payload.chunk_id ?? payload.id ?? `e-${fallbackIndex}`),
    chunkType: String(payload.chunk_type ?? payload.chunkType ?? "summary") as CandidateDetail["evidence"][number]["chunkType"],
    excerpt: String(payload.text ?? payload.excerpt ?? ""),
    relevance: Math.max(0, Math.min(1, toNumber(payload.semantic_similarity ?? payload.relevance ?? payload.lexical_score, 0.72))),
  };
}

function mapDebugEvidenceSnippet(payload: JsonRecord, fallbackIndex: number) {
  return {
    id: String(payload.chunk_id ?? payload.id ?? `e-${fallbackIndex}`),
    chunkType: String(payload.chunk_type ?? payload.chunkType ?? "summary"),
    excerpt: String(payload.text ?? payload.excerpt ?? ""),
    relevance: Math.max(0, Math.min(1, toNumber(payload.semantic_similarity ?? payload.relevance ?? payload.lexical_score, 0.72))),
  };
}

async function invokeFunction<T>(name: string, body: JsonRecord): Promise<T> {
  if (!supabase) {
    throw new Error("Missing Supabase browser client configuration.");
  }

  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    const response = typeof error === "object" && error !== null && "context" in error ? (error as { context?: Response }).context : null;
    if (response instanceof Response) {
      try {
        const payload = await response.clone().json() as JsonRecord;
        const detail = String(payload.details ?? payload.error ?? payload.message ?? response.statusText).trim();
        throw new Error(detail || `Function ${name} failed with status ${response.status}.`);
      } catch {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Function ${name} failed with status ${response.status}.`);
      }
    }
    if (error instanceof Error && error.name === "FunctionsFetchError") {
      throw new Error("Supabase Edge Functions are unreachable. Start or redeploy the local functions runtime, then try again.");
    }
    throw error;
  }

  return data as T;
}

async function fetchParsingSnapshot(tenantIds: string[]): Promise<ParsingRemoteSnapshot> {
  if (!supabase) {
    throw new Error("Missing Supabase browser client configuration.");
  }

  if (!tenantIds.length) {
    return {
      documents: [],
      candidates: [],
      profiles: [],
      runs: [],
    };
  }

  const [documentsResult, candidatesResult, profilesResult, runsResult] = await Promise.all([
    supabase
      .from("source_documents")
      .select("id, tenant_id, candidate_id, source_type, original_filename, mime_type, source_uri, storage_path, created_at, updated_at")
      .in("tenant_id", tenantIds)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase
      .from("candidates")
      .select("id, tenant_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, email, phone, links, summary_short, status")
      .in("tenant_id", tenantIds)
      .limit(10000),
    supabase
      .from("candidate_profiles")
      .select("tenant_id, candidate_id, source_document_id, profile_json, timeline_json, skill_matrix_json, raw_text, confidence, missing_fields, parse_warnings, created_at, updated_at")
      .in("tenant_id", tenantIds)
      .limit(10000),
    supabase
      .from("processing_runs")
      .select("tenant_id, source_document_id, status, parser_version, model_version, prompt_version, chunk_version, embedding_version, warnings, error_code, error_message, created_at, updated_at, metadata_json")
      .in("tenant_id", tenantIds)
      .order("created_at", { ascending: false })
      .limit(20000),
  ]);

  if (documentsResult.error) {
    throw documentsResult.error;
  }
  if (candidatesResult.error) {
    throw candidatesResult.error;
  }
  if (profilesResult.error) {
    throw profilesResult.error;
  }
  if (runsResult.error) {
    throw runsResult.error;
  }

  return {
    documents: (documentsResult.data ?? []) as ParsingSourceDocumentRow[],
    candidates: (candidatesResult.data ?? []) as ParsingCandidateRow[],
    profiles: (profilesResult.data ?? []) as ParsingProfileRow[],
    runs: (runsResult.data ?? []) as ParsingProcessingRunRow[],
  };
}

function isBrowserOpenableSource(sourceUri?: string | null) {
  return Boolean(sourceUri && /^(https?:)?\/\//i.test(sourceUri));
}

function mapRemoteSearch(payload: JsonRecord): SearchResponse {
  const rawResults = asArray(payload.results);

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
      count: toNumber(asRecord(payload.meta).count, rawResults.length),
      rankVersion: String(asRecord(payload.meta).rank_version ?? "v2-rate"),
      source: "remote",
    },
  };
}

function mapRemoteSearchDebug(payload: JsonRecord): SearchDebugResponse {
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
      intentSource: String(analysis.intent_source ?? "rule_based") as SearchDebugResponse["analysis"]["intentSource"],
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

function createFallbackSearchFilterOptions(): SearchFilterOptions {
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

function mapSearchFilterOptions(rows: CandidateSearchFacetRow[]): SearchFilterOptions {
  const seniority = dedupeSorted(
    rows
      .map((row) => row.seniority ?? "")
      .filter((value) => value && value !== "unclassified"),
  ).map((value) => ({
    value,
    label: formatSeniorityValue(value) || value,
  }));

  const skills = dedupeSorted(
    rows.flatMap((row) => row.skills ?? []),
  );
  const companies = dedupeSorted(
    rows.flatMap((row) => row.companies ?? []),
  );
  const locations = dedupeSorted(
    rows
      .map((row) => row.location ?? "")
      .filter(Boolean),
  );

  const fallback = createFallbackSearchFilterOptions();

  return {
    seniority: seniority.length ? seniority : fallback.seniority,
    skills: skills.length ? skills : fallback.skills,
    companies: companies.length ? companies : fallback.companies,
    locations: locations.length ? locations : fallback.locations,
  };
}

function mapRemoteComparison(payload: JsonRecord): ComparisonResponse {
  const nested = asRecord(payload.comparison);
  const normalized = Object.keys(nested).length ? nested : payload;
  const rawItems = asArray(normalized.items);

  return {
    source: String(payload.source ?? normalized.source ?? "deterministic_fallback") as ComparisonResponse["source"],
    overlap: toStringArray(normalized.overlap),
    recommendedCandidateId: normalized.recommended_candidate_id
      ? String(normalized.recommended_candidate_id)
      : normalized.recommendedCandidateId
        ? String(normalized.recommendedCandidateId)
        : null,
    items: rawItems.map((row) => {
      const record = asRecord(row);
      return {
        tenantId: record.tenant_id ? String(record.tenant_id) : null,
        candidateId: String(record.candidate_id ?? record.candidateId),
        name: String(record.name ?? "Unknown candidate"),
        currentTitle: String(record.current_title ?? record.currentTitle ?? "Candidate"),
        yearsExperience: toNumber(record.years_experience ?? record.yearsExperience),
        seniority: String(record.seniority ?? "unknown"),
        score: toNumber(record.score),
        matchedSkills: toStringArray(record.matched_skills ?? record.matchedSkills),
        gaps: toStringArray(record.gaps),
        strengths: toStringArray(record.strengths),
        risks: toStringArray(record.risks),
        summary: String(record.summary ?? ""),
      };
    }),
    meta: {
      comparedCount: toNumber(asRecord(normalized.meta).compared_count ?? asRecord(normalized.meta).comparedCount, rawItems.length),
    },
  };
}

function mapRemoteAsk(payload: JsonRecord, candidateIds: string[]): AskResponse {
  return {
    intent: String(payload.intent ?? "why_matched"),
    facts: asArray(payload.facts).map((row) => {
      const record = asRecord(row);
      return {
        candidateId: String(record.candidate_id ?? record.candidateId),
        candidateName: String(record.candidate_name ?? record.candidateName ?? "Candidate"),
        fact: String(record.fact ?? ""),
      };
    }),
    citations: asArray(payload.citations).map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    contextBlocks: asArray(payload.context_blocks).map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    extractiveAnswer: String(payload.extractive_answer ?? ""),
    meta: {
      candidateCount: toNumber(asRecord(payload.meta).candidate_count, candidateIds.length),
      topK: toNumber(asRecord(payload.meta).top_k, 6),
      answerSource: String(asRecord(payload.meta).answer_source ?? "remote"),
      scopeSource: String(asRecord(payload.meta).scope_source ?? (candidateIds.length ? "explicit" : "retrieved")) as AskResponse["meta"]["scopeSource"],
      resolvedCandidateIds: toStringArray(asRecord(payload.meta).resolved_candidate_ids),
    },
  };
}

function mapRemoteAgent(payload: JsonRecord, candidateIds: string[]): AgentResponse {
  return {
    answer: String(payload.answer ?? payload.extractive_answer ?? ""),
    citations: asArray(payload.citations).map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    contextBlocks: asArray(payload.context_blocks).map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    meta: {
      candidateCount: toNumber(asRecord(payload.meta).candidate_count, candidateIds.length),
      topK: toNumber(asRecord(payload.meta).top_k, 6),
      answerSource: String(asRecord(payload.meta).answer_source ?? "remote"),
      scopeSource: String(asRecord(payload.meta).scope_source ?? (candidateIds.length ? "explicit" : "retrieved")) as AgentResponse["meta"]["scopeSource"],
      resolvedCandidateIds: toStringArray(asRecord(payload.meta).resolved_candidate_ids),
    },
  };
}

function mapRemoteParserProfile(row: ParserProfileRow): ParserProfile {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    status: row.status as ParserProfile["status"],
    extractionProvider: row.extraction_provider,
    extractionModel: row.extraction_model,
    parserVersion: row.parser_version,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
    chunkVersion: row.chunk_version,
    embeddingProvider: row.embedding_provider,
    embeddingModel: row.embedding_model,
    embeddingVersion: row.embedding_version,
    chunkingProfile: row.chunking_profile,
    ocrEnabled: Boolean(row.ocr_enabled),
    allowHeuristicFallback: false,
    promptTemplate: row.prompt_template,
    notes: row.notes ?? "",
    lastEvaluatedAt: row.last_evaluated_at,
    avgParsePercentage: row.avg_parse_percentage,
    avgConfidence: row.avg_confidence,
    documentsEvaluated: toNumber(row.documents_evaluated),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRemoteCandidate(row: CandidateDossierRow, chunks: CandidateChunkRow[]): CandidateDetail {
  const profile = asRecord(row.profile_json);
  const timeline = asArray(row.timeline_json).map((entry) => {
    const record = asRecord(entry);
    const description = String(record.description ?? "");

    return {
      employer: String(record.company ?? "Unknown company"),
      role: String(record.title ?? "Role not parsed"),
      start: String(record.start_date ?? "Unknown"),
      end: String(record.end_date ?? "Present"),
      scope: description,
      highlights: description
        .split(/[.;]\s+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3),
    };
  });

  const projects = asArray(profile.projects)
    .map((entry) => {
      const record = asRecord(entry);
      const projectName = String(record.name ?? "").trim();
      const description = String(record.description ?? "").trim();
      return projectName && description ? `${projectName}: ${description}` : projectName || description;
    })
    .filter(Boolean);

  const education = asArray(profile.education)
    .map((entry) => {
      const record = asRecord(entry);
      return [String(record.degree ?? "").trim(), String(record.field ?? "").trim(), String(record.institution ?? "").trim()]
        .filter(Boolean)
        .join(" · ");
    })
    .filter(Boolean);

  return {
    candidateId: row.candidate_id,
    name: row.name,
    currentTitle: row.current_title ?? "Candidate",
    headline: row.headline ?? row.short_summary ?? row.summary_short ?? row.current_title ?? "Candidate",
    location: row.location ?? "Unknown",
    yearsExperience: toNumber(row.years_experience),
    seniority: row.seniority ?? "unknown",
    primaryRole: row.primary_role ?? "generalist",
    topSkills: toStringArray(row.top_skills),
    matchScore: 0,
    backendMatchRate: 0,
    backendScoreRaw: 0,
    matchSignals: {
      semantic: 0,
      skill: Math.min(1, Math.max(0.3, toStringArray(row.top_skills).length / 10)),
      experience: Math.min(1, toNumber(row.years_experience) / 10),
    },
    shortSummary: row.short_summary ?? row.summary_short ?? "",
    strengths: toStringArray(row.strengths),
    risks: toStringArray(row.risks),
    recommendedRoles: toStringArray(row.recommended_roles),
    stage: "Indexed",
    avatarHue: hueFromId(row.candidate_id),
    matchNarrative: row.short_summary ?? row.summary_short ?? "Grounded dossier view from candidate_dossier_v1.",
    longSummary: row.long_summary ?? row.short_summary ?? row.summary_short ?? "",
    email: row.email,
    phone: row.phone,
    links: toStringArray(row.links),
    education,
    certifications: toStringArray(profile.certifications),
    languages: toStringArray(profile.languages),
    projects,
    timeline,
    evidence: chunks.map((chunk, index) =>
      mapEvidenceSnippet(
        {
          id: chunk.id,
          chunk_type: chunk.chunk_type,
          text: chunk.text,
          relevance: Math.max(0.4, 0.95 - index * 0.08),
        },
        index,
      ),
    ),
    cvPreview: [
      row.original_filename ? `Source file: ${row.original_filename}` : "",
      row.mime_type ? `MIME type: ${row.mime_type}` : "",
      row.storage_path ? `Storage path: ${row.storage_path}` : "",
      row.source_uri ? `Source URI: ${row.source_uri}` : "",
    ].filter(Boolean),
  };
}

function createMockApi(): PlatformApi {
  return {
    async search(query, filters, options, _tenantIds) {
      await wait(180);
      return searchCandidates(query, filters, options);
    },
    async searchDebug(query, filters, options, tenantIds) {
      await wait(180);
      const response = searchCandidates(query, filters, options);
      const explicitFilters = {
        role: filters.role?.trim() || null,
        seniority: normalizeSeniorityValue(filters.seniority) ?? null,
        minYearsExperience:
          typeof filters.minYearsExperience === "number" && filters.minYearsExperience > 0
            ? filters.minYearsExperience
            : null,
        location: filters.location?.trim() || null,
        skills: normalizeSkillList(filters.skills ?? []),
        companies: dedupeSorted((filters.companies ?? []).map((company) => company.trim())),
      };

      return {
        request: {
          query,
          limit: Math.max(1, Math.min(50, Math.trunc(options?.limit ?? 12))),
          offset: Math.max(0, Math.trunc(options?.offset ?? 0)),
          tenantIds: tenantIds ?? [],
          explicitFilters,
        },
        analysis: {
          intentSource: "rule_based",
          llmIntent: null,
          resolvedIntent: explicitFilters,
          embedding: {
            provider: "mock",
            version: "mock-v1",
            dimensions: 0,
            preview: [],
          },
          rpcPayload: {
            p_q: query,
            p_tenant_ids: tenantIds ?? [],
            p_filter_role: explicitFilters.role,
            p_filter_seniority: explicitFilters.seniority,
            p_filter_min_years: explicitFilters.minYearsExperience,
            p_filter_skills: explicitFilters.skills,
            p_filter_companies: explicitFilters.companies,
            p_filter_location: explicitFilters.location,
          },
          engine: {
            usesLexical: Boolean(query.trim()),
            usesSemantic: false,
            usesNameBoost: Boolean(query.trim()),
            strictFilters: Object.entries(explicitFilters)
              .filter(([, value]) => Array.isArray(value) ? value.length > 0 : value !== null && value !== "")
              .map(([key]) => key),
          },
        },
        results: response.results.map((candidate) => ({
          tenantId: candidate.tenantId ?? null,
          candidateId: candidate.candidateId,
          name: candidate.name,
          currentTitle: candidate.currentTitle,
          location: candidate.location,
          yearsExperience: candidate.yearsExperience,
          seniority: candidate.seniority,
          primaryRole: candidate.primaryRole,
          scoreRaw: candidate.backendScoreRaw,
          matchRate: candidate.backendMatchRate,
          displayedMatchScore: candidate.backendMatchRate,
          subscores: {
            semantic_similarity: candidate.matchSignals.semantic,
            skill_match: candidate.matchSignals.skill,
            experience_match: candidate.matchSignals.experience,
          },
          matchedFilters: {
            role: explicitFilters.role,
            seniority: explicitFilters.seniority,
            min_years_experience: explicitFilters.minYearsExperience,
            location: explicitFilters.location,
            required_skills: explicitFilters.skills,
            required_companies: explicitFilters.companies,
          },
          summaryShort: candidate.shortSummary,
          evidence: [],
        })),
        nextCursor: response.nextCursor,
        meta: {
          ...response.meta,
        },
        rawResponse: {
          results: response.results,
          next_cursor: response.nextCursor,
          meta: response.meta,
        },
      };
    },
    async getSearchFilterOptions(_tenantIds) {
      await wait(80);
      return createFallbackSearchFilterOptions();
    },
    async getWorkspaceStats(_tenantIds) {
      await wait(80);
      return getMockWorkspaceStats();
    },
    async getCandidate(candidateId) {
      await wait(120);
      return getCandidate(candidateId);
    },
    async compare(candidateIds, requiredSkills) {
      await wait(140);
      return compareCandidates(candidateIds.length ? candidateIds : defaultCompareIds, requiredSkills);
    },
    async ask(question, candidateIds) {
      await wait(130);
      return askCandidates(question, candidateIds);
    },
    async agent(question, candidateIds, _messages, _tenantIds) {
      await wait(130);
      const scoped = askCandidates(question, candidateIds ?? []);
      return {
        answer: scoped.extractiveAnswer,
        citations: scoped.citations,
        contextBlocks: scoped.contextBlocks,
        meta: {
          candidateCount: scoped.meta.candidateCount,
          topK: scoped.meta.topK,
          answerSource: scoped.meta.answerSource ?? "mock",
          scopeSource: scoped.meta.scopeSource ?? ((candidateIds?.length ?? 0) > 0 ? "explicit" : "mock"),
          resolvedCandidateIds: scoped.meta.resolvedCandidateIds ?? (candidateIds ?? []),
        },
      };
    },
    async getOriginalDocumentUrl(storagePath, sourceUri) {
      await wait(40);
      if (isBrowserOpenableSource(sourceUri)) {
        return sourceUri ?? null;
      }
      return storagePath ? sourceUri ?? null : null;
    },
    async getParsingOverview(_tenantIds) {
      await wait(120);
      return parsingOverview;
    },
    async getParsingDocument(documentId, _tenantIds) {
      await wait(120);
      return getParsingDocument(documentId);
    },
    async getParserProfiles(_tenantIds) {
      await wait(120);
      return getParserProfiles();
    },
    async saveParserProfile(profile) {
      await wait(120);
      return saveParserProfile(profile);
    },
    async publishParserProfile(profileId) {
      await wait(100);
      return publishParserProfile(profileId);
    },
    async getAnalytics() {
      await wait(80);
      return analyticsSnapshot;
    },
    async getSystemHealth() {
      await wait(80);
      return systemHealth;
    },
    async getDataConnectors() {
      await wait(80);
      return dataConnectors;
    },
    async getIndexingWorkbench() {
      await wait(80);
      return indexingWorkbench;
    },
    async getAccessRoster() {
      await wait(80);
      return accessRoster;
    },
  };
}

function createRemoteApi(): PlatformApi {
  const mock = createMockApi();

  return {
    async search(query, filters, options, tenantIds) {
      const explicitFilters = normalizeSearchFilters(filters);

      try {
        const limit = Math.max(1, Math.min(50, Math.trunc(options?.limit ?? 12)));
        const offset = Math.max(0, Math.trunc(options?.offset ?? 0));
        const payload = await invokeFunction<JsonRecord>("search", {
          q: query,
          tenant_ids: tenantIds ?? [],
          filters: explicitFilters,
          limit,
          offset,
        });
        return mapRemoteSearch(payload);
      } catch (functionError) {
        try {
          const fallbackPayload = await runDirectSearchRpc(query, explicitFilters, options, tenantIds);
          return mapRemoteSearch({
            results: fallbackPayload.rows,
            next_cursor: fallbackPayload.nextCursor,
            meta: {
              count: fallbackPayload.rows.length,
              rank_version: String(fallbackPayload.rpcPayload.p_rank_version),
              source: "remote",
            },
          });
        } catch (rpcError) {
          throw new Error(
            `Live search failed. Edge Function error: ${errorMessage(functionError)}. Direct Supabase RPC error: ${errorMessage(rpcError)}.`,
          );
        }
      }
    },
    async searchDebug(query, filters, options, tenantIds) {
      const explicitFilters = normalizeSearchFilters(filters);

      try {
        const limit = Math.max(1, Math.min(50, Math.trunc(options?.limit ?? 12)));
        const offset = Math.max(0, Math.trunc(options?.offset ?? 0));
        const payload = await invokeFunction<JsonRecord>("search-debug", {
          q: query,
          tenant_ids: tenantIds ?? [],
          filters: explicitFilters,
          limit,
          offset,
        });
        return mapRemoteSearchDebug(payload);
      } catch (functionError) {
        try {
          const fallbackPayload = await runDirectSearchDebugRpc(query, explicitFilters, options, tenantIds);
          return mapRemoteSearchDebug(fallbackPayload);
        } catch (rpcError) {
          throw new Error(
            `Live search debug failed. Edge Function error: ${errorMessage(functionError)}. Direct Supabase RPC error: ${errorMessage(rpcError)}.`,
          );
        }
      }
    },
    async getSearchFilterOptions(tenantIds) {
      if (!supabase) {
        return mock.getSearchFilterOptions();
      }

      try {
        let query = supabase
          .from("candidate_search_rows")
          .select("seniority, skills, companies, location")
          .limit(10000);

        if (tenantIds?.length) {
          query = query.in("tenant_id", tenantIds);
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        return mapSearchFilterOptions((data ?? []) as CandidateSearchFacetRow[]);
      } catch {
        return createEmptySearchFilterOptions();
      }
    },
    async getWorkspaceStats(tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return createEmptyWorkspaceStats();
      }

      try {
        const [documentsResult, candidatesResult, timelineResult] = await Promise.all([
          supabase.from("source_documents").select("id", { count: "exact", head: true }).in("tenant_id", tenantIds),
          supabase.from("candidates").select("id", { count: "exact", head: true }).in("tenant_id", tenantIds),
          supabase.from("candidate_profiles").select("timeline_json").in("tenant_id", tenantIds).limit(10000),
        ]);

        if (documentsResult.error) {
          throw documentsResult.error;
        }
        if (candidatesResult.error) {
          throw candidatesResult.error;
        }
        if (timelineResult.error) {
          throw timelineResult.error;
        }

        return {
          documentCount: documentsResult.count ?? 0,
          candidateCount: candidatesResult.count ?? 0,
          companyCount: countDistinctEmployers((timelineResult.data ?? []) as CandidateTimelineRow[]),
        };
      } catch {
        return createEmptyWorkspaceStats();
      }
    },
    async getCandidate(candidateId) {
      if (!supabase) {
        return mock.getCandidate(candidateId);
      }

      try {
        const [dossier, chunks] = await Promise.all([
          supabase
            .from("candidate_dossier_v1")
            .select(
              "candidate_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, email, phone, links, summary_short, short_summary, long_summary, strengths, risks, recommended_roles, timeline_json, profile_json, original_filename, mime_type, storage_path, source_uri, confidence",
            )
            .eq("candidate_id", candidateId)
            .maybeSingle(),
          supabase
            .from("candidate_chunks")
            .select("id, chunk_type, text")
            .eq("candidate_id", candidateId)
            .eq("is_active", true)
            .order("chunk_index", { ascending: true })
            .limit(6),
        ]);

        if (dossier.error) {
          throw dossier.error;
        }
        if (!dossier.data) {
          throw new Error(`Candidate ${candidateId} was not found.`);
        }
        if (chunks.error) {
          throw chunks.error;
        }

        return mapRemoteCandidate(dossier.data as CandidateDossierRow, (chunks.data ?? []) as CandidateChunkRow[]);
      } catch {
        return mock.getCandidate(candidateId);
      }
    },
    async compare(candidateIds, requiredSkills) {
      try {
        const payload = await invokeFunction<JsonRecord>("compare", {
          candidate_ids: candidateIds,
          required_skills: requiredSkills ?? [],
        });
        return mapRemoteComparison(payload);
      } catch {
        return mock.compare(candidateIds, requiredSkills);
      }
    },
    async ask(question, candidateIds) {
      try {
        const payload = await invokeFunction<JsonRecord>("ask", {
          question,
          candidate_ids: candidateIds,
        });
        return mapRemoteAsk(payload, candidateIds);
      } catch {
        return mock.ask(question, candidateIds);
      }
    },
    async agent(question, candidateIds = [], messages = [], tenantIds) {
      const payload = await invokeFunction<JsonRecord>("agent", {
        question,
        candidate_ids: candidateIds,
        messages,
        tenant_ids: tenantIds ?? [],
      });
      return mapRemoteAgent(payload, candidateIds);
    },
    async getOriginalDocumentUrl(storagePath, sourceUri) {
      if (supabase && storagePath) {
        try {
          const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 60 * 10);
          if (error) {
            throw error;
          }
          if (data?.signedUrl) {
            return data.signedUrl;
          }
        } catch {
          return mock.getOriginalDocumentUrl(storagePath, sourceUri);
        }
      }

      return mock.getOriginalDocumentUrl(storagePath, sourceUri);
    },
    async getParsingOverview(tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return mock.getParsingOverview();
      }

      try {
        const snapshot = await fetchParsingSnapshot(tenantIds);
        return buildParsingOverview(snapshot.documents, snapshot.candidates, snapshot.profiles, snapshot.runs);
      } catch {
        return mock.getParsingOverview();
      }
    },
    async getParsingDocument(documentId, tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return mock.getParsingDocument(documentId);
      }

      try {
        const snapshot = await fetchParsingSnapshot(tenantIds);
        const detail = buildParsingDocumentDetail(documentId, snapshot.documents, snapshot.candidates, snapshot.profiles, snapshot.runs);
        if (!detail) {
          throw new Error(`Document ${documentId} was not found.`);
        }
        return detail;
      } catch {
        return mock.getParsingDocument(documentId);
      }
    },
    async getParserProfiles(tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return mock.getParserProfiles();
      }

      try {
        const { data, error } = await supabase
          .from("parser_profiles")
          .select(
            "id, tenant_id, name, slug, description, status, extraction_provider, extraction_model, parser_version, model_version, prompt_version, chunk_version, embedding_provider, embedding_model, embedding_version, chunking_profile, ocr_enabled, allow_heuristic_fallback, prompt_template, notes, last_evaluated_at, avg_parse_percentage, avg_confidence, documents_evaluated, created_at, updated_at",
          )
          .in("tenant_id", tenantIds)
          .order("status", { ascending: true })
          .order("updated_at", { ascending: false });

        if (error) {
          throw error;
        }

        return ((data ?? []) as ParserProfileRow[]).map(mapRemoteParserProfile);
      } catch {
        return mock.getParserProfiles();
      }
    },
    async saveParserProfile(profile, tenantId) {
      if (!supabase || !tenantId) {
        return mock.saveParserProfile(profile);
      }

      try {
        const payload = {
          id: profile.id ?? undefined,
          tenant_id: tenantId,
          name: profile.name.trim(),
          slug: profile.slug.trim().toLowerCase(),
          description: profile.description,
          extraction_provider: profile.extractionProvider,
          extraction_model: profile.extractionModel,
          parser_version: profile.parserVersion,
          model_version: profile.modelVersion,
          prompt_version: profile.promptVersion,
          chunk_version: profile.chunkVersion,
          embedding_provider: profile.embeddingProvider,
          embedding_model: profile.embeddingModel,
          embedding_version: profile.embeddingVersion,
          chunking_profile: profile.chunkingProfile,
          ocr_enabled: profile.ocrEnabled,
          allow_heuristic_fallback: false,
          prompt_template: profile.promptTemplate,
          notes: profile.notes,
        };

        const mutation = profile.id
          ? supabase.from("parser_profiles").update(payload).eq("id", profile.id).select(
              "id, tenant_id, name, slug, description, status, extraction_provider, extraction_model, parser_version, model_version, prompt_version, chunk_version, embedding_provider, embedding_model, embedding_version, chunking_profile, ocr_enabled, allow_heuristic_fallback, prompt_template, notes, last_evaluated_at, avg_parse_percentage, avg_confidence, documents_evaluated, created_at, updated_at",
            ).single()
          : supabase.from("parser_profiles").insert(payload).select(
              "id, tenant_id, name, slug, description, status, extraction_provider, extraction_model, parser_version, model_version, prompt_version, chunk_version, embedding_provider, embedding_model, embedding_version, chunking_profile, ocr_enabled, allow_heuristic_fallback, prompt_template, notes, last_evaluated_at, avg_parse_percentage, avg_confidence, documents_evaluated, created_at, updated_at",
            ).single();

        const { data, error } = await mutation;

        if (error) {
          throw error;
        }

        return mapRemoteParserProfile(data as ParserProfileRow);
      } catch {
        return mock.saveParserProfile(profile);
      }
    },
    async publishParserProfile(profileId, tenantId) {
      if (!supabase || !tenantId) {
        return mock.publishParserProfile(profileId);
      }

      try {
        const { data, error } = await supabase.rpc("publish_parser_profile_v1", { p_profile_id: profileId });
        if (error) {
          throw error;
        }
        return mapRemoteParserProfile(data as ParserProfileRow);
      } catch {
        return mock.publishParserProfile(profileId);
      }
    },
    async getAnalytics() {
      return mock.getAnalytics();
    },
    async getSystemHealth() {
      return mock.getSystemHealth();
    },
    async getDataConnectors() {
      return mock.getDataConnectors();
    },
    async getIndexingWorkbench() {
      return mock.getIndexingWorkbench();
    },
    async getAccessRoster() {
      return mock.getAccessRoster();
    },
  };
}

export const platformApi = hasSupabaseConfig ? createRemoteApi() : createMockApi();
