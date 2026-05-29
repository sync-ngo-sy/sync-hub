import type { CandidateShortlistItem } from "@/lib/contracts";
import {
  accessRoster,
  analyticsSnapshot,
  askCandidates,
  compareCandidates,
  dataConnectors,
  defaultCompareIds,
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
import { createFallbackSearchFilterOptions } from "@/lib/platformApiSearchOptions";
import type { PlatformApi } from "@/lib/platformApiTypes";
import { dedupeSorted, isBrowserOpenableSource, wait } from "@/lib/platformApiUtils";
import { normalizeSeniorityValue, normalizeSkillList } from "@/lib/searchTaxonomy";

const mockShortlistItems = new Map<string, CandidateShortlistItem>();

export function createMockApi(): PlatformApi {
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
