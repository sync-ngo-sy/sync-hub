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
  fetchInsightsDashboardFromRpc,
  fetchInsightsDashboardFromSearchCache,
  fetchInsightsGapAnalysisFromRpc,
  mapRemoteInsightsDashboard,
  mapRemoteInsightsGapAnalysis,
} from "@/features/insights/api";
import {
  jobPostingPayload,
  mapPublicReceipt,
  mapRemoteJobApplication,
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
import { countRemoteRows } from "@/lib/api/countRows";
import {
  asArray,
  asRecord,
  errorMessage,
  nullableString,
  toNumber,
  toStringArray,
  type JsonRecord,
} from "@/lib/api/json";
import { invokeFunction, invokePlatform } from "@/lib/api/platformClient";
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
import { hasSupabaseConfig, supabase } from "@/lib/supabaseClient";

const MAX_VISIBLE_CITATIONS = 3;
const MAX_CONTEXT_BLOCKS = 6;
const USE_INSIGHTS_PLATFORM_API =
  import.meta.env.VITE_USE_INSIGHTS_PLATFORM_API !== "false";

const STORAGE_BUCKET = "cv-originals";
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

function percent(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

function mapManatalSyncRow(
  row: JsonRecord,
): ManatalSyncStatus["recentRows"][number] {
  return {
    manatalCandidateId: String(row.manatal_candidate_id ?? ""),
    candidateName: String(row.manatal_full_name ?? "Unknown candidate"),
    email:
      typeof row.manatal_email === "string" && row.manatal_email
        ? row.manatal_email
        : null,
    syncStatus: String(row.sync_status ?? "unknown"),
    lastSyncedAt:
      typeof row.last_synced_at === "string" ? row.last_synced_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    sourceDocumentId:
      typeof row.source_document_id === "string"
        ? row.source_document_id
        : null,
    errorMessage:
      typeof row.error_message === "string" && row.error_message
        ? row.error_message
        : null,
  };
}

async function fetchManatalSyncStatusDirect(
  tenantIds: string[],
): Promise<ManatalSyncStatus> {
  if (!supabase || !tenantIds.length) {
    return (await getMockApi()).getManatalSyncStatus(tenantIds);
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
    countRemoteRows("source_documents", tenantIds, (query) =>
      query.like("source_uri", "gs://%"),
    ),
    countRemoteRows("source_documents", tenantIds, (query) =>
      query.ilike("source_uri", "%drive.google.com%"),
    ),
    countRemoteRows("manatal_candidate_sync", tenantIds),
    countRemoteRows("manatal_candidate_sync", tenantIds, (query) =>
      query.not("source_document_id", "is", null),
    ),
    countRemoteRows("manatal_candidate_sync", tenantIds, (query) =>
      query.eq("sync_status", "synced"),
    ),
    countRemoteRows("manatal_candidate_sync", tenantIds, (query) =>
      query.eq("sync_status", "pending"),
    ),
    countRemoteRows("manatal_candidate_sync", tenantIds, (query) =>
      query.eq("sync_status", "failed"),
    ),
    countRemoteRows("manatal_candidate_sync", tenantIds, (query) =>
      query.eq("sync_status", "skipped"),
    ),
  ]);

  const recentResult = await supabase
    .from("manatal_candidate_sync")
    .select(
      "manatal_candidate_id, manatal_full_name, manatal_email, sync_status, last_synced_at, updated_at, source_document_id, error_message",
    )
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
    .select(
      "manatal_candidate_id, manatal_full_name, error_message, updated_at",
    )
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
    lastSyncedAt:
      typeof lastSynced.last_synced_at === "string"
        ? lastSynced.last_synced_at
        : null,
    lastFailure: lastFailure.manatal_candidate_id
      ? {
          manatalCandidateId: String(lastFailure.manatal_candidate_id),
          candidateName: String(
            lastFailure.manatal_full_name ?? "Unknown candidate",
          ),
          errorMessage: String(lastFailure.error_message ?? ""),
          updatedAt:
            typeof lastFailure.updated_at === "string"
              ? lastFailure.updated_at
              : null,
        }
      : null,
    recentRows: asArray(recentResult.data).map((row) =>
      mapManatalSyncRow(asRecord(row)),
    ),
  };
}

async function fetchCandidateDetailDirect(
  candidateId: string,
): Promise<CandidateDetail> {
  if (!supabase) {
    return (await getMockApi()).getCandidate(candidateId);
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
    {
      ...(asRecord(dossier.data) as CandidateDossierRow),
      manatal_candidate_id:
        await fetchManatalCandidateIdByCandidateId(candidateId),
    },
    asArray(chunks.data) as CandidateChunkRow[],
  );
}

