export type MatchSignals = {
  semantic: number;
  skill: number;
  experience: number;
};

export type EvidenceSnippet = {
  id: string;
  chunkType: "summary" | "experience" | "projects" | "skills" | "education";
  excerpt: string;
  relevance: number;
};

export type TimelineEntry = {
  employer: string;
  role: string;
  start: string;
  end: string;
  scope: string;
  highlights: string[];
};

export type CandidateSearchResult = {
  tenantId?: string | null;
  candidateId: string;
  name: string;
  currentTitle: string;
  headline: string;
  location: string;
  yearsExperience: number;
  seniority: string;
  primaryRole: string;
  topSkills: string[];
  matchScore: number;
  backendMatchRate: number;
  backendScoreRaw: number;
  matchSignals: MatchSignals;
  shortSummary: string;
  strengths: string[];
  risks: string[];
  recommendedRoles: string[];
  stage: string;
  avatarHue: number;
  matchNarrative: string;
};

export type CandidateDetail = CandidateSearchResult & {
  longSummary: string;
  email?: string | null;
  phone?: string | null;
  originalFilename?: string | null;
  sourceUri?: string | null;
  storagePath?: string | null;
  cvUrl?: string | null;
  manatalCandidateId?: string | null;
  links: string[];
  education: string[];
  certifications: string[];
  languages: string[];
  projects: string[];
  timeline: TimelineEntry[];
  evidence: EvidenceSnippet[];
  cvPreview: string[];
  status?: CandidateAvailabilityStatus | null;
jobReadinessLevel?: JobReadinessLevel | null;
preferredWorkMode?: PreferredWorkMode | null;

yearsOfExperience?: number | null;

primarySkills?: string[];

noticePeriod?: NoticePeriod | null;

englishProficiency?: EnglishProficiency | null;

expectedSalary?: ExpectedSalary | null;

isPreScreened?: boolean;

syncAffiliation?: SyncAffiliation | null;

internalVettingNotes?: string | null;

currentLocationCity?: string | null;

willingnessToRelocate?: boolean;

externalProfiles?: ExternalProfiles | null;

aiProfileSummary?: string | null;

employmentTypePreference?: EmploymentType[];

lastInteractionDate?: string | null;
};

export type SearchFilters = {
  role?: string;
  seniority?: string;
  minYearsExperience?: number;
  skills?: string[];
  companies?: string[];
  location?: string;
};

export type SearchFilterOptions = {
  seniority: Array<{
    value: string;
    label: string;
  }>;
  skills: string[];
  companies: string[];
  locations: string[];
};

export type SearchQueryOptions = {
  limit?: number;
  offset?: number;
};

export type SearchResponse = {
  results: CandidateSearchResult[];
  nextCursor: number | null;
  meta: {
    count: number;
    rankVersion: string;
    source: "mock" | "remote";
    intentSource?: "llm" | "explicit";
    intent?: SearchFilters;
  };
};

