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
  links: string[];
  education: string[];
  certifications: string[];
  languages: string[];
  projects: string[];
  timeline: TimelineEntry[];
  evidence: EvidenceSnippet[];
  cvPreview: string[];
};

export type SearchFilters = {
  role?: string;
  seniority?: string;
  minYearsExperience?: number;
  skills?: string[];
  location?: string;
};

export type SearchFilterOptions = {
  seniority: Array<{
    value: string;
    label: string;
  }>;
  skills: string[];
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
  };
};

export type ParsingFieldState = "parsed" | "partial" | "missing";

export type ParsingFieldStatus = {
  label: string;
  state: ParsingFieldState;
  detail: string;
};

export type ParsingDocumentSummary = {
  documentId: string;
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