async function fetchManatalCandidateIdByCandidateId(
  candidateId: string,
): Promise<string | null> {
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

  const sourceDocumentId =
    typeof dossierResult.data?.source_document_id === "string"
      ? dossierResult.data.source_document_id
      : "";
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
  return typeof row.manatal_candidate_id === "string"
    ? row.manatal_candidate_id
    : null;
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

function normalizeTrend(value: unknown): InsightsDashboardSnapshot["metrics"][number]["trend"] {
  return value === "up" || value === "down" || value === "flat" ? value : "flat";
}

function mapRemoteInsightsDashboard(payload: JsonRecord): InsightsDashboardSnapshot {
  return {
    generatedAt: String(payload.generatedAt ?? payload.generated_at ?? new Date().toISOString()),
    metrics: asArray(payload.metrics).map((item) => {
      const record = asRecord(item);
      return {
        key: String(record.key ?? ""),
        label: String(record.label ?? ""),
        value: toNumber(record.value),
        deltaValue: toNumber(record.deltaValue ?? record.delta_value),
        deltaPercent: record.deltaPercent === null || record.deltaPercent === undefined ? null : toNumber(record.deltaPercent ?? record.delta_percent),
        trend: normalizeTrend(record.trend),
        sparkline: asArray(record.sparkline).map((value) => toNumber(value)),
      };
    }),
    profilesBySeniority: asArray(payload.profilesBySeniority).map((item) => {
      const record = asRecord(item);
      return { label: String(record.label ?? ""), value: toNumber(record.value), percent: record.percent === undefined ? null : toNumber(record.percent) };
    }),
    profilesByLocation: asArray(payload.profilesByLocation).map((item) => {
      const record = asRecord(item);
      return { label: String(record.label ?? ""), value: toNumber(record.value), percent: record.percent === undefined ? null : toNumber(record.percent) };
    }),
    jobFamilies: asArray(payload.jobFamilies).map((item) => {
      const record = asRecord(item);
      return { label: String(record.label ?? ""), value: toNumber(record.value), percent: record.percent === undefined ? null : toNumber(record.percent) };
    }),
    skillsFrequency: asArray(payload.skillsFrequency).map((item) => {
      const record = asRecord(item);
      return { skill: String(record.skill ?? ""), count: toNumber(record.count) };
    }),
    gapUseCases: asArray(payload.gapUseCases).map((item) => {
      const record = asRecord(item);
      return {
        id: String(record.id ?? ""),
        title: String(record.title ?? ""),
        detail: String(record.detail ?? ""),
        skills: toStringArray(record.skills),
        query: String(record.query ?? ""),
      };
    }),
    seniorityPyramid: asArray(payload.seniorityPyramid).map((item) => {
      const record = asRecord(item);
      return {
        jobFamily: String(record.jobFamily ?? record.job_family ?? ""),
        junior: toNumber(record.junior),
        mid: toNumber(record.mid),
        senior: toNumber(record.senior),
        lead: toNumber(record.lead),
        executive: toNumber(record.executive),
      };
    }),
    gapAnalysis: mapRemoteInsightsGapAnalysis(asRecord(payload.gapAnalysis)),
  };
}

function mapRemoteInsightsGapAnalysis(payload: JsonRecord): InsightsGapAnalysis {
  return {
    targetRole: typeof payload.targetRole === "string" ? payload.targetRole : null,
    targetSkills: toStringArray(payload.targetSkills),
    fullyMatchingCandidates: toNumber(payload.fullyMatchingCandidates),
    partiallyMatchingCandidates: toNumber(payload.partiallyMatchingCandidates),
    zeroMatchCandidates: toNumber(payload.zeroMatchCandidates),
    missingSkills: asArray(payload.missingSkills).map((item) => {
      const missing = asRecord(item);
      return {
        skill: String(missing.skill ?? ""),
        missingFromPartialCandidates: toNumber(missing.missingFromPartialCandidates),
      };
    }),
  };
}

type InsightsCandidateSearchCacheRow = {
  tenant_id: string;
  candidate_id: string;
  current_title: string | null;
  headline: string | null;
  location: string | null;
  seniority: string | null;
  primary_role: string | null;
  role_tags: string[] | null;
  skills: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

type InsightsJobFamilyRule = {
  label: string;
  roleTags: string[];
  titleSignals: string[];
  skillSignals: string[];
};

const INSIGHTS_FALLBACK_PAGE_SIZE = 1000;
const INSIGHTS_FALLBACK_MAX_ROWS = 20000;
const INSIGHTS_JOB_FAMILY_RULES: InsightsJobFamilyRule[] = [
  {
    label: "Full-Stack Engineering",
    roleTags: ["full-stack"],
    titleSignals: ["full stack", "full-stack"],
    skillSignals: ["react", "angular", "vue", "node.js", "express", "django", "laravel", "postgresql", "mongodb", "sql", "apis"],
  },
  {
    label: "Backend Engineering",
    roleTags: ["backend"],
    titleSignals: ["backend", "back-end", "api", "server", "platform"],
    skillSignals: ["node.js", "nestjs", "express", "java", "spring", "python", "django", "fastapi", "laravel", "php", "asp.net", ".net", "postgresql", "mysql", "mongodb", "redis", "graphql", "rest apis"],
  },
  {
    label: "Frontend Engineering",
    roleTags: ["frontend"],
    titleSignals: ["frontend", "front-end", "ui engineer", "web developer"],
    skillSignals: ["react", "next.js", "angular", "vue", "javascript", "typescript", "html", "css", "tailwind", "bootstrap", "redux"],
  },
  {
    label: "Mobile Engineering",
    roleTags: ["mobile"],
    titleSignals: ["mobile", "android", "ios", "flutter", "react native"],
    skillSignals: ["flutter", "dart", "android", "ios", "swift", "kotlin", "react native", "firebase"],
  },
  {
    label: "AI & Machine Learning",
    roleTags: ["ml"],
    titleSignals: ["machine learning", "ml engineer", "ai engineer", "data scientist", "llm"],
    skillSignals: ["machine learning", "deep learning", "tensorflow", "pytorch", "scikit", "keras", "opencv", "nlp", "llm", "computer vision"],
  },
  {
    label: "Data & Analytics",
    roleTags: ["data"],
    titleSignals: ["data analyst", "data engineer", "business intelligence", "bi developer", "analytics"],
    skillSignals: ["sql", "power bi", "tableau", "excel", "pandas", "numpy", "etl", "data analysis", "data visualization"],
  },
  {
    label: "Cloud, DevOps & SRE",
    roleTags: ["devops"],
    titleSignals: ["devops", "sre", "site reliability", "cloud", "infrastructure"],
    skillSignals: ["docker", "kubernetes", "terraform", "aws", "azure", "google cloud", "gcp", "ci/cd", "linux", "jenkins", "ansible", "helm"],
  },
  {
    label: "Cybersecurity",
    roleTags: ["security"],
    titleSignals: ["security", "cyber", "soc", "penetration", "threat", "siem"],
    skillSignals: ["cybersecurity", "security", "soc operations", "siem", "penetration testing", "vulnerability", "threat detection", "incident response"],
  },
  {
    label: "QA & Test Automation",
    roleTags: ["qa"],
    titleSignals: ["qa", "quality assurance", "test automation", "tester"],
    skillSignals: ["selenium", "playwright", "cypress", "jest", "testing", "test automation", "quality assurance"],
  },
  {
    label: "Product & Design",
    roleTags: ["product", "design"],
    titleSignals: ["product designer", "ui/ux", "ux designer", "product manager"],
    skillSignals: ["figma", "ui/ux", "wireframing", "prototyping", "user research", "product management"],
  },
  {
    label: "Software Engineering",
    roleTags: ["generalist"],
    titleSignals: ["software", "developer", "engineer", "programmer"],
    skillSignals: ["git", "github", "apis", "javascript", "python", "java", "sql", "problem solving"],
  },
];

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

function inferInsightsJobFamily(row: InsightsCandidateSearchCacheRow) {
  const roleTags = toStringArray(row.role_tags).map((tag) => tag.toLowerCase());
  const roleText = [...roleTags, row.primary_role ?? "", row.current_title ?? "", row.headline ?? ""].join(" ").toLowerCase();
  const titleText = [row.current_title ?? "", row.headline ?? ""].join(" ").toLowerCase();
  const skillText = toStringArray(row.skills).join(" ").toLowerCase();
  let bestFamily = "Unclassified";
  let bestScore = 0;

  for (const rule of INSIGHTS_JOB_FAMILY_RULES) {
    let score = 0;
    if (rule.roleTags.some((tag) => roleTags.includes(tag)) || includesAny(roleText, rule.roleTags)) {
      score += 90;
    }
    if (includesAny(titleText, rule.titleSignals)) {
      score += 55;
    }
    score += Math.min(60, rule.skillSignals.filter((signal) => skillText.includes(signal)).length * 12);
    if (score > bestScore) {
      bestScore = score;
      bestFamily = rule.label;
    }
  }

  if (roleTags.includes("backend") && roleTags.includes("frontend") && bestScore < 120) {
    return "Full-Stack Engineering";
  }
  return bestScore >= 40 ? bestFamily : "Unclassified";
}

function normalizeInsightsSeniority(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "unclassified";
}

function normalizePyramidSeniority(value: string | null | undefined) {
  const normalized = normalizeInsightsSeniority(value);
  if (normalized === "staff-plus" || normalized === "principal" || normalized === "manager") {
    return "lead";
  }
  if (normalized === "junior" || normalized === "mid" || normalized === "senior" || normalized === "lead" || normalized === "executive") {
    return normalized;
  }
  return "junior";
}

function incrementCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function distributionFromCounts(counts: Map<string, number>, total: number, limit?: number): InsightsDashboardSnapshot["jobFamilies"] {
  return Array.from(counts.entries())
    .map(([label, value]) => ({
      label,
      value,
      percent: total ? Number(((value / total) * 100).toFixed(1)) : 0,
    }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, limit ?? counts.size);
}

function buildInsightsSparkline(rows: InsightsCandidateSearchCacheRow[], now = new Date()) {
  const bucketCount = 6;
  const bucketMs = 5 * 24 * 60 * 60 * 1000;
  const startMs = now.getTime() - bucketCount * bucketMs;
  const buckets = Array.from({ length: bucketCount }, () => 0);
  for (const row of rows) {
    const createdMs = Date.parse(row.created_at ?? "");
    if (!Number.isFinite(createdMs) || createdMs < startMs) {
      continue;
    }
    const bucketIndex = Math.min(bucketCount - 1, Math.max(0, Math.floor((createdMs - startMs) / bucketMs)));
    buckets[bucketIndex] += 1;
  }
  return buckets;
}

function hasSkill(skills: string[], targetSkill: string) {
  return candidateHasGapSkill(skills, targetSkill);
}

async function fetchInsightsSearchCacheRows(tenantIds: string[]): Promise<InsightsCandidateSearchCacheRow[]> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const rows: InsightsCandidateSearchCacheRow[] = [];
  for (let offset = 0; offset < INSIGHTS_FALLBACK_MAX_ROWS; offset += INSIGHTS_FALLBACK_PAGE_SIZE) {
    let query = supabase
      .from("candidate_search_cache")
      .select("tenant_id,candidate_id,current_title,headline,location,seniority,primary_role,role_tags,skills,created_at,updated_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + INSIGHTS_FALLBACK_PAGE_SIZE - 1);

    if (tenantIds.length) {
      query = query.in("tenant_id", tenantIds);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }
    rows.push(...((data ?? []) as InsightsCandidateSearchCacheRow[]));
    if (!data || data.length < INSIGHTS_FALLBACK_PAGE_SIZE) {
      break;
    }
  }
  return rows;
}

async function fetchInsightsDashboardFromSearchCache(options: InsightsDashboardOptions = {}, tenantIds: string[] = []): Promise<InsightsDashboardSnapshot> {
  const rows = await fetchInsightsSearchCacheRows(tenantIds);
  const now = new Date();
  const currentWindowStart = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const previousWindowStart = now.getTime() - 60 * 24 * 60 * 60 * 1000;
  const topSkills = Math.max(1, Math.min(200, options.topSkills ?? 50));
  const corpusSkills = Array.from(new Set(rows.flatMap((row) => toStringArray(row.skills))));
  const targetSkills = resolveGapRequirements({ targetRole: options.targetRole, targetSkills: options.targetSkills }, corpusSkills);
  const total = rows.length;
  const added30 = rows.filter((row) => Date.parse(row.created_at ?? "") >= currentWindowStart).length;
  const previousAdded30 = rows.filter((row) => {
    const createdMs = Date.parse(row.created_at ?? "");
    return createdMs >= previousWindowStart && createdMs < currentWindowStart;
  }).length;
  const sparkline = buildInsightsSparkline(rows, now);
  const seniorityCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const jobFamilyCounts = new Map<string, number>();
  const skillCounts = new Map<string, number>();
  const pyramidCounts = new Map<string, { junior: number; mid: number; senior: number; lead: number; executive: number }>();
  let classifiedCount = 0;
  let skillTotal = 0;
  let fullyMatchingCandidates = 0;
  let partiallyMatchingCandidates = 0;
  let zeroMatchCandidates = 0;
  const missingSkills = new Map<string, number>();

  for (const row of rows) {
    const skills = toStringArray(row.skills);
    const jobFamily = inferInsightsJobFamily(row);
    const seniority = normalizeInsightsSeniority(row.seniority);
    const location = String(row.location ?? "").trim() || "Unknown";
    incrementCount(seniorityCounts, seniority);
    incrementCount(locationCounts, location);
    incrementCount(jobFamilyCounts, jobFamily);
    if (jobFamily !== "Unclassified") {
      classifiedCount += 1;
    }
    skillTotal += skills.length;
    for (const skill of skills) {
      incrementCount(skillCounts, skill);
    }

    const pyramidSeniority = normalizePyramidSeniority(row.seniority);
    const pyramid = pyramidCounts.get(jobFamily) ?? { junior: 0, mid: 0, senior: 0, lead: 0, executive: 0 };
    pyramid[pyramidSeniority] += 1;
    pyramidCounts.set(jobFamily, pyramid);

    if (targetSkills.length) {
      const matchedSkills = targetSkills.filter((skill) => hasSkill(skills, skill));
      if (matchedSkills.length === targetSkills.length) {
        fullyMatchingCandidates += 1;
      } else if (matchedSkills.length > 0) {
        partiallyMatchingCandidates += 1;
        for (const skill of targetSkills) {
          if (!hasSkill(skills, skill)) {
            incrementCount(missingSkills, skill);
          }
        }
      } else {
        zeroMatchCandidates += 1;
      }
    }
  }

  const deltaValue = added30 - previousAdded30;
  const trend = deltaValue > 0 ? "up" : deltaValue < 0 ? "down" : "flat";
  return {
    generatedAt: now.toISOString(),
    metrics: [
      {
        key: "total_cvs_indexed",
        label: "Total CVs Indexed",
        value: total,
        deltaValue,
        deltaPercent: previousAdded30 ? Number(((deltaValue / previousAdded30) * 100).toFixed(1)) : null,
        trend,
        sparkline,
      },
      {
        key: "cvs_added_30d",
        label: "CVs Added (Last 30 Days)",
        value: added30,
        deltaValue,
        deltaPercent: previousAdded30 ? Number(((deltaValue / previousAdded30) * 100).toFixed(1)) : null,
        trend,
        sparkline,
      },
      {
        key: "job_family_coverage",
        label: "Job Family Coverage",
        value: total ? Number(((classifiedCount / total) * 100).toFixed(1)) : 0,
        deltaValue: 0,
        deltaPercent: null,
        trend: "flat",
        sparkline,
      },
      {
        key: "avg_skills_per_profile",
        label: "Avg Skills per Profile",
        value: total ? Number((skillTotal / total).toFixed(1)) : 0,
        deltaValue: 0,
        deltaPercent: null,
        trend: "flat",
        sparkline,
      },
    ],
    profilesBySeniority: distributionFromCounts(seniorityCounts, total),
    profilesByLocation: distributionFromCounts(locationCounts, total, 12),
    jobFamilies: distributionFromCounts(jobFamilyCounts, total),
    skillsFrequency: Array.from(skillCounts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((left, right) => right.count - left.count || left.skill.localeCompare(right.skill))
      .slice(0, topSkills),
    gapUseCases: [],
    seniorityPyramid: Array.from(pyramidCounts.entries())
      .map(([jobFamily, values]) => ({ jobFamily, ...values }))
      .sort((left, right) => {
        const leftTotal = left.junior + left.mid + left.senior + left.lead + left.executive;
        const rightTotal = right.junior + right.mid + right.senior + right.lead + right.executive;
        return rightTotal - leftTotal || left.jobFamily.localeCompare(right.jobFamily);
      }),
    gapAnalysis: {
      targetRole: options.targetRole ?? null,
      targetSkills,
      fullyMatchingCandidates,
      partiallyMatchingCandidates,
      zeroMatchCandidates,
      missingSkills: Array.from(missingSkills.entries())
        .map(([skill, missingFromPartialCandidates]) => ({ skill, missingFromPartialCandidates }))
        .sort((left, right) => right.missingFromPartialCandidates - left.missingFromPartialCandidates || left.skill.localeCompare(right.skill)),
    },
  };
}

async function fetchInsightsDashboardFromRpc(options: InsightsDashboardOptions = {}, tenantIds: string[] = []): Promise<InsightsDashboardSnapshot> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("insights_dashboard_snapshot_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_top_skills: options.topSkills ?? 50,
    p_target_skills: options.targetSkills?.length ? options.targetSkills : null,
    p_target_role: options.targetRole ?? null,
  });
  if (error) {
    throw error;
  }
  return mapRemoteInsightsDashboard(asRecord(data));
}

async function fetchInsightsGapAnalysisFromRpc(options: InsightsDashboardOptions = {}, tenantIds: string[] = []): Promise<InsightsGapAnalysis> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("insights_gap_analysis_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_target_skills: options.targetSkills?.length ? options.targetSkills : null,
    p_target_role: options.targetRole ?? null,
  });
  if (error) {
    throw error;
  }
  return mapRemoteInsightsGapAnalysis(asRecord(data));
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
const mockJobPostings = new Map<string, JobPosting>();
const mockJobApplications = new Map<string, JobApplication>();

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
    async listCandidates(_tenantIds, options) {
      await wait(120);
      return buildMockCandidatesList(options);
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
    async listJobPostings(tenantIds) {
      await wait(80);
      const allowedTenantIds = new Set(tenantIds ?? []);
      return Array.from(mockJobPostings.values()).filter((job) => !allowedTenantIds.size || allowedTenantIds.has(job.tenantId));
    },
    async getJobPosting(jobId) {
      await wait(60);
      const job = mockJobPostings.get(jobId);
      if (!job) {
        throw new Error(`Job posting ${jobId} was not found.`);
      }
      return job;
    },
    async saveJobPosting(job) {
      await wait(90);
      const now = new Date().toISOString();
      const id = job.id ?? crypto.randomUUID();
      const current = mockJobPostings.get(id);
      const saved: JobPosting = {
        id,
        tenantId: job.tenantId,
        title: job.title ?? "",
        employerName: job.employerName ?? "",
        employerCountry: job.employerCountry ?? "",
        employerRegion: job.employerRegion ?? "GCC",
        jobDescription: job.jobDescription ?? "",
        requiredSkills: job.requiredSkills ?? [],
        preferredSkills: job.preferredSkills ?? [],
        seniorityLevel: job.seniorityLevel ?? "",
        employmentType: job.employmentType ?? "",
        postedDate: job.status === "active" ? now.slice(0, 10) : job.postedDate ?? null,
        applicationDeadline: job.applicationDeadline ?? null,
        status: job.status ?? "draft",
        locationInfo: job.locationInfo ?? {},
        keyResponsibilities: job.keyResponsibilities ?? [],
        aiProfile: job.aiProfile ?? {},
        aiConfidence: job.aiConfidence ?? {},
        createdByUserId: job.createdByUserId ?? null,
        updatedByUserId: job.updatedByUserId ?? null,
        closedAt: job.closedAt ?? null,
        closedByUserId: job.closedByUserId ?? null,
        isPublic: job.isPublic ?? false,
        publicSlug: job.publicSlug ?? null,
        publicTitle: job.publicTitle ?? null,
        publicSummary: job.publicSummary ?? null,
        publicDescription: job.publicDescription ?? null,
        publicLocation: job.publicLocation ?? null,
        publicApplyEnabled: job.publicApplyEnabled ?? true,
        publicPublishedAt: job.isPublic && job.status === "active" ? now : null,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
      mockJobPostings.set(id, saved);
      return saved;
    },
    async extractJobPosting(input) {
      await wait(120);
      const skills = normalizeSkillList(input.jobDescription.match(/\b(?:React|TypeScript|Python|Java|SQL|AWS|Azure|GraphQL|Node)\b/gi) ?? []);
      return {
        requiredSkills: skills.map((name) => ({ name, confidence: 0.72, evidence: name })),
        preferredSkills: [],
        seniorityLevel: { value: /senior/i.test(input.title ?? input.jobDescription) ? "Senior" : "Mid", confidence: 0.64, evidence: input.title ?? "JD" },
        employmentType: { value: "Full-time", confidence: 0.7, evidence: "Default mock extraction" },
        location: { country: null, city: null, region: input.employerRegion, remotePolicy: "Unspecified", confidence: 0.3 },
        keyResponsibilities: [],
        warnings: [],
        modelProvider: "mock",
        modelName: "mock",
        promptVersion: "job-extraction-v1",
        inputHash: "mock",
      };
    },
    async startJobMatchingRun() {
      throw new Error("Job matching requires Supabase.");
    },
    async listJobMatchingRuns() {
      return [];
    },
    async getJobMatchingRun() {
      throw new Error("Matching run was not found.");
    },
    async listJobShortlists() {
      return [];
    },
    async getJobShortlist() {
      throw new Error("Shortlist was not found.");
    },
    async saveJobShortlist(input) {
      return {
        shortlist: {
          id: crypto.randomUUID(),
          tenantId: "mock-tenant",
          jobPostingId: input.jobId,
          matchingRunId: input.runId ?? null,
          name: input.name,
          description: input.description ?? "",
          ownerUserId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        candidates: [],
      };
    },
    async listJobApplications(jobId) {
      return Array.from(mockJobApplications.values()).filter((application) => application.jobPostingId === jobId);
    },
    async updateJobApplicationStatus(applicationId, status) {
      const application = mockJobApplications.get(applicationId);
      if (!application) {
        throw new Error("Application was not found.");
      }
      const updated = { ...application, status, updatedAt: new Date().toISOString() };
      mockJobApplications.set(applicationId, updated);
      return updated;
    },
    async listPublicJobPostings() {
      return Array.from(mockJobPostings.values()).filter((job) => job.status === "active" && job.isPublic).map((job) => ({
        id: job.publicSlug ?? job.id,
        slug: job.publicSlug ?? job.id,
        title: job.publicTitle ?? job.title,
        summary: job.publicSummary ?? "",
        description: job.publicDescription ?? job.jobDescription,
        location: job.publicLocation ?? "",
        remotePolicy: job.locationInfo.remotePolicy ?? "Unspecified",
        seniorityLevel: job.seniorityLevel,
        employmentType: job.employmentType,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        keyResponsibilities: job.keyResponsibilities,
        applicationDeadline: job.applicationDeadline,
        applyEnabled: job.publicApplyEnabled,
        publishedAt: job.publicPublishedAt,
      }));
    },
    async getPublicJobPosting(slug) {
      const job = (await this.listPublicJobPostings()).find((item) => item.slug === slug);
      if (!job) {
        throw new Error("Public job was not found.");
      }
      return job;
    },
    async submitPublicJobApplication(slug, application) {
      const publicJob = await this.getPublicJobPosting(slug);
      const id = crypto.randomUUID();
      mockJobApplications.set(id, {
        id,
        tenantId: "mock-tenant",
        jobPostingId: publicJob.id,
        candidateId: crypto.randomUUID(),
        sourceTenantId: "mock-tenant",
        applicantName: application.name,
        applicantEmail: application.email,
        applicantPhone: application.phone ?? null,
        applicantLocation: application.location ?? null,
        linkedinUrl: application.linkedinUrl ?? null,
        portfolioUrl: application.portfolioUrl ?? null,
        resumeStoragePath: null,
        resumeSourceDocumentId: null,
        resumeOriginalFilename: application.resumeOriginalFilename ?? null,
        resumeIngestionStatus: application.resumeFile ? "queued" : "not_uploaded",
        resumeIngestionError: null,
        candidateHubVisibility: "platform",
        coverNote: application.coverNote ?? "",
        consentGiven: application.consent,
        status: "new",
        source: "public_job_board",
        submittedAt: new Date().toISOString(),
        reviewedByUserId: null,
        reviewedAt: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return { accepted: true, applicationId: id, submittedAt: new Date().toISOString() };
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
    async getInsightsDashboard(options) {
      await wait(90);
      const targetSkills = resolveGapRequirements(
        { targetRole: options?.targetRole, targetSkills: options?.targetSkills },
        insightsDashboardSnapshot.skillsFrequency.map((item) => item.skill),
      );
      return {
        ...insightsDashboardSnapshot,
        gapAnalysis: {
          ...insightsDashboardSnapshot.gapAnalysis,
          targetRole: options?.targetRole ?? insightsDashboardSnapshot.gapAnalysis.targetRole,
          targetSkills,
        },
        skillsFrequency: insightsDashboardSnapshot.skillsFrequency.slice(0, Math.max(1, Math.min(200, options?.topSkills ?? 50))),
      };
    },
    async getInsightsGapAnalysis(options) {
      await wait(70);
      const targetSkills = resolveGapRequirements(
        { targetRole: options?.targetRole, targetSkills: options?.targetSkills },
        insightsDashboardSnapshot.skillsFrequency.map((item) => item.skill),
      );
      return {
        ...insightsDashboardSnapshot.gapAnalysis,
        targetRole: options?.targetRole ?? insightsDashboardSnapshot.gapAnalysis.targetRole,
        targetSkills,
      };
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
    async listAdminTenants() {
      await wait(80);
      return [];
    },
    async createTenantAccount() {
      throw new Error("Account provisioning requires Supabase.");
    },
    async addUserToTenant() {
      throw new Error("Account provisioning requires Supabase.");
    },
    async getPlatformRuntimeConfig() {
      await wait(80);
      return { settings: [], updatedAt: null };
    },
    async savePlatformRuntimeConfig() {
      throw new Error("Runtime settings require Supabase.");
    },
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
      if (!supabase || !tenantIds?.length) {
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
        return await invokePlatform<ManatalSyncStatus>("manatal_sync_status", {
          tenant_ids: tenantIds,
        });
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
        const payload = await invokePlatform<JsonRecord>("candidate_detail", {
          candidate_id: candidateId,
        });

        return mapRemoteCandidate(
          asRecord(payload.dossier) as CandidateDossierRow,
          asArray(payload.chunks) as CandidateChunkRow[],
        );
      } catch (error) {
        console.error("candidate_detail platform error", error);

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
      const hasGcsOriginal = isGcsSource(sourceUri) || isGcsSource(storagePath);

      if (supabase && (context?.candidateId || context?.documentId)) {
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

      if (supabase && storagePath && !hasGcsOriginal) {
        try {
          const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(storagePath, 60 * 10);
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
      if (!supabase) {
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
    async listJobPostings(tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return supabase ? [] : mock.listJobPostings(tenantIds);
      }
      const rows = await invokePlatform<unknown[]>("job_postings", {
        tenant_ids: tenantIds,
      });
      return (rows ?? []).map(mapRemoteJobPosting);
    },
    async getJobPosting(jobId) {
      if (!supabase) {
        return mock.getJobPosting(jobId);
      }
      const row = await invokePlatform<unknown>("job_posting", {
        job_id: jobId,
      });
      return mapRemoteJobPosting(row);
    },
    async saveJobPosting(job) {
      if (!supabase) {
        return mock.saveJobPosting(job);
      }
      const row = await invokePlatform<unknown>("save_job_posting", {
        job: jobPostingPayload(job),
      });
      return mapRemoteJobPosting(row);
    },
    async extractJobPosting(input) {
      if (!supabase) {
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
      if (!supabase) {
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
      if (!supabase) {
        return mock.listJobMatchingRuns(jobId);
      }
      const rows = await invokePlatform<unknown[]>("matching_runs", {
        job_id: jobId,
      });
      return (rows ?? []).map(mapRemoteJobMatchingRun);
    },
    async getJobMatchingRun(runId) {
      if (!supabase) {
        return mock.getJobMatchingRun(runId);
      }
      const payload = await invokePlatform<unknown>("matching_run", {
        run_id: runId,
      });
      return mapRemoteJobMatchingRunDetail(payload);
    },
    async listJobShortlists(jobId) {
      if (!supabase) {
        return mock.listJobShortlists(jobId);
      }
      const rows = await invokePlatform<unknown[]>("job_shortlists", {
        job_id: jobId,
      });
      return (rows ?? []).map(mapRemoteJobShortlist);
    },
    async getJobShortlist(shortlistId) {
      if (!supabase) {
        return mock.getJobShortlist(shortlistId);
      }
      const payload = await invokePlatform<unknown>("job_shortlist", {
        shortlist_id: shortlistId,
      });
      return mapRemoteJobShortlistDetail(payload);
    },
    async saveJobShortlist(input) {
      if (!supabase) {
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
      if (!supabase) {
        return mock.listJobApplications(jobId);
      }
      const rows = await invokePlatform<unknown[]>("job_applications", {
        job_id: jobId,
      });
      return (rows ?? []).map(mapRemoteJobApplication);
    },
    async updateJobApplicationStatus(applicationId, status) {
      if (!supabase) {
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
    async listPublicJobPostings() {
      if (!supabase) {
        return mock.listPublicJobPostings();
      }
      const payload = await invokeFunction<JsonRecord>("public-jobs", {
        action: "list",
      });
      return asArray(payload.jobs).map(mapRemotePublicJob);
    },
    async getPublicJobPosting(slug) {
      if (!supabase) {
        return mock.getPublicJobPosting(slug);
      }
      const payload = await invokeFunction<JsonRecord>("public-jobs", {
        action: "detail",
        slug,
      });
      return mapRemotePublicJob(asRecord(payload.job));
    },
    async submitPublicJobApplication(slug, application) {
      if (!supabase) {
        return mock.submitPublicJobApplication(slug, application);
      }
      const payload = await invokeFunction<unknown>("public-jobs", {
        action: "apply",
        slug,
        application: publicApplicationPayload(application),
      });
      return mapPublicReceipt(payload);
    },
    async getParsingOverview(tenantIds, options) {
      if (!supabase || !tenantIds?.length) {
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
      if (!supabase || !tenantIds?.length) {
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
      if (!supabase || !tenantIds?.length) {
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
      if (!supabase || !tenantId) {
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
      if (!supabase || !tenantId) {
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
      if (!supabase || !tenantIds?.length) {
        return mock.getInsightsDashboard(options, tenantIds);
      }

      if (USE_INSIGHTS_PLATFORM_API) {
        try {
          const payload = await invokePlatform<JsonRecord>(
            "insights_dashboard",
            {
              tenant_ids: tenantIds,
              top_skills: options?.topSkills ?? 50,
              target_role: options?.targetRole ?? null,
              target_skills: options?.targetSkills ?? [],
              trace_id: `insights-${Date.now()}`,
            },
          );
          return mapRemoteInsightsDashboard(payload);
        } catch {
          // Fall through to direct RPC so deployed database functions can still serve the page
          // while the Edge Function rollout catches up.
        }
      }

      try {
        return await fetchInsightsDashboardFromRpc(options, tenantIds);
      } catch {
        return fetchInsightsDashboardFromSearchCache(options, tenantIds);
      }
    },
    async getInsightsGapAnalysis(options, tenantIds) {
      if (!supabase || !tenantIds?.length) {
        return mock.getInsightsGapAnalysis(options, tenantIds);
      }

      if (USE_INSIGHTS_PLATFORM_API) {
        try {
          const payload = await invokePlatform<JsonRecord>(
            "insights_gap_analysis",
            {
              tenant_ids: tenantIds,
              target_role: options?.targetRole ?? null,
              target_skills: options?.targetSkills ?? [],
              trace_id: `insights-gap-${Date.now()}`,
            },
          );
          return mapRemoteInsightsGapAnalysis(payload);
        } catch {
          // Same rollout-safe fallback as the dashboard endpoint.
        }
      }

      try {
        return await fetchInsightsGapAnalysisFromRpc(options, tenantIds);
      } catch {
        return (
          await fetchInsightsDashboardFromSearchCache(
            {
              topSkills: 1,
              targetRole: options?.targetRole,
              targetSkills: options?.targetSkills,
            },
            tenantIds,
          )
        ).gapAnalysis;
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
