import type {
  AccessRoster,
  AgentResponse,
  AnalyticsSnapshot,
  AskResponse,
  CandidateDetail,
  CandidateShortlistInput,
  CandidateShortlistItem,
  ComparisonResponse,
  DataConnector,
  IndexingWorkbench,
  ManatalSyncStatus,
  OpsAlert,
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
  opsAlerts,
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
import { formatSeniorityValue, normalizeLocationValue, normalizeSeniorityValue, normalizeSkillList, SEARCH_SENIORITY_TABLE, SEARCH_SKILL_TABLE } from "@/lib/searchTaxonomy";
import { hasSupabaseConfig, supabase } from "@/lib/supabaseClient";

type JsonRecord = Record<string, unknown>;

const MAX_VISIBLE_CITATIONS = 3;
const MAX_CONTEXT_BLOCKS = 6;

type PlatformApi = {
  search: (query: string, filters: SearchFilters, options?: SearchQueryOptions, tenantIds?: string[]) => Promise<SearchResponse>;
  searchDebug: (query: string, filters: SearchFilters, options?: SearchQueryOptions, tenantIds?: string[]) => Promise<SearchDebugResponse>;
  getSearchFilterOptions: (tenantIds?: string[]) => Promise<SearchFilterOptions>;
  getWorkspaceStats: (tenantIds?: string[]) => Promise<WorkspaceStats>;
  getManatalSyncStatus: (tenantIds?: string[]) => Promise<ManatalSyncStatus>;
  getManatalCandidateId: (candidateId: string) => Promise<string | null>;
  getCandidate: (candidateId: string) => Promise<CandidateDetail>;
  compare: (candidateIds: string[], requiredSkills?: string[]) => Promise<ComparisonResponse>;
  ask: (question: string, candidateIds: string[]) => Promise<AskResponse>;
  agent: (
    question: string,
    candidateIds?: string[],
    messages?: Array<{ role: "user" | "assistant"; content: string }>,
    tenantIds?: string[],
  ) => Promise<AgentResponse>;
  getOriginalDocumentUrl: (storagePath?: string | null, sourceUri?: string | null, context?: OriginalDocumentUrlContext) => Promise<string | null>;
  getShortlist: (tenantIds?: string[]) => Promise<CandidateShortlistItem[]>;
  saveShortlistItem: (item: CandidateShortlistInput) => Promise<CandidateShortlistItem>;
  removeShortlistItem: (candidateId: string, tenantId?: string | null) => Promise<void>;
  clearShortlist: (tenantIds?: string[]) => Promise<void>;
  getParsingOverview: (tenantIds?: string[], options?: ParsingOverviewOptions) => Promise<ParsingOverview>;
  getParsingDocument: (documentId: string, tenantIds?: string[]) => Promise<ParsingDocumentDetail>;
  getParserProfiles: (tenantIds?: string[]) => Promise<ParserProfile[]>;
  saveParserProfile: (profile: ParserProfileInput, tenantId?: string) => Promise<ParserProfile>;
  publishParserProfile: (profileId: string, tenantId?: string) => Promise<ParserProfile>;
  getAnalytics: () => Promise<AnalyticsSnapshot>;
  getSystemHealth: () => Promise<SystemHealth>;
  getOpsAlerts: (tenantIds?: string[]) => Promise<OpsAlert[]>;
  acknowledgeOpsAlert: (dedupeKey: string) => Promise<OpsAlert | null>;
  getDataConnectors: () => Promise<DataConnector[]>;
  getIndexingWorkbench: () => Promise<IndexingWorkbench>;
  getAccessRoster: () => Promise<AccessRoster>;
};

type OriginalDocumentUrlContext = {
  candidateId?: string | null;
  documentId?: string | null;
  tenantId?: string | null;
  tenantIds?: string[];
};

type ParsingOverviewOptions = {
  pageSize?: number;
  pageIndex?: number;
  reviewFilter?: "all" | "needsReview";
  searchQuery?: string;
};

type CandidateDossierRow = {
  candidate_id: string;
  source_document_id?: string | null;
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
  manatal_candidate_id?: string | null;
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

type CandidateSearchRow = CandidateSearchFacetRow & {
  tenant_id: string;
  candidate_id: string;
  name: string | null;
  headline: string | null;
  current_title: string | null;
  years_experience: number | null;
  primary_role: string | null;
  summary_short: string | null;
  stored_short_summary: string | null;
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

type CandidateShortlistRow = {
  user_id: string;
  tenant_id: string;
  candidate_id: string;
  candidate_name: string | null;
  current_title: string | null;
  location: string | null;
  years_experience: number | null;
  seniority: string | null;
  primary_role: string | null;
  top_skills: string[] | null;
  match_rate: number | null;
  cv_url: string | null;
  original_filename: string | null;
  source_query: string | null;
  search_snapshot: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const STORAGE_BUCKET = "cv-originals";
const SEARCH_FACET_CACHE_TTL_MS = 60_000;
const SEARCH_REST_PAGE_SIZE = 1000;

const searchFacetRowsCache = new Map<string, { expiresAt: number; promise: Promise<CandidateSearchFacetRow[]> }>();

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
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function isTimeoutError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("statement timeout") || message.includes("57014") || message.includes("canceling statement");
}

function tenantCacheKey(tenantIds?: string[]) {
  return (tenantIds ?? []).slice().sort().join("|") || "all";
}

async function fetchSearchFacetRows(tenantIds?: string[]) {
  const key = tenantCacheKey(tenantIds);
  const cached = searchFacetRowsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = (async () => {
    const payload = await invokePlatform<JsonRecord>("search_filter_options", { tenant_ids: tenantIds ?? [] });
    return [
      {
        seniority: null,
        skills: toStringArray(payload.skills),
        companies: toStringArray(payload.companies),
        location: null,
      },
      ...toStringArray(payload.seniority).map((seniority) => ({
        seniority,
        skills: [],
        companies: [],
        location: null,
      })),
      ...toStringArray(payload.locations).map((location) => ({
        seniority: null,
        skills: [],
        companies: [],
        location,
      })),
    ] satisfies CandidateSearchFacetRow[];
  })();

  searchFacetRowsCache.set(key, { expiresAt: Date.now() + SEARCH_FACET_CACHE_TTL_MS, promise });
  try {
    return await promise;
  } catch (error) {
    searchFacetRowsCache.delete(key);
    throw error;
  }
}

async function fetchWorkspaceStatsRpc(tenantIds?: string[]) {
  const row = await invokePlatform<JsonRecord>("workspace_stats", { tenant_ids: tenantIds ?? [] });
  return {
    documentCount: toNumber(row.document_count),
    candidateCount: toNumber(row.candidate_count),
    companyCount: toNumber(row.company_count),
  } satisfies WorkspaceStats;
}

async function fetchParsingOverviewSnapshotRpc(tenantIds: string[]): Promise<ParsingRemoteSnapshot> {
  const payload = await invokePlatform<JsonRecord>("parsing_overview", { tenant_ids: tenantIds });
  return {
    documents: asArray(payload.documents) as ParsingSourceDocumentRow[],
    candidates: asArray(payload.candidates) as ParsingCandidateRow[],
    profiles: asArray(payload.profiles) as ParsingProfileRow[],
    runs: asArray(payload.runs) as ParsingProcessingRunRow[],
  };
}

function mapRemoteParsingSummary(row: JsonRecord): ParsingOverview["items"][number] {
  const qualityBand = String(row.qualityBand ?? "critical");
  return {
    documentId: String(row.documentId ?? ""),
    tenantId: String(row.tenantId ?? ""),
    candidateId: typeof row.candidateId === "string" ? row.candidateId : null,
    candidateName: String(row.candidateName ?? "Unassigned candidate"),
    currentTitle: String(row.currentTitle ?? "Title not parsed"),
    originalFilename: String(row.originalFilename ?? "Unknown file"),
    mimeType: String(row.mimeType ?? "application/pdf"),
    sourceType: String(row.sourceType ?? "upload"),
    sourceUri: String(row.sourceUri ?? ""),
    uploadedAt: String(row.uploadedAt ?? ""),
    parsedPercentage: toNumber(row.parsedPercentage),
    extractionConfidence: toNumber(row.extractionConfidence),
    rawTextLength: toNumber(row.rawTextLength),
    status: String(row.status ?? "queued"),
    qualityBand: (qualityBand === "healthy" || qualityBand === "review" || qualityBand === "critical" ? qualityBand : "critical") as ParsingOverview["items"][number]["qualityBand"],
    parserVersion: String(row.parserVersion ?? "unknown"),
    modelVersion: String(row.modelVersion ?? "unknown"),
    promptVersion: String(row.promptVersion ?? "unknown"),
    embeddingVersion: String(row.embeddingVersion ?? "unknown"),
    warnings: toStringArray(row.warnings),
    missingFields: toStringArray(row.missingFields),
    keyFindings: toStringArray(row.keyFindings),
    needsAttention: Boolean(row.needsAttention),
  };
}

function mapRemoteWorkspaceRollup(row: JsonRecord) {
  return {
    tenantId: String(row.tenantId ?? ""),
    candidates: toNumber(row.candidates),
    documents: toNumber(row.documents),
    averageParse: toNumber(row.averageParse),
    needsReview: toNumber(row.needsReview),
    failed: toNumber(row.failed),
  };
}

async function fetchParsingOverviewRpc(tenantIds: string[], options: ParsingOverviewOptions = {}): Promise<ParsingOverview> {
  const pageSize = Math.max(0, Math.min(500, Math.trunc(options.pageSize ?? 100)));
  const pageIndex = Math.max(0, Math.trunc(options.pageIndex ?? 0));
  const payload = await invokePlatform<JsonRecord>("parsing_overview", {
    tenant_ids: tenantIds,
    limit: pageSize,
    offset: pageIndex * pageSize,
    needs_review_only: options.reviewFilter === "needsReview",
    query: options.searchQuery?.trim() || null,
  });
  if (Array.isArray(payload.items)) {
    return {
      overallParsedPercentage: toNumber(payload.overallParsedPercentage),
      averageConfidence: toNumber(payload.averageConfidence),
      documentsCount: toNumber(payload.documentsCount),
      completedCount: toNumber(payload.completedCount),
      needsReviewCount: toNumber(payload.needsReviewCount),
      failedCount: toNumber(payload.failedCount),
      documentsWithWarnings: toNumber(payload.documentsWithWarnings),
      missingContactCount: toNumber(payload.missingContactCount),
      lowCoverageCount: toNumber(payload.lowCoverageCount),
      itemsTotalCount: toNumber(payload.itemsTotalCount),
      pageLimit: toNumber(payload.pageLimit),
      pageOffset: toNumber(payload.pageOffset),
      workspaceRollups: asArray(payload.workspaceRollups).map((item) => mapRemoteWorkspaceRollup(asRecord(item))),
      items: asArray(payload.items).map((item) => mapRemoteParsingSummary(asRecord(item))),
    };
  }

  return buildParsingOverview(
    asArray(payload.documents) as ParsingSourceDocumentRow[],
    asArray(payload.candidates) as ParsingCandidateRow[],
    asArray(payload.profiles) as ParsingProfileRow[],
    asArray(payload.runs) as ParsingProcessingRunRow[],
  );
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(query: string) {
  return normalizeSearchText(query)
    .split(/[^a-z0-9+#.]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 12);
}

function includesAllNeedles(haystack: string, needles: string[]) {
  return needles.every((needle) => haystack.includes(normalizeSearchText(needle)));
}

const GENERIC_TITLE_QUERY_TOKENS = new Set([
  "candidate",
  "developer",
  "development",
  "dev",
  "engineer",
  "engineering",
  "expert",
  "junior",
  "lead",
  "manager",
  "mid",
  "person",
  "people",
  "principal",
  "role",
  "senior",
  "software",
  "specialist",
  "staff",
]);

function roleSearchAliases(role: string | null | undefined) {
  switch (role) {
    case "frontend":
      return ["frontend", "front end", "front-end", "web developer", "web application engineer", "ui developer"];
    case "backend":
      return ["backend", "back end", "back-end", "api developer", "server developer", "server engineer"];
    case "full-stack":
      return ["full-stack", "full stack", "fullstack"];
    case "mobile":
      return ["mobile", "android", "ios", "flutter", "react native"];
    case "devops":
      return ["devops", "sre", "kubernetes", "terraform", "platform"];
    case "data":
      return ["data", "analytics", "etl", "bi"];
    case "ml":
      return ["ml", "ai", "machine learning", "llm"];
    case "qa":
      return ["qa", "quality", "test", "automation"];
    case "security":
      return ["security", "cybersecurity", "soc"];
    default:
      return role ? [role] : [];
  }
}

function roleSkillAliases(role: string | null | undefined) {
  switch (role) {
    case "frontend":
      return ["react", "angular", "vue", "next.js", "nextjs", "javascript", "typescript", "html", "css", "tailwind", "bootstrap"];
    case "backend":
      return ["node.js", "node", "django", "flask", ".net", "asp.net", "java", "php", "laravel", "api", "rest api", "postgresql", "mysql"];
    case "full-stack":
      return ["react", "angular", "vue", "node.js", "node", ".net", "django", "laravel", "javascript", "typescript"];
    case "mobile":
      return ["android", "ios", "flutter", "react native", "swift", "kotlin", "dart"];
    case "devops":
      return ["kubernetes", "terraform", "docker", "aws", "azure", "ci/cd"];
    case "data":
      return ["data analysis", "analytics", "etl", "bi", "sql", "python", "pandas"];
    case "ml":
      return ["machine learning", "ml", "ai", "llm", "tensorflow", "pytorch"];
    case "qa":
      return ["qa", "quality assurance", "testing", "automation testing", "selenium"];
    case "security":
      return ["security", "cybersecurity", "soc", "penetration testing"];
    default:
      return [];
  }
}

function roleCompatibilityScore(row: CandidateSearchRow, role: string | null | undefined) {
  const primaryRole = normalizeSearchText(row.primary_role);
  if (!role || !primaryRole) {
    return 0;
  }
  const normalizedRole = normalizeSearchText(role);
  if (primaryRole === "full stack" && (normalizedRole === "frontend" || normalizedRole === "backend")) {
    return 0.78;
  }
  if (normalizedRole === "full stack" && primaryRole === "full stack") {
    return 0.78;
  }
  return 0;
}

function aliasHitCount(text: string, aliases: string[]) {
  return new Set(aliases.map(normalizeSearchText).filter((alias) => alias && text.includes(alias))).size;
}

function genericEngineeringTitleScore(row: CandidateSearchRow, role: string | null | undefined) {
  const title = normalizeSearchText(row.current_title);
  if (!title || !role) {
    return 0;
  }
  if (role === "frontend" && /\b(?:software|ui|front end|frontend)\b/.test(title)) {
    return 0.66;
  }
  if (role === "backend" && /\b(?:software|backend|back end|api|server)\b/.test(title)) {
    return 0.66;
  }
  return 0;
}

function roleMatchScore(row: CandidateSearchRow, role: string | null | undefined) {
  const aliases = roleSearchAliases(role).map(normalizeSearchText).filter(Boolean);
  if (!aliases.length) {
    return 0;
  }
  const titleText = normalizeSearchText(row.current_title);
  if (aliases.some((alias) => titleText.includes(alias))) {
    return 1;
  }

  const skillHits = aliasHitCount(normalizeSearchText(toStringArray(row.skills).join(" ")), roleSkillAliases(role));
  const supportScore = Math.max(genericEngineeringTitleScore(row, role), roleCompatibilityScore(row, role) * 0.86);
  if (skillHits >= 2 && supportScore > 0) {
    return Math.max(0.72, supportScore);
  }
  if (skillHits > 0 && supportScore > 0) {
    return Math.max(supportScore, 0.58);
  }
  return 0;
}

function titleIntentScore(row: CandidateSearchRow, query: string, role: string | null | undefined) {
  const title = normalizeSearchText(row.current_title);
  const skillsText = normalizeSearchText(toStringArray(row.skills).join(" "));
  const aliases = roleSearchAliases(role).map(normalizeSearchText).filter(Boolean);
  const focusTokens = tokenizeQuery(query).filter((token) => !GENERIC_TITLE_QUERY_TOKENS.has(token));

  if (aliases.some((alias) => title.includes(alias))) {
    return 1;
  }

  const titleTokenScore = focusTokens.length
    ? focusTokens.filter((token) => title.includes(token)).length / focusTokens.length
    : 0;
  const skillHits = aliasHitCount(skillsText, roleSkillAliases(role));
  const skillAliasScore = skillHits >= 2 ? 0.72 : skillHits === 1 ? 0.58 : 0;
  const skillTokenScore = focusTokens.length
    ? 0.68 * (focusTokens.filter((token) => skillsText.includes(token)).length / focusTokens.length)
    : 0;

  return Math.max(titleTokenScore, skillAliasScore, skillTokenScore, genericEngineeringTitleScore(row, role));
}

function rowMatchesFastFilters(row: CandidateSearchRow, filters: ReturnType<typeof normalizeSearchFilters>) {
  const skills = normalizeSkillList(toStringArray(row.skills)).map(normalizeSearchText);
  const companies = toStringArray(row.companies).map(normalizeSearchText);
  const location = normalizeSearchText(normalizeLocationValue(row.location) ?? row.location);
  const filterLocation = normalizeSearchText(normalizeLocationValue(filters.location) ?? filters.location);

  if (filters.role && roleMatchScore(row, filters.role) <= 0) {
    return false;
  }
  if (filters.seniority && normalizeSearchText(row.seniority) !== normalizeSearchText(filters.seniority)) {
    return false;
  }
  if (filters.min_years_experience !== null && toNumber(row.years_experience) < filters.min_years_experience) {
    return false;
  }
  if (filters.location && !location.includes(filterLocation) && !normalizeSearchText(row.location).includes(normalizeSearchText(filters.location))) {
    return false;
  }
  if (filters.skills.length && !filters.skills.some((skill) => skills.includes(normalizeSearchText(skill)))) {
    return false;
  }
  if (filters.companies.length && !filters.companies.some((company) => companies.includes(normalizeSearchText(company)))) {
    return false;
  }
  return true;
}

function fastRowScore(row: CandidateSearchRow, query: string, filters: ReturnType<typeof normalizeSearchFilters>) {
  const tokens = tokenizeQuery(query);
  const name = normalizeSearchText(row.name);
  const title = normalizeSearchText(row.current_title);
  const skills = normalizeSkillList(toStringArray(row.skills)).join(" ");
  const companies = toStringArray(row.companies).join(" ");
  const summary = normalizeSearchText(`${row.summary_short ?? ""} ${row.stored_short_summary ?? ""}`);
  const haystack = normalizeSearchText(`${name} ${title} ${skills} ${companies} ${summary} ${row.location ?? ""}`);
  const titleScore = titleIntentScore(row, query, filters.role);
  const roleScore = roleMatchScore(row, filters.role);

  if (tokens.length && !includesAllNeedles(haystack, tokens)) {
    if (!filters.role || titleScore < 0.5) {
      return 0;
    }
  }

  let score = tokens.length ? 0.08 : 0.25;
  for (const token of tokens) {
    if (name.includes(token)) {
      score += 0.34;
    }
    if (title.includes(token)) {
      score += 0.22;
    }
    if (normalizeSearchText(skills).includes(token)) {
      score += 0.16;
    }
    if (normalizeSearchText(companies).includes(token)) {
      score += 0.12;
    }
    if (summary.includes(token)) {
      score += 0.06;
    }
  }

  if (filters.role && title.includes(normalizeSearchText(filters.role))) {
    score += 0.14;
  }
  score = Math.max(score, titleScore * 0.82, roleScore * 0.76);
  if (filters.skills.length) {
    const skillSet = new Set(normalizeSkillList(toStringArray(row.skills)).map(normalizeSearchText));
    score += 0.18 * (filters.skills.filter((skill) => skillSet.has(normalizeSearchText(skill))).length / filters.skills.length);
  }
  if (filters.min_years_experience !== null) {
    score += 0.08 * Math.min(1, toNumber(row.years_experience) / Math.max(1, filters.min_years_experience));
  }

  if (filters.role && roleScore <= 0 && titleScore < 0.5) {
    score *= 0.35;
  }

  if (filters.role && titleScore >= 0.9) {
    score += 0.06;
  }

  return Math.min(0.99, score);
}

function mapFastSearchRow(row: CandidateSearchRow, score: number): SearchResponse["results"][number] {
  const matchRate = Math.round(Math.max(1, Math.min(99, score * 100)));
  const summary = String(row.summary_short ?? row.stored_short_summary ?? "");
  return {
    tenantId: row.tenant_id,
    candidateId: row.candidate_id,
    name: String(row.name ?? "Unknown candidate"),
    currentTitle: String(row.current_title ?? "Candidate"),
    headline: summary || String(row.headline ?? row.current_title ?? "Candidate"),
    location: String(row.location ?? "Unknown"),
    yearsExperience: toNumber(row.years_experience),
    seniority: String(row.seniority ?? "unknown"),
    primaryRole: String(row.primary_role ?? "generalist"),
    topSkills: toStringArray(row.skills).slice(0, 8),
    matchScore: matchRate,
    backendMatchRate: matchRate,
    backendScoreRaw: score,
    matchSignals: {
      semantic: 0,
      skill: 0,
      experience: 0,
    },
    shortSummary: summary,
    strengths: [],
    risks: [],
    recommendedRoles: [],
    stage: "Retrieved",
    avatarHue: hueFromId(row.candidate_id),
    matchNarrative: summary || "Fast fallback result from candidate profile fields.",
  };
}

async function runFastRestSearch(
  query: string,
  filters: ReturnType<typeof normalizeSearchFilters>,
  options?: SearchQueryOptions,
  tenantIds?: string[],
): Promise<SearchResponse> {
  void query;
  void filters;
  void options;
  void tenantIds;
  throw new Error("Backend search fallback is unavailable; use the search Edge Function.");
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
    location: normalizeLocationValue(filters.location, { allowFallback: false }) ?? null,
    skills: normalizeSkillList(filters.skills ?? []),
    companies: dedupeSorted((filters.companies ?? []).map((company) => company.trim())),
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
  void query;
  void filters;
  void options;
  void tenantIds;
  throw new Error("Direct Supabase search RPC fallback has been disabled; use the search Edge Function.");
}

async function runDirectSearchDebugRpc(
  query: string,
  filters: ReturnType<typeof normalizeSearchFilters>,
  options?: SearchQueryOptions,
  tenantIds?: string[],
) {
  void query;
  void filters;
  void options;
  void tenantIds;
  throw new Error("Direct Supabase search debug RPC fallback has been disabled; use the search-debug Edge Function.");
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

async function invokePlatform<T>(action: string, body: JsonRecord = {}): Promise<T> {
  return invokeFunction<T>("platform", { action, ...body });
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

  return fetchParsingOverviewSnapshotRpc(tenantIds);
}

async function fetchParsingDocumentSnapshot(documentId: string, tenantIds: string[]): Promise<ParsingRemoteSnapshot> {
  const payload = await invokePlatform<JsonRecord>("parsing_document", {
    document_id: documentId,
    tenant_ids: tenantIds,
  });
  return {
    documents: asArray(payload.documents) as ParsingSourceDocumentRow[],
    candidates: asArray(payload.candidates) as ParsingCandidateRow[],
    profiles: asArray(payload.profiles) as ParsingProfileRow[],
    runs: asArray(payload.runs) as ParsingProcessingRunRow[],
  };
}

async function countRemoteRows(table: string, tenantIds: string[], apply?: (query: any) => any): Promise<number> {
  if (!supabase) {
    return 0;
  }
  let query: any = supabase.from(table).select("*", { count: "exact", head: true });
  if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }
  if (apply) {
    query = apply(query);
  }
  const { count, error } = await query;
  if (error) {
    throw error;
  }
  return count ?? 0;
}

function percent(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

function mapManatalSyncRow(row: JsonRecord): ManatalSyncStatus["recentRows"][number] {
  return {
    manatalCandidateId: String(row.manatal_candidate_id ?? ""),
    candidateName: String(row.manatal_full_name ?? "Unknown candidate"),
    email: typeof row.manatal_email === "string" && row.manatal_email ? row.manatal_email : null,
    syncStatus: String(row.sync_status ?? "unknown"),
    lastSyncedAt: typeof row.last_synced_at === "string" ? row.last_synced_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    sourceDocumentId: typeof row.source_document_id === "string" ? row.source_document_id : null,
    errorMessage: typeof row.error_message === "string" && row.error_message ? row.error_message : null,
  };
}

async function fetchManatalSyncStatusDirect(tenantIds: string[]): Promise<ManatalSyncStatus> {
  if (!supabase || !tenantIds.length) {
    return createMockApi().getManatalSyncStatus(tenantIds);
  }

  const [
    sourceDocuments,
    gcsOriginals,
    driveOriginals,
    manatalRows,
    mappedManatalRows,
    syncedRows,
    pendingRows,
    failedRows,
    skippedRows,
  ] = await Promise.all([
    countRemoteRows("source_documents", tenantIds),
    countRemoteRows("source_documents", tenantIds, (query) => query.like("source_uri", "gs://%")),
    countRemoteRows("source_documents", tenantIds, (query) => query.ilike("source_uri", "%drive.google.com%")),
    countRemoteRows("manatal_candidate_sync", tenantIds),
    countRemoteRows("manatal_candidate_sync", tenantIds, (query) => query.not("source_document_id", "is", null)),
    countRemoteRows("manatal_candidate_sync", tenantIds, (query) => query.eq("sync_status", "synced")),
    countRemoteRows("manatal_candidate_sync", tenantIds, (query) => query.eq("sync_status", "pending")),
    countRemoteRows("manatal_candidate_sync", tenantIds, (query) => query.eq("sync_status", "failed")),
    countRemoteRows("manatal_candidate_sync", tenantIds, (query) => query.eq("sync_status", "skipped")),
  ]);

  const recentResult = await supabase
    .from("manatal_candidate_sync")
    .select("manatal_candidate_id, manatal_full_name, manatal_email, sync_status, last_synced_at, updated_at, source_document_id, error_message")
    .in("tenant_id", tenantIds)
    .order("updated_at", { ascending: false })
    .limit(12);
  if (recentResult.error) {
    throw recentResult.error;
  }

  const lastSyncedResult = await supabase
    .from("manatal_candidate_sync")
    .select("last_synced_at")
    .in("tenant_id", tenantIds)
    .eq("sync_status", "synced")
    .not("last_synced_at", "is", null)
    .order("last_synced_at", { ascending: false })
    .limit(1);
  if (lastSyncedResult.error) {
    throw lastSyncedResult.error;
  }

  const lastFailureResult = await supabase
    .from("manatal_candidate_sync")
    .select("manatal_candidate_id, manatal_full_name, error_message, updated_at")
    .in("tenant_id", tenantIds)
    .eq("sync_status", "failed")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (lastFailureResult.error) {
    throw lastFailureResult.error;
  }

  const lastSynced = asRecord(asArray(lastSyncedResult.data)[0]);
  const lastFailure = asRecord(asArray(lastFailureResult.data)[0]);
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      sourceDocuments,
      gcsOriginals,
      driveOriginals,
      manatalRows,
      mappedManatalRows,
      syncedRows,
      pendingRows,
      failedRows,
      skippedRows,
    },
    coverage: {
      gcsOriginalsPercent: percent(gcsOriginals, sourceDocuments),
      manatalSyncedPercent: percent(syncedRows, manatalRows),
      mappedRowsPercent: percent(mappedManatalRows, manatalRows),
    },
    lastSyncedAt: typeof lastSynced.last_synced_at === "string" ? lastSynced.last_synced_at : null,
    lastFailure: lastFailure.manatal_candidate_id
      ? {
          manatalCandidateId: String(lastFailure.manatal_candidate_id),
          candidateName: String(lastFailure.manatal_full_name ?? "Unknown candidate"),
          errorMessage: String(lastFailure.error_message ?? ""),
          updatedAt: typeof lastFailure.updated_at === "string" ? lastFailure.updated_at : null,
        }
      : null,
    recentRows: asArray(recentResult.data).map((row) => mapManatalSyncRow(asRecord(row))),
  };
}

function isBrowserOpenableSource(sourceUri?: string | null) {
  return Boolean(sourceUri && /^(https?:)?\/\//i.test(sourceUri));
}

function isGcsSource(sourceUri?: string | null) {
  return Boolean(sourceUri && sourceUri.startsWith("gs://"));
}

function buildCandidateCvUrl(sourceUri?: string | null) {
  return isBrowserOpenableSource(sourceUri) ? sourceUri ?? null : null;
}

async function fetchCandidateDetailDirect(candidateId: string): Promise<CandidateDetail> {
  if (!supabase) {
    return createMockApi().getCandidate(candidateId);
  }

  const [dossier, chunks] = await Promise.all([
    supabase
      .from("candidate_dossier_v1")
      .select(
        "candidate_id, source_document_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, email, phone, links, summary_short, short_summary, long_summary, strengths, risks, recommended_roles, timeline_json, profile_json, original_filename, mime_type, storage_path, source_uri, confidence",
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

  return mapRemoteCandidate(
    { ...(asRecord(dossier.data) as CandidateDossierRow), manatal_candidate_id: await fetchManatalCandidateIdByCandidateId(candidateId) },
    asArray(chunks.data) as CandidateChunkRow[],
  );
}

async function fetchManatalCandidateIdByCandidateId(candidateId: string): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  const dossierResult = await supabase
    .from("candidate_dossier_v1")
    .select("source_document_id")
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (dossierResult.error) {
    throw dossierResult.error;
  }

  const sourceDocumentId = typeof dossierResult.data?.source_document_id === "string" ? dossierResult.data.source_document_id : "";
  if (!sourceDocumentId) {
    return null;
  }

  const syncResult = await supabase
    .from("manatal_candidate_sync")
    .select("manatal_candidate_id")
    .eq("source_document_id", sourceDocumentId)
    .limit(1);
  if (syncResult.error) {
    throw syncResult.error;
  }

  const row = asRecord(asArray(syncResult.data)[0]);
  return typeof row.manatal_candidate_id === "string" ? row.manatal_candidate_id : null;
}

function mapRemoteSearch(payload: JsonRecord): SearchResponse {
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
    citations: asArray(payload.citations).slice(0, MAX_VISIBLE_CITATIONS).map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    contextBlocks: asArray(payload.context_blocks).slice(0, MAX_CONTEXT_BLOCKS).map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
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
    citations: asArray(payload.citations).slice(0, MAX_VISIBLE_CITATIONS).map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    contextBlocks: asArray(payload.context_blocks).slice(0, MAX_CONTEXT_BLOCKS).map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
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

function mapRemoteShortlistItem(row: CandidateShortlistRow): CandidateShortlistItem {
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

function normalizeOpsSeverity(value: unknown): OpsAlert["severity"] {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3" ? value : "P3";
}

function normalizeOpsStatus(value: unknown): OpsAlert["status"] {
  return value === "firing" || value === "acknowledged" || value === "resolved" ? value : "firing";
}

function mapRemoteOpsAlert(row: unknown): OpsAlert {
  const record = asRecord(row);
  return {
    dedupeKey: String(record.dedupe_key ?? record.dedupeKey ?? ""),
    severity: normalizeOpsSeverity(record.severity),
    component: String(record.component ?? "system"),
    tenantId: typeof record.tenant_id === "string" ? record.tenant_id : typeof record.tenantId === "string" ? record.tenantId : null,
    alertKey: String(record.alert_key ?? record.alertKey ?? "alert"),
    status: normalizeOpsStatus(record.status),
    message: String(record.message ?? ""),
    currentValue: record.current_value === null || record.current_value === undefined ? null : toNumber(record.current_value, 0),
    threshold: record.threshold === null || record.threshold === undefined ? null : toNumber(record.threshold, 0),
    runbookUrl: typeof record.runbook_url === "string" ? record.runbook_url : typeof record.runbookUrl === "string" ? record.runbookUrl : null,
    firstSeenAt: String(record.first_seen_at ?? record.firstSeenAt ?? new Date().toISOString()),
    lastSeenAt: String(record.last_seen_at ?? record.lastSeenAt ?? new Date().toISOString()),
    context: asRecord(record.context_json ?? record.context),
  };
}

function shortlistInputPayload(item: CandidateShortlistInput) {
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

const mockShortlistItems = new Map<string, CandidateShortlistItem>();

function mapRemoteCandidate(row: CandidateDossierRow, chunks: CandidateChunkRow[]): CandidateDetail {
  const profile = asRecord(row.profile_json);
  const cvUrl = buildCandidateCvUrl(row.source_uri);
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
    originalFilename: row.original_filename,
    sourceUri: row.source_uri,
    storagePath: row.storage_path,
    cvUrl,
    manatalCandidateId: row.manatal_candidate_id ?? null,
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
      row.original_filename ? `CV file: ${row.original_filename}` : "",
      row.mime_type ? `MIME type: ${row.mime_type}` : "",
      cvUrl ? `Drive link: ${cvUrl}` : "",
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
          intentSource: "explicit",
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
    async getManatalSyncStatus(_tenantIds) {
      await wait(90);
      const generatedAt = new Date().toISOString();
      return {
        generatedAt,
        totals: {
          sourceDocuments: 2074,
          gcsOriginals: 1447,
          driveOriginals: 627,
          manatalRows: 3171,
          mappedManatalRows: 1581,
          syncedRows: 1447,
          pendingRows: 1590,
          failedRows: 1,
          skippedRows: 120,
        },
        coverage: {
          gcsOriginalsPercent: 70,
          manatalSyncedPercent: 46,
          mappedRowsPercent: 50,
        },
        lastSyncedAt: generatedAt,
        lastFailure: {
          manatalCandidateId: "145496734",
          candidateName: "Deleted Manatal candidate",
          errorMessage: "No Candidate matches the given query.",
          updatedAt: generatedAt,
        },
        recentRows: [
          {
            manatalCandidateId: "141886959",
            candidateName: "Abdalrahmaan Mohammad Alsayed",
            email: "candidate@example.com",
            syncStatus: "synced",
            lastSyncedAt: generatedAt,
            updatedAt: generatedAt,
            sourceDocumentId: "1b21c0a0-792a-5291-ae8e-529f1350f79d",
            errorMessage: null,
          },
        ],
      };
    },
    async getManatalCandidateId(_candidateId) {
      await wait(40);
      return null;
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
    async getOriginalDocumentUrl(storagePath, sourceUri, _context) {
      await wait(40);
      if (isBrowserOpenableSource(sourceUri)) {
        return sourceUri ?? null;
      }
      return null;
    },
    async getShortlist(tenantIds) {
      await wait(60);
      const allowedTenantIds = new Set(tenantIds ?? []);
      return Array.from(mockShortlistItems.values())
        .filter((item) => !allowedTenantIds.size || allowedTenantIds.has(item.tenantId))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    async saveShortlistItem(item) {
      await wait(70);
      const now = new Date().toISOString();
      const key = `${item.tenantId}:${item.candidateId}`;
      const current = mockShortlistItems.get(key);
      const saved: CandidateShortlistItem = {
        userId: "mock-user",
        tenantId: item.tenantId,
        candidateId: item.candidateId,
        candidateName: item.candidateName,
        currentTitle: item.currentTitle,
        location: item.location,
        yearsExperience: item.yearsExperience ?? null,
        seniority: item.seniority ?? null,
        primaryRole: item.primaryRole ?? null,
        topSkills: item.topSkills ?? [],
        matchRate: item.matchRate ?? null,
        cvUrl: item.cvUrl ?? null,
        originalFilename: item.originalFilename ?? null,
        sourceQuery: item.sourceQuery ?? "",
        searchSnapshot: item.searchSnapshot ?? {},
        notes: item.notes ?? "",
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
      mockShortlistItems.set(key, saved);
      return saved;
    },
    async removeShortlistItem(candidateId, tenantId) {
      await wait(50);
      for (const [key, item] of mockShortlistItems.entries()) {
        if (item.candidateId === candidateId && (!tenantId || item.tenantId === tenantId)) {
          mockShortlistItems.delete(key);
        }
      }
    },
    async clearShortlist(tenantIds) {
      await wait(60);
      const allowedTenantIds = new Set(tenantIds ?? []);
      for (const [key, item] of mockShortlistItems.entries()) {
        if (!allowedTenantIds.size || allowedTenantIds.has(item.tenantId)) {
          mockShortlistItems.delete(key);
        }
      }
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
    async getOpsAlerts() {
      await wait(80);
      return opsAlerts;
    },
    async acknowledgeOpsAlert(dedupeKey) {
      await wait(80);
      const alert = opsAlerts.find((item) => item.dedupeKey === dedupeKey);
      return alert ? { ...alert, status: "acknowledged" } : null;
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
        throw new Error(`Live search failed. Edge Function error: ${errorMessage(functionError)}.`);
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
        throw new Error(`Live search debug failed. Edge Function error: ${errorMessage(functionError)}.`);
      }
    },
    async getSearchFilterOptions(tenantIds) {
      if (!supabase) {
        return mock.getSearchFilterOptions();
      }

      try {
        return mapSearchFilterOptions(await fetchSearchFacetRows(tenantIds));
      } catch {
        return createEmptySearchFilterOptions();
      }
    },
    async getWorkspaceStats(tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return createEmptyWorkspaceStats();
      }

      try {
        return await fetchWorkspaceStatsRpc(tenantIds);
      } catch {
        return createEmptyWorkspaceStats();
      }
    },
    async getManatalSyncStatus(tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return mock.getManatalSyncStatus(tenantIds);
      }

      try {
        return await invokePlatform<ManatalSyncStatus>("manatal_sync_status", { tenant_ids: tenantIds });
      } catch {
        return fetchManatalSyncStatusDirect(tenantIds);
      }
    },
    async getManatalCandidateId(candidateId) {
      try {
        return await fetchManatalCandidateIdByCandidateId(candidateId);
      } catch {
        return null;
      }
    },
    async getCandidate(candidateId) {
      if (!supabase) {
        return mock.getCandidate(candidateId);
      }

      try {
        const payload = await invokePlatform<JsonRecord>("candidate_detail", { candidate_id: candidateId });
        return mapRemoteCandidate(asRecord(payload.dossier) as CandidateDossierRow, asArray(payload.chunks) as CandidateChunkRow[]);
      } catch {
        return fetchCandidateDetailDirect(candidateId);
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
    async getOriginalDocumentUrl(storagePath, sourceUri, context) {
      if (supabase && (context?.candidateId || context?.documentId)) {
        try {
          const payload = await invokePlatform<JsonRecord>("original_document_url", {
            candidate_id: context.candidateId ?? undefined,
            document_id: context.documentId ?? undefined,
            tenant_id: context.tenantId ?? undefined,
            tenant_ids: context.tenantIds ?? [],
          });
          const url = typeof payload.url === "string" ? payload.url : null;
          if (url) {
            return url;
          }
        } catch {
          if (isBrowserOpenableSource(sourceUri)) {
            return sourceUri ?? null;
          }
          if (isGcsSource(sourceUri)) {
            throw new Error("This original CV is private in GCS, but signed URL access is not configured yet.");
          }
        }
      }

      if (supabase && storagePath && !isGcsSource(sourceUri)) {
        try {
          const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 60 * 10);
          if (error) {
            throw error;
          }
          if (data?.signedUrl) {
            return data.signedUrl;
          }
        } catch {
          if (isBrowserOpenableSource(sourceUri)) {
            return sourceUri ?? null;
          }
          return null;
        }
      }

      return mock.getOriginalDocumentUrl(storagePath, sourceUri);
    },
    async getShortlist(tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return mock.getShortlist(tenantIds);
      }

      try {
        const rows = await invokePlatform<CandidateShortlistRow[]>("shortlist_items", { tenant_ids: tenantIds });
        return (rows ?? []).map(mapRemoteShortlistItem);
      } catch {
        return [];
      }
    },
    async saveShortlistItem(item) {
      if (!supabase) {
        return mock.saveShortlistItem(item);
      }

      const row = await invokePlatform<CandidateShortlistRow>("save_shortlist_item", {
        item: shortlistInputPayload(item),
      });
      return mapRemoteShortlistItem(row);
    },
    async removeShortlistItem(candidateId, tenantId) {
      if (!supabase) {
        return mock.removeShortlistItem(candidateId, tenantId);
      }

      await invokePlatform("delete_shortlist_item", {
        candidate_id: candidateId,
        tenant_id: tenantId ?? null,
      });
    },
    async clearShortlist(tenantIds) {
      if (!supabase) {
        return mock.clearShortlist(tenantIds);
      }

      await invokePlatform("clear_shortlist_items", {
        tenant_ids: tenantIds ?? [],
      });
    },
    async getParsingOverview(tenantIds, options) {
      if (!supabase || !tenantIds?.length) {
        return mock.getParsingOverview();
      }

      try {
        return fetchParsingOverviewRpc(tenantIds, options);
      } catch (error) {
        throw new Error(`Unable to load live parsing diagnostics: ${errorMessage(error)}`);
      }
    },
    async getParsingDocument(documentId, tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return mock.getParsingDocument(documentId);
      }

      try {
        const snapshot = await fetchParsingDocumentSnapshot(documentId, tenantIds);
        const detail = buildParsingDocumentDetail(documentId, snapshot.documents, snapshot.candidates, snapshot.profiles, snapshot.runs);
        if (!detail) {
          throw new Error(`Document ${documentId} was not found.`);
        }
        return detail;
      } catch (error) {
        throw new Error(`Unable to load live parsing document ${documentId}: ${errorMessage(error)}`);
      }
    },
    async getParserProfiles(tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return mock.getParserProfiles();
      }

      try {
        const data = await invokePlatform<ParserProfileRow[]>("parser_profiles", { tenant_ids: tenantIds });
        return (data ?? []).map(mapRemoteParserProfile);
      } catch {
        return mock.getParserProfiles();
      }
    },
    async saveParserProfile(profile, tenantId) {
      if (!supabase || !tenantId) {
        return mock.saveParserProfile(profile);
      }

      try {
        const data = await invokePlatform<ParserProfileRow>("save_parser_profile", {
          tenant_id: tenantId,
          profile,
        });
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
        const data = await invokePlatform<ParserProfileRow>("publish_parser_profile", { profile_id: profileId });
        return mapRemoteParserProfile(data as ParserProfileRow);
      } catch {
        return mock.publishParserProfile(profileId);
      }
    },
    async getAnalytics() {
      return mock.getAnalytics();
    },
    async getSystemHealth() {
      try {
        return await invokePlatform<SystemHealth>("system_health");
      } catch {
        return mock.getSystemHealth();
      }
    },
    async getOpsAlerts(tenantIds) {
      try {
        const rows = await invokePlatform<unknown[]>("ops_alerts", { tenant_ids: tenantIds ?? [] });
        return (rows ?? []).map(mapRemoteOpsAlert);
      } catch {
        return mock.getOpsAlerts();
      }
    },
    async acknowledgeOpsAlert(dedupeKey) {
      try {
        const row = await invokePlatform<unknown>("ops_ack_alert", { dedupe_key: dedupeKey });
        return row ? mapRemoteOpsAlert(row) : null;
      } catch {
        return null;
      }
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
