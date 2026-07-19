import type {
  AccessRoster,
  AccountProvisionResult,
  MembershipRole,
  TenantAdminSummary,
  AgentResponse,
  AnalyticsSnapshot,
  AskResponse,
  CandidateDetail,
  CandidateListFilters,
  CandidateListGroup,
  CandidateListGroupBy,
  CandidateListItem,
  CandidateListOptions,
  CandidateListResponse,
  CandidateShortlistInput,
  ComparisonResponse,
  DataConnector,
  EmployerRegion,
  IndexingWorkbench,
  InsightReportInput,
  InsightReportRun,
  InsightReportRunDetail,
  JobApplicationStatus,
  JobCandidateMatch,
  JobExtractionResult,
  JobMatchingRun,
  JobMatchingRunDetail,
  JobPostingInput,
  JobPostingStatus,
  JobShortlist,
  JobShortlistCandidate,
  JobShortlistDetail,
  JobShortlistInput,
  ManatalSyncStatus,
  OpsAlert,
  PlatformRuntimeConfig,
  PlatformRuntimeConfigSource,
  PublicJobApplicationInput,
  PublicJobApplicationReceipt,
  PublicJobPosting,
  ParsingDocumentDetail,
  ParsingOverview,
  ParserProfile,
  ParserProfileInput,
  SystemHealth,
  WorkspaceStats,
} from "@/lib/contracts";
import {
  isBrowserOpenableSource,
  isGcsSource,
  mapEvidenceSnippet,
  mapRemoteCandidate,
} from "@/features/candidates/apiMappers";
import { fetchCandidatesListRpc } from "@/features/candidates/apiMappers";
import {
  mapRemoteInsightsDashboard,
  mapRemoteInsightsGapAnalysis,
} from "@/features/insights/api";
import {
  mapRemoteInsightReportRun,
  mapRemoteInsightReportRunDetail,
} from "@/features/insights/reportApiMappers";
import { buildMockInsightReport } from "@/features/insights/insightReport.helpers";
import {
  jobPostingPayload,
  mapPublicReceipt,
  mapRemoteJobApplication,
  mapRemoteJobApplicationLink,
  mapRemoteJobApplicationSourceCategory,
  mapRemoteJobExtraction,
  mapRemoteJobMatchingRun,
  mapRemoteJobMatchingRunDetail,
  mapRemoteJobPosting,
  mapRemoteJobShortlist,
  mapRemoteJobShortlistDetail,
  mapRemotePublicJob,
  publicApplicationPayload,
} from "@/features/jobs/apiMappers";
import {
  createEmptySearchFilterOptions,
  mapRemoteSearch,
  mapRemoteSearchDebug,
  mapRemoteShortlistItem,
  mapSearchFilterOptions,
  normalizeSearchFilters,
  shortlistInputPayload,
} from "@/features/search/apiMappers";
import { invokeFunction, invokePlatform } from "@/lib/api/platformClient";
import {
  asArray,
  asRecord,
  errorMessage,
  nullableString,
  toNumber,
  toStringArray,
  type JsonRecord,
} from "@/lib/api/json";
import {
  buildParsingDocumentDetail,
  buildParsingOverview,
} from "@/lib/parsingQuality";
import type {
  CandidateChunkRow,
  CandidateDossierRow,
  CandidateSearchFacetRow,
  CandidateShortlistRow,
  ParserProfileRow,
  ParsingCandidateRow,
  ParsingProcessingRunRow,
  ParsingProfileRow,
  ParsingRemoteSnapshot,
  ParsingSourceDocumentRow,
} from "@/lib/api/platformRows";
import type {
  OriginalDocumentUrlContext,
  ParsingOverviewOptions,
  PlatformApi,
} from "@/lib/platformApiTypes";
import { hasSupabaseConfig } from "@/lib/supabaseClient";

const MAX_VISIBLE_CITATIONS = 3;
const MAX_CONTEXT_BLOCKS = 6;
const SEARCH_FACET_CACHE_TTL_MS = 60_000;

const searchFacetRowsCache = new Map<
  string,
  { expiresAt: number; promise: Promise<CandidateSearchFacetRow[]> }
>();

type PlatformApiMethod = (...args: unknown[]) => Promise<unknown>;

let mockApiPromise: Promise<PlatformApi> | null = null;

async function getMockApi() {
  mockApiPromise ??= import("@/lib/api/mockPlatformApi").then(
    ({ createMockApi }) => createMockApi(),
  );
  return mockApiPromise;
}

