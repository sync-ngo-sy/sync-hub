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
  availability: string;
  avatarHue: number;
  matchNarrative: string;
};

export type CandidateDetail = CandidateSearchResult & {
  longSummary: string;
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

export type SearchResponse = {
  results: CandidateSearchResult[];
  nextCursor: number | null;
  meta: {
    count: number;
    rankVersion: string;
    source: "mock" | "remote";
  };
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