export type CandidateShortlistItem = {
  userId: string;
  tenantId: string;
  candidateId: string;
  candidateName: string;
  currentTitle: string;
  location: string;
  yearsExperience: number | null;
  seniority: string | null;
  primaryRole: string | null;
  topSkills: string[];
  matchRate: number | null;
  cvUrl?: string | null;
  originalFilename?: string | null;
  sourceQuery: string;
  searchSnapshot: Record<string, unknown>;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CandidateShortlistInput = {
  tenantId: string;
  candidateId: string;
  candidateName: string;
  currentTitle: string;
  location: string;
  yearsExperience?: number | null;
  seniority?: string | null;
  primaryRole?: string | null;
  topSkills?: string[];
  matchRate?: number | null;
  cvUrl?: string | null;
  originalFilename?: string | null;
  sourceQuery?: string;
  searchSnapshot?: Record<string, unknown>;
  notes?: string;
};

export type JobPostingStatus = "draft" | "active" | "closed";

export type EmployerRegion = "GCC" | "EU" | "USA";

export type JobLocationInfo = {
  country?: string | null;
  city?: string | null;
  region?: EmployerRegion | string | null;
  remotePolicy?: "Onsite" | "Hybrid" | "Remote" | "Unspecified" | string;
  confidence?: number;
};

export type JobPosting = {
  id: string;
  tenantId: string;
  title: string;
  employerName: string;
  employerCountry: string;
  employerRegion: EmployerRegion;
  jobDescription: string;
  requiredSkills: string[];
  preferredSkills: string[];
  seniorityLevel: string;
  employmentType: string;
  postedDate: string | null;
  applicationDeadline: string | null;
  status: JobPostingStatus;
  locationInfo: JobLocationInfo;
  keyResponsibilities: string[];
  aiProfile: Record<string, unknown>;
  aiConfidence: Record<string, unknown>;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  closedAt: string | null;
  closedByUserId: string | null;
  isPublic: boolean;
  publicSlug: string | null;
  publicTitle: string | null;
  publicSummary: string | null;
  publicDescription: string | null;
  publicLocation: string | null;
  publicApplyEnabled: boolean;
  publicPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobPostingInput = Partial<Omit<JobPosting, "createdAt" | "updatedAt">> & {
  tenantId: string;
};

export type JobExtractionSkill = {
  name: string;
  confidence: number;
  evidence: string;
};

export type JobExtractionResult = {
  requiredSkills: JobExtractionSkill[];
  preferredSkills: JobExtractionSkill[];
  seniorityLevel: {
    value: string;
    confidence: number;
    evidence: string;
  };
  employmentType: {
    value: string;
    confidence: number;
    evidence: string;
  };
  location: JobLocationInfo;
  keyResponsibilities: string[];
  warnings: Array<{
    type: string;
    message: string;
  }>;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  inputHash: string;
};

export type JobMatchingRun = {
  id: string;
  tenantId: string;
  jobPostingId: string;
  initiatedByUserId: string | null;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  requestedLimit: number;
  semanticPoolSize: number;
  rerankPoolSize: number;
  retrievedCount: number;
  filteredCount: number;
  rerankedCount: number;
  completedCount: number;
  failureReason: string | null;
  matchingConfig: Record<string, unknown>;
  jobProfile: Record<string, unknown>;
  embeddingProvider: string | null;
  embeddingVersion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type JobCandidateMatch = {
  id: string;
  tenantId: string;
  matchingRunId: string;
  jobPostingId: string;
  candidateId: string;
  sourceTenantId: string | null;
  rank: number;
  semanticScore: number;
  aiScore: number;
  finalScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  seniorityAlignment: "Exact Match" | "Partial Match" | "Mismatch";
  experienceSummary: string;
  matchExplanation: string;
  scoringBreakdown: Record<string, unknown>;
  hardFilterPayload: Record<string, unknown>;
  candidateSnapshot: Record<string, unknown>;
  createdAt: string;
};

export type JobMatchingRunDetail = {
  run: JobMatchingRun;
  results: JobCandidateMatch[];
};

export type JobShortlist = {
  id: string;
  tenantId: string;
  jobPostingId: string;
  matchingRunId: string | null;
  name: string;
  description: string;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobShortlistCandidate = {
  id: string;
  tenantId: string;
  shortlistId: string;
  candidateId: string;
  sourceTenantId: string | null;
  savedRank: number;
  savedScore: number;
  savedResultPayload: Record<string, unknown>;
  addedByUserId: string | null;
  createdAt: string;
};

export type JobShortlistDetail = {
  shortlist: JobShortlist;
  candidates: JobShortlistCandidate[];
};

export type JobApplicationStatus = "new" | "reviewing" | "shortlisted" | "rejected" | "withdrawn";
export type ResumeIngestionStatus = "not_uploaded" | "queued" | "parsing" | "parsed" | "failed";

export type JobApplication = {
  id: string;
  tenantId: string;
  jobPostingId: string;
  candidateId: string | null;
  sourceTenantId: string | null;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string | null;
  applicantLocation: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  resumeStoragePath: string | null;
  resumeSourceDocumentId: string | null;
  resumeOriginalFilename: string | null;
  resumeIngestionStatus: ResumeIngestionStatus;
  resumeIngestionError: string | null;
  candidateHubVisibility: "platform" | "tenant" | "private";
  coverNote: string;
  consentGiven: boolean;
  status: JobApplicationStatus;
  source: string;
  submittedAt: string;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PublicJobPosting = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  location: string;
  remotePolicy: string;
  seniorityLevel: string;
  employmentType: string;
  requiredSkills: string[];
  preferredSkills: string[];
  keyResponsibilities: string[];
  applicationDeadline: string | null;
  applyEnabled: boolean;
  publishedAt: string | null;
};

export type PublicJobApplicationInput = {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  yearsExperience?: number;
  seniority?: string;
  topSkills?: string[];
  linkedinUrl?: string;
  portfolioUrl?: string;
  resumeOriginalFilename?: string;
  resumeFile?: {
    fileName: string;
    contentType: string;
    sizeBytes: number;
    base64: string;
  };
  coverNote?: string;
  consent: boolean;
  idempotencyKey?: string;
};

export type PublicJobApplicationReceipt = {
  accepted: boolean;
  duplicate?: boolean;
  applicationId?: string;
  submittedAt?: string;
};

export type JobShortlistInput = {
  jobId: string;
  runId?: string | null;
  name: string;
  description?: string;
  candidateIds?: string[];
};

export type SearchDebugFilters = {
  role: string | null;
  seniority: string | null;
  minYearsExperience: number | null;
  skills: string[];
  companies: string[];
  location: string | null;
};

export type SearchDebugEvidence = {
  id: string;
  chunkType: string;
  excerpt: string;
  relevance: number;
};

export type SearchDebugResult = {
  tenantId?: string | null;
  candidateId: string;
  name: string;
  currentTitle: string;
  location: string;
  yearsExperience: number;
  seniority: string;
  primaryRole: string;
  scoreRaw: number;
  matchRate: number;
  displayedMatchScore: number;
  subscores: Record<string, number>;
  matchedFilters: Record<string, unknown>;
  summaryShort: string;
  evidence: SearchDebugEvidence[];
};

export type SearchDebugResponse = {
  request: {
    query: string;
    limit: number;
    offset: number;
    tenantIds: string[];
    explicitFilters: SearchDebugFilters;
  };
  analysis: {
    intentSource: "llm" | "explicit";
    llmIntent: SearchDebugFilters | null;
    resolvedIntent: SearchDebugFilters;
    embedding: {
      provider: string;
      version: string | null;
      dimensions: number;
      preview: number[];
    };
    rpcPayload: Record<string, unknown>;
    engine: {
      usesLexical: boolean;
      usesSemantic: boolean;
      usesNameBoost: boolean;
      strictFilters: string[];
    };
  };
  results: SearchDebugResult[];
  nextCursor: number | null;
  meta: {
    count: number;
    rankVersion: string;
    source: "mock" | "remote";
  };
  rawResponse: Record<string, unknown>;
};

export type WorkspaceStats = {
  documentCount: number;
  candidateCount: number;
  companyCount: number;
};

export type ManatalSyncStatus = {
  generatedAt: string;
  totals: {
    sourceDocuments: number;
    gcsOriginals: number;
    driveOriginals: number;
    manatalRows: number;
    mappedManatalRows: number;
    syncedRows: number;
    pendingRows: number;
    failedRows: number;
    skippedRows: number;
  };
  coverage: {
    gcsOriginalsPercent: number;
    manatalSyncedPercent: number;
    mappedRowsPercent: number;
  };
  lastSyncedAt: string | null;
  lastFailure: {
    manatalCandidateId: string;
    candidateName: string;
    errorMessage: string;
    updatedAt: string | null;
  } | null;
  recentRows: Array<{
    manatalCandidateId: string;
    candidateName: string;
    email: string | null;
    syncStatus: string;
    lastSyncedAt: string | null;
    updatedAt: string | null;
    sourceDocumentId: string | null;
    errorMessage: string | null;
  }>;
};

export type ParsingFieldState = "parsed" | "partial" | "missing";

export type ParsingFieldStatus = {
  label: string;
  state: ParsingFieldState;
  detail: string;
};

export type ParsingDocumentSummary = {
  documentId: string;
  tenantId: string;
  candidateId: string | null;
  candidateName: string;
  currentTitle: string;
  originalFilename: string;
  mimeType: string;
  sourceType: string;
  sourceUri: string;
  uploadedAt: string;
  parsedPercentage: number;
  extractionConfidence: number;
  rawTextLength: number;
  status: string;
  qualityBand: "healthy" | "review" | "critical";
  parserVersion: string;
  modelVersion: string;
  promptVersion: string;
  embeddingVersion: string;
  warnings: string[];
  missingFields: string[];
  keyFindings: string[];
  needsAttention: boolean;
};

export type ParsingOverview = {
  overallParsedPercentage: number;
  averageConfidence: number;
  documentsCount: number;
  completedCount: number;
  needsReviewCount: number;
  failedCount: number;
  documentsWithWarnings?: number;
  missingContactCount?: number;
  lowCoverageCount?: number;
  itemsTotalCount?: number;
  pageLimit?: number;
  pageOffset?: number;
  workspaceRollups?: Array<{
    tenantId: string;
    candidates: number;
    documents: number;
    averageParse: number;
    needsReview: number;
    failed: number;
  }>;
  items: ParsingDocumentSummary[];
};

export type ParsingDocumentDetail = ParsingDocumentSummary & {
  storagePath: string | null;
  updatedAt: string;
  location: string;
  email: string;
  phone: string;
  seniority: string;
  primaryRole: string;
  yearsExperience: number;
  headline: string;
  summary: string;
  links: string[];
  skills: string[];
  languages: string[];
  certifications: string[];
  education: string[];
  projects: string[];
  timeline: TimelineEntry[];
  fieldCoverage: ParsingFieldStatus[];
  parsedSections: string[];
  parseWarnings: string[];
  processingWarnings: string[];
  errorCode: string | null;
  errorMessage: string | null;
  rawTextPreview: string;
  optimizationHints: string[];
};

export type ParserProfileStatus = "draft" | "active" | "archived";

export type ParserProfile = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  status: ParserProfileStatus;
  extractionProvider: string;
  extractionModel: string;
  parserVersion: string;
  modelVersion: string;
  promptVersion: string;
  chunkVersion: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingVersion: string;
  chunkingProfile: string;
  ocrEnabled: boolean;
  allowHeuristicFallback: boolean;
  promptTemplate: string;
  notes: string;
  lastEvaluatedAt?: string | null;
  avgParsePercentage?: number | null;
  avgConfidence?: number | null;
  documentsEvaluated: number;
  createdAt: string;
  updatedAt: string;
};

export type ParserProfileInput = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  extractionProvider: string;
  extractionModel: string;
  parserVersion: string;
  modelVersion: string;
  promptVersion: string;
  chunkVersion: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingVersion: string;
  chunkingProfile: string;
  ocrEnabled: boolean;
  allowHeuristicFallback: boolean;
  promptTemplate: string;
  notes: string;
};

export type ComparisonItem = {
  tenantId?: string | null;
  candidateId: string;
  name: string;
  currentTitle: string;
  yearsExperience: number;
  seniority: string;
  score: number;
  matchedSkills: string[];
  gaps: string[];
  strengths: string[];
  risks: string[];
  summary: string;
};

export type ComparisonResponse = {
  source: "cached_artifact" | "deterministic_fallback" | "mock";
  overlap: string[];
  recommendedCandidateId: string | null;
  items: ComparisonItem[];
  meta: {
    comparedCount: number;
  };
};

export type AskFact = {
  candidateId: string;
  candidateName: string;
  fact: string;
};

export type AskResponse = {
  intent: string;
  facts: AskFact[];
  citations: EvidenceSnippet[];
  contextBlocks: EvidenceSnippet[];
  extractiveAnswer: string;
  meta: {
    candidateCount: number;
    topK: number;
    answerSource?: string;
    scopeSource?: "explicit" | "retrieved" | "mock" | "empty_scope" | "workspace_stats";
    resolvedCandidateIds?: string[];
  };
};

export type AgentResponse = {
  answer: string;
  citations: EvidenceSnippet[];
  contextBlocks: EvidenceSnippet[];
  meta: {
    candidateCount: number;
    topK: number;
    answerSource?: string;
    scopeSource?: "explicit" | "retrieved" | "mock" | "empty_scope" | "workspace_stats" | "general_knowledge";
    resolvedCandidateIds?: string[];
  };
};

export type AnalyticsSnapshot = {
  headline: Array<{
    label: string;
    value: string;
    delta?: string;
  }>;
  funnelVelocity: Array<{
    stage: string;
    value: number;
  }>;
  sourceMix: Array<{
    label: string;
    value: number;
  }>;
  aiInsights: string[];
  searchPatterns: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
};

export type InsightsMetric = {
  key: string;
  label: string;
  value: number;
  deltaValue: number;
  deltaPercent: number | null;
  trend: "up" | "down" | "flat";
  sparkline: number[];
};

export type InsightsDistributionItem = {
  label: string;
  value: number;
  percent?: number | null;
};

export type InsightsSkillFrequency = {
  skill: string;
  count: number;
};

export type InsightsSeniorityPyramidRow = {
  jobFamily: string;
  junior: number;
  mid: number;
  senior: number;
  lead: number;
  executive: number;
};

export type InsightsGapAnalysis = {
  targetRole: string | null;
  targetSkills: string[];
  fullyMatchingCandidates: number;
  partiallyMatchingCandidates: number;
  zeroMatchCandidates: number;
  missingSkills: Array<{
    skill: string;
    missingFromPartialCandidates: number;
  }>;
};

export type InsightsGapUseCase = {
  id: string;
  title: string;
  detail: string;
  skills: string[];
  query: string;
};

export type InsightsDashboardOptions = {
  topSkills?: number;
  targetRole?: string;
  targetSkills?: string[];
};

export type InsightsDashboardSnapshot = {
  generatedAt: string;
  metrics: InsightsMetric[];
  profilesBySeniority: InsightsDistributionItem[];
  profilesByLocation: InsightsDistributionItem[];
  jobFamilies: InsightsDistributionItem[];
  skillsFrequency: InsightsSkillFrequency[];
  gapUseCases: InsightsGapUseCase[];
  seniorityPyramid: InsightsSeniorityPyramidRow[];
  gapAnalysis: InsightsGapAnalysis;
};

export type PlatformRuntimeConfigSource = "database" | "environment" | "unset";

export type PlatformRuntimeConfigField = {
  key: string;
  value: string | null;
  source: PlatformRuntimeConfigSource;
  envName: string;
};

export type PlatformRuntimeConfig = {
  settings: PlatformRuntimeConfigField[];
  updatedAt: string | null;
};

export type SystemHealth = {
  overallStatus: string;
  latencyMs: number;
  uptime: string;
  memory: number;
  services: Array<{
    name: string;
    status: "healthy" | "degraded" | "warning";
    latency: string;
    detail: string;
  }>;
  workerFleet: Array<{
    name: string;
    region: string;
    queueDepth: number;
    throughput: string;
  }>;
  logs: Array<{
    level: "info" | "warn" | "ok";
    message: string;
    timestamp: string;
  }>;
};

export type OpsAlert = {
  dedupeKey: string;
  severity: "P0" | "P1" | "P2" | "P3";
  component: string;
  tenantId: string | null;
  alertKey: string;
  status: "firing" | "acknowledged" | "resolved";
  message: string;
  currentValue: number | null;
  threshold: number | null;
  runbookUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  context: Record<string, unknown>;
};

export type DataConnector = {
  name: string;
  status: "active" | "warning" | "paused";
  records: string;
  freshness: string;
  owner: string;
};

export type IndexingJob = {
  name: string;
  progress: number;
  eta: string;
  throughput: string;
};

export type IndexingWorkbench = {
  rankingWeights: Array<{
    label: string;
    value: number;
  }>;
  qualitySignals: Array<{
    label: string;
    score: string;
    detail: string;
  }>;
  queues: IndexingJob[];
};

export type TenantAdminSummary = {
  tenantId: string;
  slug: string;
  name: string;
  iconUrl: string;
  createdAt: string | null;
  membershipCount: number;
  candidateCount: number;
  documentCount: number;
};

export type AccountProvisionResult = {
  userId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantIcon: string;
  role: string;
  folderName: string;
};

export type MembershipRole = "owner" | "admin" | "recruiter" | "viewer";

export type AccessRoster = {
  users: Array<{
    name: string;
    role: string;
    status: string;
    lastSeen: string;
    scope: string;
  }>;
  auditTrail: Array<{
    actor: string;
    action: string;
    target: string;
    timestamp: string;
  }>;
  roles: Array<{
    name: string;
    summary: string;
    permissions: string[];
  }>;
};
export type CandidateAvailabilityStatus =
  | "active"
  | "passive"
  | "unavailable";

export type JobReadinessLevel =
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5";

export type PreferredWorkMode =
  | "onsite"
  | "remote"
  | "hybrid";

export type NoticePeriod =
  | "immediate"
  | "2_weeks"
  | "1_month"
  | "2_months"
  | "3_months";

export type EnglishProficiency =
  | "basic"
  | "intermediate"
  | "fluent"
  | "native";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "freelance";

export type SyncAffiliation =
  | "member"
  | "bootcamp_graduate"
  | "mentor"
  | "partner";

export type ExpectedSalary = {
  amount: number;
  currency: string;
};

export type ExternalProfiles = {
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
};