function createLazyMockApi(): PlatformApi {
  return new Proxy({} as PlatformApi, {
    get(_target, property) {
      if (typeof property !== "string") {
        return undefined;
      }

      return async (...args: unknown[]) => {
        const api = await getMockApi();
        const method = api[property as keyof PlatformApi];
        if (typeof method !== "function") {
          throw new Error(`Mock API method ${property} is not implemented.`);
        }
        return (method as PlatformApiMethod)(...args);
      };
    },
  });
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
    const payload = await invokePlatform<JsonRecord>("search_filter_options", {
      tenant_ids: tenantIds ?? [],
    });
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

  searchFacetRowsCache.set(key, {
    expiresAt: Date.now() + SEARCH_FACET_CACHE_TTL_MS,
    promise,
  });
  try {
    return await promise;
  } catch (error) {
    searchFacetRowsCache.delete(key);
    throw error;
  }
}

async function fetchWorkspaceStatsRpc(tenantIds?: string[]) {
  const row = await invokePlatform<JsonRecord>("workspace_stats", {
    tenant_ids: tenantIds ?? [],
  });
  return {
    documentCount: toNumber(row.document_count),
    candidateCount: toNumber(row.candidate_count),
    companyCount: toNumber(row.company_count),
  } satisfies WorkspaceStats;
}

async function fetchParsingOverviewSnapshotRpc(
  tenantIds: string[],
): Promise<ParsingRemoteSnapshot> {
  const payload = await invokePlatform<JsonRecord>("parsing_overview", {
    tenant_ids: tenantIds,
  });
  return {
    documents: asArray(payload.documents) as ParsingSourceDocumentRow[],
    candidates: asArray(payload.candidates) as ParsingCandidateRow[],
    profiles: asArray(payload.profiles) as ParsingProfileRow[],
    runs: asArray(payload.runs) as ParsingProcessingRunRow[],
  };
}

function mapRemoteParsingSummary(
  row: JsonRecord,
): ParsingOverview["items"][number] {
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
    qualityBand: (qualityBand === "healthy" ||
    qualityBand === "review" ||
    qualityBand === "critical"
      ? qualityBand
      : "critical") as ParsingOverview["items"][number]["qualityBand"],
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

async function fetchParsingOverviewRpc(
  tenantIds: string[],
  options: ParsingOverviewOptions = {},
): Promise<ParsingOverview> {
  const pageSize = Math.max(
    0,
    Math.min(500, Math.trunc(options.pageSize ?? 100)),
  );
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
      workspaceRollups: asArray(payload.workspaceRollups).map((item) =>
        mapRemoteWorkspaceRollup(asRecord(item)),
      ),
      items: asArray(payload.items).map((item) =>
        mapRemoteParsingSummary(asRecord(item)),
      ),
    };
  }

  return buildParsingOverview(
    asArray(payload.documents) as ParsingSourceDocumentRow[],
    asArray(payload.candidates) as ParsingCandidateRow[],
    asArray(payload.profiles) as ParsingProfileRow[],
    asArray(payload.runs) as ParsingProcessingRunRow[],
  );
}

function createEmptyWorkspaceStats(): WorkspaceStats {
  return {
    documentCount: 0,
    candidateCount: 0,
    companyCount: 0,
  };
}

async function fetchParsingDocumentSnapshot(
  documentId: string,
  tenantIds: string[],
): Promise<ParsingRemoteSnapshot> {
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

function mapRemoteComparison(payload: JsonRecord): ComparisonResponse {
  const nested = asRecord(payload.comparison);
  const normalized = Object.keys(nested).length ? nested : payload;
  const rawItems = asArray(normalized.items);

  return {
    source: String(
      payload.source ?? normalized.source ?? "deterministic_fallback",
    ) as ComparisonResponse["source"],
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
        currentTitle: String(
          record.current_title ?? record.currentTitle ?? "Candidate",
        ),
        yearsExperience: toNumber(
          record.years_experience ?? record.yearsExperience,
        ),
        seniority: String(record.seniority ?? "unknown"),
        score: toNumber(record.score),
        matchedSkills: toStringArray(
          record.matched_skills ?? record.matchedSkills,
        ),
        gaps: toStringArray(record.gaps),
        strengths: toStringArray(record.strengths),
        risks: toStringArray(record.risks),
        summary: String(record.summary ?? ""),
      };
    }),
    meta: {
      comparedCount: toNumber(
        asRecord(normalized.meta).compared_count ??
          asRecord(normalized.meta).comparedCount,
        rawItems.length,
      ),
    },
  };
}

