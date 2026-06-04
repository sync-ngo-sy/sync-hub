import type {
  AccessRoster,
  AccountProvisionResult,
  MembershipRole,
  TenantAdminSummary,
  AgentResponse,
  AnalyticsSnapshot,
  AskResponse,
  CandidateDetail,
  CandidateShortlistInput,
  CandidateShortlistItem,
  ComparisonResponse,
  DataConnector,
  InsightsGapAnalysis,
  InsightsDashboardOptions,
  InsightsDashboardSnapshot,
  IndexingWorkbench,
  JobApplication,
  JobApplicationStatus,
  JobExtractionResult,
  JobMatchingRun,
  JobMatchingRunDetail,
  JobPosting,
  JobPostingInput,
  JobShortlist,
  JobShortlistDetail,
  JobShortlistInput,
  ManatalSyncStatus,
  OpsAlert,
  PlatformRuntimeConfig,
  PublicJobApplicationInput,
  PublicJobApplicationReceipt,
  PublicJobPosting,
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

export type OriginalDocumentUrlContext = {
  candidateId?: string | null;
  documentId?: string | null;
  tenantId?: string | null;
  tenantIds?: string[];
};

export type ParsingOverviewOptions = {
  pageSize?: number;
  pageIndex?: number;
  reviewFilter?: "all" | "needsReview";
  searchQuery?: string;
};

export type PlatformApi = {
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
  listJobPostings: (tenantIds?: string[]) => Promise<JobPosting[]>;
  getJobPosting: (jobId: string) => Promise<JobPosting>;
  saveJobPosting: (job: JobPostingInput) => Promise<JobPosting>;
  extractJobPosting: (input: {
    tenantId: string;
    jobId?: string;
    title?: string;
    employerRegion?: string;
    jobDescription: string;
  }) => Promise<JobExtractionResult>;
  startJobMatchingRun: (input: {
    jobId: string;
    limit?: number;
    semanticPoolSize?: number;
    rerankPoolSize?: number;
    mandatoryCriteria?: Record<string, unknown>;
  }) => Promise<JobMatchingRunDetail>;
  listJobMatchingRuns: (jobId: string) => Promise<JobMatchingRun[]>;
  getJobMatchingRun: (runId: string) => Promise<JobMatchingRunDetail>;
  listJobShortlists: (jobId: string) => Promise<JobShortlist[]>;
  getJobShortlist: (shortlistId: string) => Promise<JobShortlistDetail>;
  saveJobShortlist: (input: JobShortlistInput) => Promise<JobShortlistDetail>;
  listJobApplications: (jobId: string) => Promise<JobApplication[]>;
  updateJobApplicationStatus: (applicationId: string, status: JobApplicationStatus) => Promise<JobApplication>;
  listPublicJobPostings: () => Promise<PublicJobPosting[]>;
  getPublicJobPosting: (slug: string) => Promise<PublicJobPosting>;
  submitPublicJobApplication: (slug: string, application: PublicJobApplicationInput) => Promise<PublicJobApplicationReceipt>;
  getParsingOverview: (tenantIds?: string[], options?: ParsingOverviewOptions) => Promise<ParsingOverview>;
  getParsingDocument: (documentId: string, tenantIds?: string[]) => Promise<ParsingDocumentDetail>;
  getParserProfiles: (tenantIds?: string[]) => Promise<ParserProfile[]>;
  saveParserProfile: (profile: ParserProfileInput, tenantId?: string) => Promise<ParserProfile>;
  publishParserProfile: (profileId: string, tenantId?: string) => Promise<ParserProfile>;
  getAnalytics: () => Promise<AnalyticsSnapshot>;
  getInsightsDashboard: (options?: InsightsDashboardOptions, tenantIds?: string[]) => Promise<InsightsDashboardSnapshot>;
  getInsightsGapAnalysis: (options?: InsightsDashboardOptions, tenantIds?: string[]) => Promise<InsightsGapAnalysis>;
  getSystemHealth: () => Promise<SystemHealth>;
  getOpsAlerts: (tenantIds?: string[]) => Promise<OpsAlert[]>;
  acknowledgeOpsAlert: (dedupeKey: string) => Promise<OpsAlert | null>;
  getDataConnectors: () => Promise<DataConnector[]>;
  getIndexingWorkbench: () => Promise<IndexingWorkbench>;
  getAccessRoster: () => Promise<AccessRoster>;
  listAdminTenants: () => Promise<TenantAdminSummary[]>;
  createTenantAccount: (input: {
    email: string;
    password: string;
    tenantName: string;
    tenantSlug?: string;
    tenantIcon?: string;
    fullName?: string;
    role?: MembershipRole;
  }) => Promise<AccountProvisionResult>;
  addUserToTenant: (input: {
    email: string;
    password: string;
    tenantSlug: string;
    fullName?: string;
    role?: MembershipRole;
  }) => Promise<AccountProvisionResult>;
  getPlatformRuntimeConfig: () => Promise<PlatformRuntimeConfig>;
  savePlatformRuntimeConfig: (settings: Record<string, string | null>) => Promise<PlatformRuntimeConfig>;
};
