import type {
  CandidateListGroup,
  CandidateListGroupBy,
  CandidateListItem,
  CandidateListOptions,
  CandidateListResponse,
  CandidateShortlistItem,
  JobApplication,
  JobApplicationLink,
  JobApplicationLinkInput,
  JobApplicationSourceCategory,
  JobApplicationSourceCategoryInput,
  JobPosting,
} from "@/lib/contracts";
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
  insightsDashboardSnapshot,
  indexingWorkbench,
  opsAlerts,
  parsingOverview,
  publishParserProfile,
  saveParserProfile,
  searchCandidates,
  systemHealth,
} from "@/data/mockData";
import { isBrowserOpenableSource } from "@/features/candidates/apiMappers";
import { createFallbackSearchFilterOptions, debugFiltersFromSearchFilters } from "@/features/search/apiMappers";
import { resolveGapRequirements } from "@/lib/insightsGap";
import { buildMockInsightReport } from "@/features/insights/insightReport.helpers";
import type { InsightReportInput, InsightReportRunDetail } from "@/lib/contracts";
import type { PlatformApi } from "@/lib/platformApiTypes";
import { normalizeSkillList } from "@/lib/searchTaxonomy";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockShortlistItems = new Map<string, CandidateShortlistItem>();
const mockJobPostings = new Map<string, JobPosting>();
const mockJobApplications = new Map<string, JobApplication>();
const mockJobApplicationSourceCategories = new Map<string, JobApplicationSourceCategory>();
const mockJobApplicationLinks = new Map<string, JobApplicationLink>();
const mockInsightReportRuns = new Map<string, InsightReportRunDetail>();

function generateMockLinkToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
}

async function createMockInsightReportRun(
  input: InsightReportInput,
  tenantIds?: string[],
): Promise<InsightReportRunDetail> {
  const tenantId = tenantIds?.[0] ?? "mock-tenant";
  const runId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const runningDetail: InsightReportRunDetail = {
    run: {
      id: runId,
      tenantId,
      initiatedByUserId: null,
      status: "running",
      reportType: input.reportType,
      inputConfig: {
        reportType: input.reportType,
        focus: input.focus ?? input.targetRole ?? null,
        targetRole: input.focus ?? input.targetRole ?? null,
        targetSkills: input.targetSkills ?? [],
      },
      failureReason: null,
      llmProvider: null,
      llmModel: null,
      startedAt: createdAt,
      completedAt: null,
      createdAt,
    },
    report: null,
  };
  mockInsightReportRuns.set(runId, runningDetail);
  await wait(120);

  const targetSkills = resolveGapRequirements(
    { targetRole: input.focus ?? input.targetRole, targetSkills: input.targetSkills },
    insightsDashboardSnapshot.skillsFrequency.map((item) => item.skill),
  );
  const dashboard = {
    ...insightsDashboardSnapshot,
    gapAnalysis: {
      ...insightsDashboardSnapshot.gapAnalysis,
      targetRole: input.focus ?? input.targetRole ?? insightsDashboardSnapshot.gapAnalysis.targetRole,
      targetSkills,
    },
  };
  const report = buildMockInsightReport(
    dashboard,
    input.reportType,
    input.focus ?? input.targetRole,
  );
  const completedDetail: InsightReportRunDetail = {
    run: {
      ...runningDetail.run,
      status: "completed",
      llmProvider: "mock",
      llmModel: "local-demo",
      completedAt: new Date().toISOString(),
    },
    report,
  };
  mockInsightReportRuns.set(runId, completedDetail);
  return completedDetail;
}