function mapRemoteAsk(
  payload: JsonRecord,
  candidateIds: string[],
): AskResponse {
  return {
    intent: String(payload.intent ?? "why_matched"),
    facts: asArray(payload.facts).map((row) => {
      const record = asRecord(row);
      return {
        candidateId: String(record.candidate_id ?? record.candidateId),
        candidateName: String(
          record.candidate_name ?? record.candidateName ?? "Candidate",
        ),
        fact: String(record.fact ?? ""),
      };
    }),
    citations: asArray(payload.citations)
      .slice(0, MAX_VISIBLE_CITATIONS)
      .map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    contextBlocks: asArray(payload.context_blocks)
      .slice(0, MAX_CONTEXT_BLOCKS)
      .map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    extractiveAnswer: String(payload.extractive_answer ?? ""),
    meta: {
      candidateCount: toNumber(
        asRecord(payload.meta).candidate_count,
        candidateIds.length,
      ),
      topK: toNumber(asRecord(payload.meta).top_k, 6),
      answerSource: String(asRecord(payload.meta).answer_source ?? "remote"),
      scopeSource: String(
        asRecord(payload.meta).scope_source ??
          (candidateIds.length ? "explicit" : "retrieved"),
      ) as AskResponse["meta"]["scopeSource"],
      resolvedCandidateIds: toStringArray(
        asRecord(payload.meta).resolved_candidate_ids,
      ),
    },
  };
}

function mapRemoteAgent(
  payload: JsonRecord,
  candidateIds: string[],
): AgentResponse {
  return {
    answer: String(payload.answer ?? payload.extractive_answer ?? ""),
    citations: asArray(payload.citations)
      .slice(0, MAX_VISIBLE_CITATIONS)
      .map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    contextBlocks: asArray(payload.context_blocks)
      .slice(0, MAX_CONTEXT_BLOCKS)
      .map((row, index) => mapEvidenceSnippet(asRecord(row), index)),
    meta: {
      candidateCount: toNumber(
        asRecord(payload.meta).candidate_count,
        candidateIds.length,
      ),
      topK: toNumber(asRecord(payload.meta).top_k, 6),
      answerSource: String(asRecord(payload.meta).answer_source ?? "remote"),
      scopeSource: String(
        asRecord(payload.meta).scope_source ??
          (candidateIds.length ? "explicit" : "retrieved"),
      ) as AgentResponse["meta"]["scopeSource"],
      resolvedCandidateIds: toStringArray(
        asRecord(payload.meta).resolved_candidate_ids,
      ),
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

function normalizeOpsSeverity(value: unknown): OpsAlert["severity"] {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3"
    ? value
    : "P3";
}

function normalizeOpsStatus(value: unknown): OpsAlert["status"] {
  return value === "firing" || value === "acknowledged" || value === "resolved"
    ? value
    : "firing";
}

function mapTenantAdminSummary(row: unknown): TenantAdminSummary {
  const record = asRecord(row);
  return {
    tenantId: String(record.tenantId ?? record.tenant_id ?? ""),
    slug: String(record.slug ?? ""),
    name: String(record.name ?? ""),
    iconUrl: String(record.iconUrl ?? record.icon_url ?? ""),
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt
        : typeof record.created_at === "string"
          ? record.created_at
          : null,
    membershipCount: toNumber(
      record.membershipCount ?? record.membership_count,
    ),
    candidateCount: toNumber(record.candidateCount ?? record.candidate_count),
    documentCount: toNumber(record.documentCount ?? record.document_count),
  };
}

function mapRuntimeConfigSource(value: unknown): PlatformRuntimeConfigSource {
  return value === "database" || value === "environment" || value === "unset"
    ? value
    : "unset";
}

function mapPlatformRuntimeConfig(payload: unknown): PlatformRuntimeConfig {
  const record = asRecord(payload);
  const settings = Array.isArray(record.settings)
    ? record.settings.map((item) => {
        const row = asRecord(item);
        return {
          key: typeof row.key === "string" ? row.key : "",
          value: typeof row.value === "string" ? row.value : null,
          source: mapRuntimeConfigSource(row.source),
          envName:
            typeof row.envName === "string"
              ? row.envName
              : typeof row.env_name === "string"
                ? row.env_name
                : "",
        };
      })
    : [];

  return {
    settings,
    updatedAt:
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : typeof record.updated_at === "string"
          ? record.updated_at
          : null,
  };
}

function mapAccountProvisionResult(row: unknown): AccountProvisionResult {
  const record = asRecord(row);
  return {
    userId: String(record.userId ?? record.user_id ?? ""),
    email: String(record.email ?? ""),
    tenantId: String(record.tenantId ?? record.tenant_id ?? ""),
    tenantName: String(record.tenantName ?? record.tenant_name ?? ""),
    tenantSlug: String(record.tenantSlug ?? record.tenant_slug ?? ""),
    tenantIcon: String(record.tenantIcon ?? record.tenant_icon ?? ""),
    role: String(record.role ?? "owner"),
    folderName: String(record.folderName ?? record.folder_name ?? ""),
  };
}

function mapRemoteOpsAlert(row: unknown): OpsAlert {
  const record = asRecord(row);
  return {
    dedupeKey: String(record.dedupe_key ?? record.dedupeKey ?? ""),
    severity: normalizeOpsSeverity(record.severity),
    component: String(record.component ?? "system"),
    tenantId:
      typeof record.tenant_id === "string"
        ? record.tenant_id
        : typeof record.tenantId === "string"
          ? record.tenantId
          : null,
    alertKey: String(record.alert_key ?? record.alertKey ?? "alert"),
    status: normalizeOpsStatus(record.status),
    message: String(record.message ?? ""),
    currentValue:
      record.current_value === null || record.current_value === undefined
        ? null
        : toNumber(record.current_value, 0),
    threshold:
      record.threshold === null || record.threshold === undefined
        ? null
        : toNumber(record.threshold, 0),
    runbookUrl:
      typeof record.runbook_url === "string"
        ? record.runbook_url
        : typeof record.runbookUrl === "string"
          ? record.runbookUrl
          : null,
    firstSeenAt: String(
      record.first_seen_at ?? record.firstSeenAt ?? new Date().toISOString(),
    ),
    lastSeenAt: String(
      record.last_seen_at ?? record.lastSeenAt ?? new Date().toISOString(),
    ),
    context: asRecord(record.context_json ?? record.context),
  };
}

function createRemoteApi(): PlatformApi {
  const mock = createLazyMockApi();

  return {
    async search(query, filters, options, tenantIds) {
      const explicitFilters = normalizeSearchFilters(filters);

      try {
        const limit = Math.max(
          1,
          Math.min(50, Math.trunc(options?.limit ?? 12)),
        );
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
        throw new Error(
          `Live search failed. Edge Function error: ${errorMessage(functionError)}.`,
        );
      }
    },
    async listCandidates(tenantIds, options) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return mock.listCandidates(tenantIds, options);
      }

      try {
        return await fetchCandidatesListRpc(tenantIds, options);
      } catch (error) {
        throw new Error(`Unable to load candidates: ${errorMessage(error)}`);
      }
    },
    async searchDebug(query, filters, options, tenantIds) {
      const explicitFilters = normalizeSearchFilters(filters);

      try {
        const limit = Math.max(
          1,
          Math.min(50, Math.trunc(options?.limit ?? 12)),
        );
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
        throw new Error(
          `Live search debug failed. Edge Function error: ${errorMessage(functionError)}.`,
        );
      }
    },
    async getSearchFilterOptions(tenantIds) {
      if (!hasSupabaseConfig) {
        return mock.getSearchFilterOptions();
      }

      try {
        return mapSearchFilterOptions(await fetchSearchFacetRows(tenantIds));
      } catch {
        return createEmptySearchFilterOptions();
      }
    },
    async getWorkspaceStats(tenantIds) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return createEmptyWorkspaceStats();
      }

      try {
        return await fetchWorkspaceStatsRpc(tenantIds);
      } catch {
        return createEmptyWorkspaceStats();
      }
    },
    async getManatalSyncStatus(tenantIds) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return mock.getManatalSyncStatus(tenantIds);
      }

      try {
        return await invokePlatform<ManatalSyncStatus>("manatal_sync_status", {
          tenant_ids: tenantIds,
        });
      } catch {
        return mock.getManatalSyncStatus(tenantIds);
      }
    },
    async getManatalCandidateId(candidateId) {
      if (!hasSupabaseConfig) {
        return null;
      }

      try {
        const payload = await invokePlatform<JsonRecord>("candidate_detail", {
          candidate_id: candidateId,
        });
        const manatalCandidateId = payload.manatalCandidateId;
        return typeof manatalCandidateId === "string" ? manatalCandidateId : null;
      } catch {
        return null;
      }
    },
    async getCandidate(candidateId) {
      if (!hasSupabaseConfig) {
        return mock.getCandidate(candidateId);
      }

      const payload = await invokePlatform<JsonRecord>("candidate_detail", {
        candidate_id: candidateId,
      });
      const candidateRow = asRecord(
        payload.candidate ?? payload.dossier,
      ) as CandidateDossierRow;
      if (typeof payload.manatalCandidateId === "string") {
        candidateRow.manatal_candidate_id = payload.manatalCandidateId;
      }

      return mapRemoteCandidate(
        candidateRow,
        asArray(payload.chunks) as CandidateChunkRow[],
      );
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
      const hasGcsOriginal = isGcsSource(sourceUri) || isGcsSource(storagePath);

      if (hasSupabaseConfig && (context?.candidateId || context?.documentId)) {
        try {
          const payload = await invokePlatform<JsonRecord>(
            "original_document_url",
            {
              candidate_id: context.candidateId ?? undefined,
              document_id: context.documentId ?? undefined,
              tenant_id: context.tenantId ?? undefined,
              tenant_ids: context.tenantIds ?? [],
            },
          );
          const url = typeof payload.url === "string" ? payload.url : null;
          if (url) {
            return url;
          }
        } catch (error) {
          if (isBrowserOpenableSource(sourceUri)) {
            return sourceUri ?? null;
          }
          if (hasGcsOriginal) {
            const detail = errorMessage(error).trim();
            throw new Error(
              detail ||
                "This original CV is private in GCS and could not be signed.",
            );
          }
        }
      }

      if (isBrowserOpenableSource(sourceUri)) {
        return sourceUri ?? null;
      }

      return mock.getOriginalDocumentUrl(storagePath, sourceUri);
    },
    async getShortlist(tenantIds) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return mock.getShortlist(tenantIds);
      }

      try {
        const rows = await invokePlatform<CandidateShortlistRow[]>(
          "shortlist_items",
          { tenant_ids: tenantIds },
        );
        return (rows ?? []).map(mapRemoteShortlistItem);
      } catch {
        return [];
      }
    },
    async saveShortlistItem(item) {
      if (!hasSupabaseConfig) {
        return mock.saveShortlistItem(item);
      }

      const row = await invokePlatform<CandidateShortlistRow>(
        "save_shortlist_item",
        {
          item: shortlistInputPayload(item),
        },
      );
      return mapRemoteShortlistItem(row);
    },
    async removeShortlistItem(candidateId, tenantId) {
      if (!hasSupabaseConfig) {
        return mock.removeShortlistItem(candidateId, tenantId);
      }

      await invokePlatform("delete_shortlist_item", {
        candidate_id: candidateId,
        tenant_id: tenantId ?? null,
      });
    },
    async clearShortlist(tenantIds) {
      if (!hasSupabaseConfig) {
        return mock.clearShortlist(tenantIds);
      }

      await invokePlatform("clear_shortlist_items", {
        tenant_ids: tenantIds ?? [],
      });
    },
    async listJobPostings(tenantIds) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return hasSupabaseConfig ? [] : mock.listJobPostings(tenantIds);
      }
      const rows = await invokePlatform<unknown[]>("job_postings", {
        tenant_ids: tenantIds,
      });
      return (rows ?? []).map(mapRemoteJobPosting);
    },
    async getJobPosting(jobId) {
      if (!hasSupabaseConfig) {
        return mock.getJobPosting(jobId);
      }
      const row = await invokePlatform<unknown>("job_posting", {
        job_id: jobId,
      });
      return mapRemoteJobPosting(row);
    },
    async saveJobPosting(job) {
      if (!hasSupabaseConfig) {
        return mock.saveJobPosting(job);
      }
      const row = await invokePlatform<unknown>("save_job_posting", {
        job: jobPostingPayload(job),
      });
      return mapRemoteJobPosting(row);
    },
    async extractJobPosting(input) {
      if (!hasSupabaseConfig) {
        return mock.extractJobPosting(input);
      }
      const payload = await invokePlatform<unknown>("extract_job_posting", {
        tenant_id: input.tenantId,
        job_id: input.jobId ?? null,
        title: input.title ?? null,
        employer_region: input.employerRegion ?? null,
        job_description: input.jobDescription,
      });
      return mapRemoteJobExtraction(payload);
    },
    async startJobMatchingRun(input) {
      if (!hasSupabaseConfig) {
        return mock.startJobMatchingRun(input);
      }
      const payload = await invokePlatform<unknown>("start_job_matching_run", {
        job_id: input.jobId,
        limit: input.limit,
        semantic_pool_size: input.semanticPoolSize,
        rerank_pool_size: input.rerankPoolSize,
        mandatory_criteria: input.mandatoryCriteria ?? {},
      });
      return mapRemoteJobMatchingRunDetail(payload);
    },
    async listJobMatchingRuns(jobId) {
      if (!hasSupabaseConfig) {
        return mock.listJobMatchingRuns(jobId);
      }
      const rows = await invokePlatform<unknown[]>("matching_runs", {
        job_id: jobId,
      });
      return (rows ?? []).map(mapRemoteJobMatchingRun);
    },
    async getJobMatchingRun(runId) {
      if (!hasSupabaseConfig) {
        return mock.getJobMatchingRun(runId);
      }
      const payload = await invokePlatform<unknown>("matching_run", {
        run_id: runId,
      });
      return mapRemoteJobMatchingRunDetail(payload);
    },
    async listJobShortlists(jobId) {
      if (!hasSupabaseConfig) {
        return mock.listJobShortlists(jobId);
      }
      const rows = await invokePlatform<unknown[]>("job_shortlists", {
        job_id: jobId,
      });
      return (rows ?? []).map(mapRemoteJobShortlist);
    },
    async getJobShortlist(shortlistId) {
      if (!hasSupabaseConfig) {
        return mock.getJobShortlist(shortlistId);
      }
      const payload = await invokePlatform<unknown>("job_shortlist", {
        shortlist_id: shortlistId,
      });
      return mapRemoteJobShortlistDetail(payload);
    },
    async saveJobShortlist(input) {
      if (!hasSupabaseConfig) {
        return mock.saveJobShortlist(input);
      }
      const payload = await invokePlatform<unknown>("save_job_shortlist", {
        job_id: input.jobId,
        run_id: input.runId ?? null,
        name: input.name,
        description: input.description ?? "",
        candidate_ids: input.candidateIds ?? [],
      });
      return mapRemoteJobShortlistDetail(payload);
    },
    async listJobApplications(jobId) {
      if (!hasSupabaseConfig) {
        return mock.listJobApplications(jobId);
      }
      const rows = await invokePlatform<unknown[]>("job_applications", {
        job_id: jobId,
      });
      return (rows ?? []).map(mapRemoteJobApplication);
    },
    async updateJobApplicationStatus(applicationId, status) {
      if (!hasSupabaseConfig) {
        return mock.updateJobApplicationStatus(applicationId, status);
      }
      const row = await invokePlatform<unknown>(
        "update_job_application_status",
        {
          application_id: applicationId,
          status,
        },
      );
      return mapRemoteJobApplication(row);
    },
    async listJobApplicationSourceCategories(tenantId) {
      if (!hasSupabaseConfig) {
        return mock.listJobApplicationSourceCategories(tenantId);
      }
      const rows = await invokePlatform<unknown[]>("job_application_source_categories", {
        tenant_id: tenantId,
      });
      return (rows ?? []).map(mapRemoteJobApplicationSourceCategory);
    },
    async saveJobApplicationSourceCategory(input) {
      if (!hasSupabaseConfig) {
        return mock.saveJobApplicationSourceCategory(input);
      }
      const row = await invokePlatform<unknown>("save_job_application_source_category", {
        tenant_id: input.tenantId,
        category_id: input.categoryId ?? null,
        name: input.name,
        description: input.description ?? "",
        is_active: input.isActive !== false,
      });
      return mapRemoteJobApplicationSourceCategory(row);
    },
    async listJobApplicationLinks(jobId) {
      if (!hasSupabaseConfig) {
        return mock.listJobApplicationLinks(jobId);
      }
      const rows = await invokePlatform<unknown[]>("job_application_links", {
        job_id: jobId,
      });
      return (rows ?? []).map(mapRemoteJobApplicationLink);
    },
    async saveJobApplicationLink(input) {
      if (!hasSupabaseConfig) {
        return mock.saveJobApplicationLink(input);
      }
      const row = await invokePlatform<unknown>("save_job_application_link", {
        job_id: input.jobId,
        link_id: input.linkId ?? null,
        source_category_id: input.sourceCategoryId,
        label: input.label ?? "",
        source_detail: input.sourceDetail ?? "",
        campaign_name: input.campaignName ?? "",
        utm_source: input.utmSource ?? null,
        utm_medium: input.utmMedium ?? null,
        utm_campaign: input.utmCampaign ?? null,
        utm_term: input.utmTerm ?? null,
        utm_content: input.utmContent ?? null,
        is_active: input.isActive !== false,
      });
      return mapRemoteJobApplicationLink(row);
    },
    async listPublicJobPostings() {
      if (!hasSupabaseConfig) {
        return mock.listPublicJobPostings();
      }
      const payload = await invokeFunction<JsonRecord>(
        "public-jobs",
        {
          action: "list",
        },
        { requireSession: false },
      );
      return asArray(payload.jobs).map(mapRemotePublicJob);
    },
    async getPublicJobPosting(slug) {
      if (!hasSupabaseConfig) {
        return mock.getPublicJobPosting(slug);
      }
      const payload = await invokeFunction<JsonRecord>(
        "public-jobs",
        {
          action: "detail",
          slug,
        },
        { requireSession: false },
      );
      return mapRemotePublicJob(asRecord(payload.job));
    },
    async submitPublicJobApplication(slug, application) {
      if (!hasSupabaseConfig) {
        return mock.submitPublicJobApplication(slug, application);
      }
      const payload = await invokeFunction<unknown>(
        "public-jobs",
        {
          action: "apply",
          slug,
          ref_token: application.refToken ?? null,
          application: publicApplicationPayload(application),
        },
        { requireSession: false },
      );
      return mapPublicReceipt(payload);
    },
    async getParsingOverview(tenantIds, options) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return mock.getParsingOverview();
      }

      try {
        return fetchParsingOverviewRpc(tenantIds, options);
      } catch (error) {
        throw new Error(
          `Unable to load live parsing diagnostics: ${errorMessage(error)}`,
        );
      }
    },
    async getParsingDocument(documentId, tenantIds) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return mock.getParsingDocument(documentId);
      }

      try {
        const snapshot = await fetchParsingDocumentSnapshot(
          documentId,
          tenantIds,
        );
        const detail = buildParsingDocumentDetail(
          documentId,
          snapshot.documents,
          snapshot.candidates,
          snapshot.profiles,
          snapshot.runs,
        );
        if (!detail) {
          throw new Error(`Document ${documentId} was not found.`);
        }
        return detail;
      } catch (error) {
        throw new Error(
          `Unable to load live parsing document ${documentId}: ${errorMessage(error)}`,
        );
      }
    },
    async getParserProfiles(tenantIds) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return mock.getParserProfiles();
      }

      try {
        const data = await invokePlatform<ParserProfileRow[]>(
          "parser_profiles",
          { tenant_ids: tenantIds },
        );
        return (data ?? []).map(mapRemoteParserProfile);
      } catch {
        return mock.getParserProfiles();
      }
    },
    async saveParserProfile(profile, tenantId) {
      if (!hasSupabaseConfig || !tenantId) {
        return mock.saveParserProfile(profile);
      }

      try {
        const data = await invokePlatform<ParserProfileRow>(
          "save_parser_profile",
          {
            tenant_id: tenantId,
            profile,
          },
        );
        return mapRemoteParserProfile(data as ParserProfileRow);
      } catch {
        return mock.saveParserProfile(profile);
      }
    },
    async publishParserProfile(profileId, tenantId) {
      if (!hasSupabaseConfig || !tenantId) {
        return mock.publishParserProfile(profileId);
      }

      try {
        const data = await invokePlatform<ParserProfileRow>(
          "publish_parser_profile",
          { profile_id: profileId },
        );
        return mapRemoteParserProfile(data as ParserProfileRow);
      } catch {
        return mock.publishParserProfile(profileId);
      }
    },
    async getAnalytics() {
      return mock.getAnalytics();
    },
    async getInsightsDashboard(options, tenantIds) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return mock.getInsightsDashboard(options, tenantIds);
      }

      try {
        const payload = await invokePlatform<JsonRecord>("insights_dashboard", {
          tenant_ids: tenantIds,
          top_skills: options?.topSkills ?? 50,
          target_role: options?.targetRole ?? null,
          target_skills: options?.targetSkills ?? [],
          trace_id: `insights-${Date.now()}`,
        });
        return mapRemoteInsightsDashboard(payload);
      } catch {
        return mock.getInsightsDashboard(options, tenantIds);
      }
    },
    async getInsightsGapAnalysis(options, tenantIds) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return mock.getInsightsGapAnalysis(options, tenantIds);
      }

      try {
        const payload = await invokePlatform<JsonRecord>("insights_gap_analysis", {
          tenant_ids: tenantIds,
          target_role: options?.targetRole ?? null,
          target_skills: options?.targetSkills ?? [],
          trace_id: `insights-gap-${Date.now()}`,
        });
        return mapRemoteInsightsGapAnalysis(payload);
      } catch {
        return mock.getInsightsGapAnalysis(options, tenantIds);
      }
    },
    async startInsightReport(input, tenantIds) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return mock.startInsightReport(input, tenantIds);
      }
      try {
        const payload = await invokePlatform<unknown>("start_insight_report", {
          tenant_ids: tenantIds,
          report_type: input.reportType,
          focus: input.focus ?? input.targetRole ?? null,
          target_role: input.focus ?? input.targetRole ?? null,
          target_skills: input.targetSkills ?? [],
          top_skills: input.topSkills ?? 50,
        });
        return mapRemoteInsightReportRunDetail(payload);
      } catch (error) {
        if (!tenantIds?.length) {
          throw error;
        }
        const dashboard = await mock.getInsightsDashboard(
          {
            topSkills: input.topSkills ?? 50,
            targetRole: input.reportType === "gap_brief" ? input.focus ?? input.targetRole : undefined,
            targetSkills: input.targetSkills,
          },
          tenantIds,
        );
        const report = buildMockInsightReport(
          dashboard,
          input.reportType,
          input.focus ?? input.targetRole,
        );
        const now = new Date().toISOString();
        return {
          run: {
            id: crypto.randomUUID(),
            tenantId: tenantIds[0],
            initiatedByUserId: null,
            status: "completed",
            reportType: input.reportType,
            inputConfig: {
              reportType: input.reportType,
              focus: input.focus ?? input.targetRole ?? null,
            },
            failureReason: null,
            llmProvider: "heuristic",
            llmModel: "client-fallback",
            startedAt: now,
            completedAt: now,
            createdAt: now,
          },
          report,
        };
      }
    },
    async listInsightReportRuns(tenantIds, limit = 20) {
      if (!hasSupabaseConfig || !tenantIds?.length) {
        return mock.listInsightReportRuns(tenantIds, limit);
      }
      try {
        const rows = await invokePlatform<unknown[]>("insight_report_runs", {
          tenant_ids: tenantIds,
          limit,
        });
        return (rows ?? []).map(mapRemoteInsightReportRun);
      } catch {
        return mock.listInsightReportRuns(tenantIds, limit);
      }
    },
    async getInsightReportRun(runId) {
      if (!hasSupabaseConfig) {
        return mock.getInsightReportRun(runId);
      }
      try {
        const payload = await invokePlatform<unknown>("insight_report_run", {
          run_id: runId,
        });
        return mapRemoteInsightReportRunDetail(payload);
      } catch (error) {
        return mock.getInsightReportRun(runId);
      }
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
        const rows = await invokePlatform<unknown[]>("ops_alerts", {
          tenant_ids: tenantIds ?? [],
        });
        return (rows ?? []).map(mapRemoteOpsAlert);
      } catch {
        return mock.getOpsAlerts();
      }
    },
    async acknowledgeOpsAlert(dedupeKey) {
      try {
        const row = await invokePlatform<unknown>("ops_ack_alert", {
          dedupe_key: dedupeKey,
        });
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
    async listAdminTenants() {
      try {
        const rows = await invokePlatform<unknown[]>("list_admin_tenants");
        return (rows ?? []).map(mapTenantAdminSummary);
      } catch {
        return [];
      }
    },
    async createTenantAccount(input) {
      const payload = await invokePlatform<unknown>("create_tenant_account", {
        email: input.email,
        password: input.password,
        tenant_name: input.tenantName,
        tenant_slug: input.tenantSlug ?? "",
        tenant_icon: input.tenantIcon ?? "",
        full_name: input.fullName ?? "",
        role: input.role ?? "owner",
      });
      return mapAccountProvisionResult(payload);
    },
    async addUserToTenant(input) {
      const payload = await invokePlatform<unknown>("add_user_to_tenant", {
        email: input.email,
        password: input.password,
        tenant_slug: input.tenantSlug,
        full_name: input.fullName ?? "",
        role: input.role ?? "recruiter",
      });
      return mapAccountProvisionResult(payload);
    },
    async getPlatformRuntimeConfig() {
      const payload = await invokePlatform<unknown>(
        "get_platform_runtime_config",
      );
      return mapPlatformRuntimeConfig(payload);
    },
    async savePlatformRuntimeConfig(settings) {
      const payload = await invokePlatform<unknown>(
        "save_platform_runtime_config",
        { settings },
      );
      return mapPlatformRuntimeConfig(payload);
    },
  };
}

export const platformApi = hasSupabaseConfig
  ? createRemoteApi()
  : createLazyMockApi();