function buildMockCandidatesList(options: CandidateListOptions = {}): CandidateListResponse {
  const pageSize = Math.max(1, Math.min(200, Math.trunc(options.pageSize ?? 50)));
  const pageIndex = Math.max(0, Math.trunc(options.pageIndex ?? 0));
  const filters = options.filters ?? {};
  const groupBy = (filters.groupBy ?? "") as CandidateListGroupBy | "";
  const allResults = searchCandidates("", {}, { limit: 100, offset: 0 }).results;
  const query = filters.query?.trim().toLowerCase() ?? "";

  const baseItems: CandidateListItem[] = allResults.map((candidate) => {
    const stageKey = candidate.stage.toLowerCase().replace(/\s+/g, "_");
    const roleLabel = candidate.primaryRole || "Unassigned role";
    const locationLabel = candidate.location.trim() || "Unknown location";
    const sourceLabel = "mock_upload";
    return {
      tenantId: "mock-tenant",
      candidateId: candidate.candidateId,
      name: candidate.name,
      email: null,
      location: candidate.location,
      primaryRole: candidate.primaryRole,
      appliedRole: candidate.primaryRole,
      stage: candidate.stage,
      stageKey,
      source: sourceLabel,
      seniority: candidate.seniority,
      updatedAt: new Date().toISOString(),
      groupKey: groupBy === "status" ? stageKey : groupBy === "role" ? roleLabel : groupBy === "source" ? sourceLabel : groupBy === "location" ? locationLabel : null,
      groupLabel: groupBy === "status" ? candidate.stage : groupBy === "role" ? roleLabel : groupBy === "source" ? "Mock upload" : groupBy === "location" ? locationLabel : null,
    };
  });

  const filtered = baseItems.filter((item) => {
    if (query && !`${item.name} ${item.email ?? ""}`.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.status && item.stageKey !== filters.status) {
      return false;
    }
    if (filters.role) {
      const roleQuery = filters.role.toLowerCase();
      if (!`${item.primaryRole} ${item.appliedRole ?? ""}`.toLowerCase().includes(roleQuery)) {
        return false;
      }
    }
    if (filters.source && item.source !== filters.source) {
      return false;
    }
    if (filters.location && !item.location.toLowerCase().includes(filters.location.toLowerCase())) {
      return false;
    }
    return true;
  });

  filtered.sort((left, right) => {
    const groupCompare = String(left.groupKey ?? "").localeCompare(String(right.groupKey ?? ""));
    if (groupCompare !== 0) {
      return groupCompare;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });

  const offset = pageIndex * pageSize;
  const items = filtered.slice(offset, offset + pageSize);
  const groupCounts = new Map<string, CandidateListGroup>();
  for (const item of filtered) {
    if (!item.groupKey || !item.groupLabel) {
      continue;
    }
    const current = groupCounts.get(item.groupKey);
    if (current) {
      current.count += 1;
    } else {
      groupCounts.set(item.groupKey, { key: item.groupKey, label: item.groupLabel, count: 1 });
    }
  }

  return {
    items,
    itemsTotalCount: filtered.length,
    pageLimit: pageSize,
    pageOffset: offset,
    groupBy: groupBy || null,
    groups: Array.from(groupCounts.values()).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
    filterOptions: {
      statuses: Array.from(new Set(baseItems.map((item) => item.stageKey))).sort(),
      roles: Array.from(new Set(baseItems.map((item) => item.primaryRole).filter(Boolean))).sort(),
      sources: Array.from(new Set(baseItems.map((item) => item.source))).sort(),
      locations: Array.from(new Set(baseItems.map((item) => item.location).filter(Boolean))).sort(),
    },
  };
}

export function createMockApi(): PlatformApi {
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
      const explicitFilters = debugFiltersFromSearchFilters(filters);

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
    async listJobApplicationSourceCategories(tenantId) {
      return Array.from(mockJobApplicationSourceCategories.values())
        .filter((category) => category.tenantId === tenantId)
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    async saveJobApplicationSourceCategory(input: JobApplicationSourceCategoryInput) {
      const existingId = input.categoryId;
      const id = existingId ?? crypto.randomUUID();
      const category: JobApplicationSourceCategory = {
        id,
        tenantId: input.tenantId,
        name: input.name,
        description: input.description ?? "",
        isActive: input.isActive !== false,
        createdAt: existingId
          ? mockJobApplicationSourceCategories.get(existingId)?.createdAt ?? new Date().toISOString()
          : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockJobApplicationSourceCategories.set(id, category);
      return category;
    },
    async listJobApplicationLinks(jobId) {
      return Array.from(mockJobApplicationLinks.values())
        .filter((link) => link.jobPostingId === jobId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    async saveJobApplicationLink(input: JobApplicationLinkInput) {
      const category = mockJobApplicationSourceCategories.get(input.sourceCategoryId);
      if (!category) {
        throw new Error("Source category was not found.");
      }
      const existingId = input.linkId;
      const id = existingId ?? crypto.randomUUID();
      const existing = existingId ? mockJobApplicationLinks.get(existingId) : null;
      const link: JobApplicationLink = {
        id,
        tenantId: category.tenantId,
        jobPostingId: input.jobId,
        sourceCategoryId: input.sourceCategoryId,
        sourceCategoryName: category.name,
        token: existing?.token ?? generateMockLinkToken(),
        label: input.label ?? "",
        sourceDetail: input.sourceDetail ?? "",
        campaignName: input.campaignName ?? "",
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        utmTerm: input.utmTerm ?? null,
        utmContent: input.utmContent ?? null,
        isActive: input.isActive !== false,
        createdByUserId: null,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockJobApplicationLinks.set(id, link);
      return link;
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
      const resolvedLink = application.refToken
        ? Array.from(mockJobApplicationLinks.values()).find((link) =>
          link.token === application.refToken && link.isActive && link.jobPostingId === publicJob.id
        ) ?? null
        : null;
      if (application.refToken && !resolvedLink) {
        throw new Error("This application link is invalid or inactive.");
      }
      const id = crypto.randomUUID();
      const sourceAttribution = resolvedLink
        ? {
          linkId: resolvedLink.id,
          categoryId: resolvedLink.sourceCategoryId,
          categoryName: resolvedLink.sourceCategoryName,
          label: resolvedLink.label,
          sourceDetail: resolvedLink.sourceDetail,
          campaignName: resolvedLink.campaignName,
          utm: {
            source: resolvedLink.utmSource,
            medium: resolvedLink.utmMedium,
            campaign: resolvedLink.utmCampaign,
            term: resolvedLink.utmTerm,
            content: resolvedLink.utmContent,
          },
        }
        : null;
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
        source: resolvedLink?.sourceCategoryName ?? "public_job_board",
        applicationLinkId: resolvedLink?.id ?? null,
        submittedAt: new Date().toISOString(),
        reviewedByUserId: null,
        reviewedAt: null,
        metadata: sourceAttribution ? { sourceAttribution } : {},
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
    async startInsightReport(input, tenantIds) {
      return createMockInsightReportRun(input, tenantIds);
    },
    async listInsightReportRuns(tenantIds, limit = 20) {
      await wait(60);
      const tenantId = tenantIds?.[0] ?? "mock-tenant";
      return Array.from(mockInsightReportRuns.values())
        .map((detail) => detail.run)
        .filter((run) => run.tenantId === tenantId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, Math.max(1, Math.min(100, limit)));
    },
    async getInsightReportRun(runId) {
      await wait(60);
      const detail = mockInsightReportRuns.get(runId);
      if (!detail) {
        throw new Error("Insight report run was not found.");
      }
      return detail;
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
