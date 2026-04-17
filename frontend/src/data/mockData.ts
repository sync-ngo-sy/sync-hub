import type {
  AccessRoster,
  AnalyticsSnapshot,
  AskResponse,
  CandidateDetail,
  CandidateSearchResult,
  ComparisonResponse,
  DataConnector,
  IndexingJob,
  IndexingWorkbench,
  SearchFilters,
  SearchResponse,
  SystemHealth,
} from "@/lib/contracts";

const candidates: CandidateDetail[] = [
  {
    candidateId: "elena-rostova",
    name: "Elena Rostova",
    currentTitle: "Senior Backend Platform Engineer",
    headline: "Distributed systems leader focused on GraphQL federation and platform reliability.",
    location: "London, United Kingdom",
    yearsExperience: 8,
    seniority: "senior",
    primaryRole: "backend",
    topSkills: ["Node.js", "GraphQL", "PostgreSQL", "Kafka", "Kubernetes", "Redis"],
    matchScore: 96,
    matchSignals: { semantic: 0.94, skill: 0.97, experience: 0.9 },
    shortSummary:
      "Excellent fit for senior backend search. Strong evidence across API architecture, platform ownership, and operating GraphQL services at scale.",
    longSummary:
      "Elena combines backend architecture depth with platform execution discipline. Her recent work shows ownership of multi-tenant GraphQL services, event-driven integrations, and performance hardening in production environments. The retrieved evidence highlights strong systems design judgment, clear migration experience, and practical experience working with recruiter-facing product constraints.",
    strengths: [
      "Deep Node.js and GraphQL delivery experience in production",
      "Strong platform and reliability posture with Kafka and Kubernetes",
      "Comfortable with schema governance, tenancy, and search-facing APIs",
    ],
    risks: [
      "Has spent the last 18 months closer to platform enablement than product feature teams",
      "Would need calibration if the role expects heavy frontend ownership",
    ],
    recommendedRoles: ["Backend Engineer", "Platform Engineer", "API Engineer"],
    stage: "Interview Loop",
    availability: "30 days",
    avatarHue: 174,
    matchNarrative: "Exceptional structural fit with direct overlap on Node.js, GraphQL, and distributed backend operations.",
    links: ["github.com/elenar", "linkedin.com/in/elenarostova"],
    education: ["BSc, Computer Science, University College London"],
    certifications: ["CKAD", "AWS Solutions Architect Associate"],
    languages: ["English", "Russian"],
    projects: [
      "Rebuilt recruiter profile ingestion to support chunk-level reindexing and zero-downtime schema evolution.",
      "Owned GraphQL federation gateway with tenancy-aware caching and persisted query governance.",
    ],
    timeline: [
      {
        employer: "Studio Null",
        role: "Senior Backend Platform Engineer",
        start: "2022",
        end: "Present",
        scope: "Platform search and profile intelligence for a global talent product.",
        highlights: [
          "Cut search API p95 by 34% through cache partitioning and query simplification.",
          "Led rollout of chunk-level embeddings and tenant-safe retrieval policies.",
        ],
      },
      {
        employer: "Data Relay",
        role: "Backend Engineer",
        start: "2019",
        end: "2022",
        scope: "Node.js services for event ingestion and customer-facing APIs.",
        highlights: [
          "Introduced GraphQL schema review workflow and contract testing.",
          "Designed Kafka-based backfill pipeline for profile enrichment.",
        ],
      },
      {
        employer: "Formless Labs",
        role: "Software Engineer",
        start: "2016",
        end: "2019",
        scope: "Internal tooling and services for analytics and workforce operations.",
        highlights: ["Built Postgres-backed reporting APIs and synchronization workers."],
      },
    ],
    evidence: [
      {
        id: "e1",
        chunkType: "experience",
        excerpt: "Designed and operated Node.js microservices powering GraphQL recruiter search across 9 enterprise tenants.",
        relevance: 0.98,
      },
      {
        id: "e2",
        chunkType: "projects",
        excerpt: "Implemented event-driven resume indexing pipeline with Kafka, Redis, and rolling backfills.",
        relevance: 0.95,
      },
      {
        id: "e3",
        chunkType: "skills",
        excerpt: "Primary stack: Node.js, GraphQL federation, PostgreSQL, Redis, Kubernetes, Terraform.",
        relevance: 0.97,
      },
    ],
    cvPreview: ["Summary", "Experience timeline with platform search ownership", "Projects covering retrieval and indexing", "Skills matrix with backend and platform depth"],
  },
  {
    candidateId: "marcus-thorne",
    name: "Marcus Thorne",
    currentTitle: "Staff Backend Engineer",
    headline: "API systems architect with deep GraphQL, billing, and data synchronization experience.",
    location: "Berlin, Germany",
    yearsExperience: 10,
    seniority: "staff",
    primaryRole: "backend",
    topSkills: ["Node.js", "TypeScript", "GraphQL", "MySQL", "RabbitMQ", "Terraform"],
    matchScore: 92,
    matchSignals: { semantic: 0.89, skill: 0.93, experience: 0.96 },
    shortSummary:
      "High-confidence backend candidate with strong Node.js depth and strong experience scaling API surfaces for complex domains.",
    longSummary:
      "Marcus is strongest when the platform needs a senior engineer to rationalize backend surface area and build trustworthy interfaces for product teams. The evidence indicates consistent work across Node.js service boundaries, GraphQL schema design, and platform automation. His search fit is high, though less explicitly aligned to search and ranking than Elena.",
    strengths: [
      "Strong service decomposition and API design skills",
      "Longer tenure operating critical backend systems",
      "Good overlap on TypeScript, GraphQL, and infrastructure automation",
    ],
    risks: ["Less evidence on retrieval systems or ranking logic", "Search-specific domain knowledge would need to ramp"],
    recommendedRoles: ["Backend Engineer", "Platform Engineer"],
    stage: "Shortlist",
    availability: "45 days",
    avatarHue: 209,
    matchNarrative: "Strong backend architect with good overlap on APIs and infrastructure, slightly lighter direct search relevance.",
    links: ["github.com/mthorne", "linkedin.com/in/marcusthorne"],
    education: ["MSc, Distributed Systems, TU Berlin"],
    certifications: ["AWS Developer Associate"],
    languages: ["English", "German"],
    projects: [
      "Refactored API estate into tenancy-aware services with contract-driven releases.",
      "Introduced GraphQL schema linting and resolver observability across 12 teams.",
    ],
    timeline: [
      {
        employer: "DataCorp",
        role: "Staff Backend Engineer",
        start: "2021",
        end: "Present",
        scope: "Led backend architecture for marketplace APIs and data synchronization.",
        highlights: [
          "Reduced API failure rate by 40% with schema deprecation rules and retries.",
          "Implemented cross-region sync workers with RabbitMQ and Terraform automation.",
        ],
      },
      {
        employer: "Cloud Ledger",
        role: "Senior Software Engineer",
        start: "2017",
        end: "2021",
        scope: "Built TypeScript and Node.js services for billing and analytics.",
        highlights: [
          "Shipped GraphQL gateway for internal product teams.",
          "Led migration from monolith reporting jobs to queue-driven pipelines.",
        ],
      },
      {
        employer: "Mesh Works",
        role: "Software Engineer",
        start: "2013",
        end: "2017",
        scope: "Backend services and internal developer platform.",
        highlights: ["Owned core Node.js middleware and observability tooling."],
      },
    ],
    evidence: [
      {
        id: "m1",
        chunkType: "experience",
        excerpt: "Led GraphQL API governance and tenancy-aware service decomposition for a multi-product platform.",
        relevance: 0.91,
      },
      {
        id: "m2",
        chunkType: "skills",
        excerpt: "Node.js, TypeScript, GraphQL, RabbitMQ, Terraform, MySQL.",
        relevance: 0.93,
      },
      {
        id: "m3",
        chunkType: "projects",
        excerpt: "Built cross-region synchronization jobs and change-data capture workers for customer profile data.",
        relevance: 0.88,
      },
    ],
    cvPreview: ["Executive summary", "Backend architecture experience", "Migration programs", "Core technology stack"],
  },
  {
    candidateId: "layla-haddad",
    name: "Layla Haddad",
    currentTitle: "Senior Full-Stack Engineer",
    headline: "Product-oriented engineer bridging recruiter workflows, search UX, and backend APIs.",
    location: "Amman, Jordan",
    yearsExperience: 7,
    seniority: "senior",
    primaryRole: "fullstack",
    topSkills: ["Node.js", "React", "PostgreSQL", "Next.js", "GraphQL", "Supabase"],
    matchScore: 88,
    matchSignals: { semantic: 0.86, skill: 0.84, experience: 0.82 },
    shortSummary:
      "Strong all-rounder with enough backend depth for product-facing search features and better frontend range than the top two candidates.",
    longSummary:
      "Layla stands out when the team needs one engineer comfortable across recruiter UI, search results shaping, and supporting backend services. The profile is not as platform-heavy, but it is especially useful if the roadmap mixes discovery UX with backend search delivery.",
    strengths: [
      "Good balance of backend and recruiter-facing interface work",
      "Direct relevance to shared-hosting and static frontend delivery constraints",
      "Evidence on Supabase and pragmatic product iteration",
    ],
    risks: ["Less evidence on high-scale distributed systems", "Would need support on deep infrastructure and SRE topics"],
    recommendedRoles: ["Full-Stack Engineer", "Product Engineer"],
    stage: "Screening",
    availability: "Immediate",
    avatarHue: 332,
    matchNarrative: "Best fit if the role needs strong product delivery across search UX and backend APIs, not just platform depth.",
    links: ["github.com/laylah", "linkedin.com/in/laylahaddad"],
    education: ["BSc, Software Engineering, Princess Sumaya University"],
    certifications: ["Supabase Certified Developer"],
    languages: ["English", "Arabic"],
    projects: [
      "Shipped static recruiter console on shared hosting backed by Supabase RPC and edge functions.",
      "Built explainable search result cards with evidence snippets and ranking diagnostics.",
    ],
    timeline: [
      {
        employer: "Sync Works",
        role: "Senior Full-Stack Engineer",
        start: "2023",
        end: "Present",
        scope: "Owner of recruiter discovery UI and supporting backend search APIs.",
        highlights: [
          "Built search and comparison screens against Supabase functions.",
          "Introduced dossier evidence design that reduced recruiter review time.",
        ],
      },
      {
        employer: "Product Atlas",
        role: "Full-Stack Engineer",
        start: "2020",
        end: "2023",
        scope: "Feature delivery across React and Node.js systems.",
        highlights: ["Implemented recommendation workflows and dashboard analytics."],
      },
      {
        employer: "Orbital Labs",
        role: "Software Engineer",
        start: "2017",
        end: "2020",
        scope: "Web product engineering and API integration.",
        highlights: ["Owned profile onboarding and workflow automation features."],
      },
    ],
    evidence: [
      {
        id: "l1",
        chunkType: "projects",
        excerpt: "Delivered recruiter search UI with evidence-backed explanations and saved comparisons.",
        relevance: 0.86,
      },
      {
        id: "l2",
        chunkType: "skills",
        excerpt: "Node.js, React, GraphQL, Next.js, PostgreSQL, Supabase.",
        relevance: 0.87,
      },
      {
        id: "l3",
        chunkType: "summary",
        excerpt: "Combines backend API work with polished recruiter-facing product delivery.",
        relevance: 0.82,
      },
    ],
    cvPreview: ["Profile summary", "Recruiter product work", "Technology stack", "Delivery highlights"],
  },
];

export const defaultSearchQuery = "engineer OR developer";
export const defaultCompareIds = ["elena-rostova", "marcus-thorne"];
export const defaultIntelligenceIds = ["elena-rostova", "marcus-thorne", "layla-haddad"];

export const analyticsSnapshot: AnalyticsSnapshot = {
  headline: [
    { label: "Qualified matches this week", value: "184", delta: "+12%" },
    { label: "Average search latency", value: "41 ms", delta: "-9%" },
    { label: "Comparison sessions", value: "68", delta: "+18%" },
    { label: "Recruiter adoption", value: "92%", delta: "+6 pts" },
  ],
  funnelVelocity: [
    { stage: "Search", value: 96 },
    { stage: "Shortlist", value: 78 },
    { stage: "Dossier review", value: 67 },
    { stage: "Interview", value: 56 },
    { stage: "Offer", value: 34 },
  ],
  sourceMix: [
    { label: "Direct upload", value: 38 },
    { label: "ATS sync", value: 32 },
    { label: "LinkedIn export", value: 18 },
    { label: "Referral import", value: 12 },
  ],
  aiInsights: [
    "GraphQL and multi-tenant platform queries convert 1.7x better than generic backend searches.",
    "Dossier opens increase when evidence snippets mention exact infrastructure terms from the recruiter query.",
    "Comparisons that include required-skills gaps reduce false-positive outreach on staff-level roles.",
  ],
  searchPatterns: [
    { label: "Highest-converting query", value: "Senior backend engineer + GraphQL", detail: "28% shortlist rate" },
    { label: "Fastest-growing filter", value: "Shared hosting / static frontend", detail: "Up 3.2x week over week" },
    { label: "Most used intent preset", value: "Platform reliability", detail: "Used in 44 searches" },
  ],
};

export const systemHealth: SystemHealth = {
  overallStatus: "Healthy",
  latencyMs: 42,
  uptime: "99.97%",
  memory: 64,
  services: [
    { name: "Supabase RPC", status: "healthy", latency: "28 ms", detail: "Search RPC and dossier reads within target." },
    { name: "Offline worker fleet", status: "healthy", latency: "5 active", detail: "No dead-letter growth in the last 6 hours." },
    { name: "Embedding queue", status: "warning", latency: "14 min backlog", detail: "Nightly refresh is slightly behind plan." },
    { name: "Document parsing", status: "degraded", latency: "2.1% failures", detail: "Mostly image-heavy PDFs requiring OCR fallback." },
  ],
  workerFleet: [
    { name: "worker-eu-01", region: "EU Central", queueDepth: 118, throughput: "246 CV/h" },
    { name: "worker-me-02", region: "Middle East", queueDepth: 54, throughput: "198 CV/h" },
    { name: "worker-us-03", region: "US East", queueDepth: 72, throughput: "214 CV/h" },
  ],
  logs: [
    { level: "info", message: "worker-eu-01 completed chunk embedding batch #842", timestamp: "12:42:08" },
    { level: "ok", message: "LinkedIn Recruiter connector heartbeat re-established", timestamp: "12:39:16" },
    { level: "warn", message: "OCR fallback exceeded expected threshold on ingestion shard 3", timestamp: "12:34:03" },
  ],
};

export const dataConnectors: DataConnector[] = [
  { name: "LinkedIn Recruiter Export", status: "active", records: "24,592 profiles", freshness: "Synced 14 min ago", owner: "Talent Ops" },
  { name: "Greenhouse Import", status: "active", records: "8,410 profiles", freshness: "Synced 7 min ago", owner: "Recruiting Systems" },
  { name: "Shared Folder Ingest", status: "warning", records: "6,004 CV files", freshness: "Awaiting parser retries", owner: "Operations" },
  { name: "Referral Uploads", status: "paused", records: "1,122 profiles", freshness: "Paused for taxonomy remap", owner: "People Ops" },
];

export const indexingJobs: IndexingJob[] = [
  { name: "Embedding Batch #842", progress: 68, eta: "14 min", throughput: "2.8k chunks/min" },
  { name: "Skill normalization refresh", progress: 91, eta: "3 min", throughput: "6.1k candidates/h" },
  { name: "Comparison artifact warmup", progress: 37, eta: "26 min", throughput: "88 artifacts/h" },
];

export const indexingWorkbench: IndexingWorkbench = {
  rankingWeights: [
    { label: "Semantic chunk fusion", value: 75 },
    { label: "Top-3 evidence aggregation", value: 20 },
    { label: "Explicit skill overlap", value: 5 },
  ],
  qualitySignals: [
    { label: "Chunk coverage", score: "94%", detail: "Most CVs now split into summary, experience, projects, and skills." },
    { label: "Normalization confidence", score: "89%", detail: "Primary risk remains title aliasing on imported exports." },
    { label: "Evidence traceability", score: "97%", detail: "Search cards and dossiers cite chunk IDs consistently." },
  ],
  queues: indexingJobs,
};

export const accessRoster: AccessRoster = {
  users: [
    { name: "Jane Smith", role: "Owner", status: "Active", lastSeen: "2 min ago", scope: "All tenants" },
    { name: "Sarah Chen", role: "Recruiter", status: "Active", lastSeen: "14 min ago", scope: "Engineering hiring" },
    { name: "Marcus Johnson", role: "Viewer", status: "Pending MFA", lastSeen: "Yesterday", scope: "Operations dashboards" },
    { name: "Noor Al-Khaled", role: "Admin", status: "Active", lastSeen: "7 min ago", scope: "Data and access" },
  ],
  auditTrail: [
    { actor: "Jane Smith", action: "Updated access policy", target: "Recruiter role", timestamp: "Today, 11:34" },
    { actor: "Noor Al-Khaled", action: "Revoked worker token", target: "worker-me-01", timestamp: "Today, 10:08" },
    { actor: "Sarah Chen", action: "Exported comparison dossier", target: "Elena Rostova vs Marcus Thorne", timestamp: "Today, 09:42" },
  ],
  roles: [
    { name: "Owner", summary: "Full tenant administration and policy control.", permissions: ["Manage billing", "Manage members", "Rotate worker credentials"] },
    { name: "Admin", summary: "Operational control over search, ingestion, and data policies.", permissions: ["Review health", "Manage indexes", "Manage sources"] },
    { name: "Recruiter", summary: "Run searches, compare candidates, and review dossiers.", permissions: ["Search", "Compare", "View dossiers"] },
  ],
};

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+.#-]+/)
    .filter((token) => token.length > 2);
}

function calculateSearchResult(candidate: CandidateDetail, query: string, filters: SearchFilters): CandidateSearchResult | null {
  const haystack = [
    candidate.name,
    candidate.currentTitle,
    candidate.headline,
    candidate.shortSummary,
    candidate.longSummary,
    candidate.primaryRole,
    candidate.location,
    ...candidate.topSkills,
    ...candidate.recommendedRoles,
  ]
    .join(" ")
    .toLowerCase();

  const tokens = tokenize(query);
  const matchedTokens = tokens.filter((token) => haystack.includes(token)).length;
  const semantic = tokens.length ? Math.min(1, 0.45 + matchedTokens / (tokens.length * 1.2)) : 0.76;

  const requiredSkills = filters.skills ?? [];
  const matchedSkills = requiredSkills.filter((skill) =>
    candidate.topSkills.some((candidateSkill) => candidateSkill.toLowerCase() === skill.toLowerCase()),
  );
  const skillSignal =
    requiredSkills.length > 0
      ? matchedSkills.length / requiredSkills.length
      : Math.min(1, candidate.topSkills.filter((skill) => tokens.some((token) => skill.toLowerCase().includes(token))).length / 4);

  const requiredYears = filters.minYearsExperience ?? 0;
  const experience = requiredYears > 0 ? Math.min(1, candidate.yearsExperience / requiredYears) : Math.min(1, candidate.yearsExperience / 10);

  if (filters.role && candidate.primaryRole !== filters.role && !candidate.currentTitle.toLowerCase().includes(filters.role.toLowerCase())) {
    return null;
  }
  if (filters.seniority && candidate.seniority !== filters.seniority) {
    return null;
  }
  if (requiredYears && candidate.yearsExperience < requiredYears) {
    return null;
  }
  if (filters.location && !candidate.location.toLowerCase().includes(filters.location.toLowerCase())) {
    return null;
  }

  const score = Math.round(((0.6 * semantic + 0.25 * skillSignal + 0.15 * experience) * 100 + candidate.matchScore) / 2);

  return {
    candidateId: candidate.candidateId,
    name: candidate.name,
    currentTitle: candidate.currentTitle,
    headline: candidate.headline,
    location: candidate.location,
    yearsExperience: candidate.yearsExperience,
    seniority: candidate.seniority,
    primaryRole: candidate.primaryRole,
    topSkills: candidate.topSkills,
    matchScore: score,
    matchSignals: { semantic, skill: skillSignal, experience },
    shortSummary: candidate.shortSummary,
    strengths: candidate.strengths,
    risks: candidate.risks,
    recommendedRoles: candidate.recommendedRoles,
    stage: candidate.stage,
    availability: candidate.availability,
    avatarHue: candidate.avatarHue,
    matchNarrative: candidate.matchNarrative,
  };
}

export function searchCandidates(query: string, filters: SearchFilters): SearchResponse {
  const results = candidates
    .map((candidate) => calculateSearchResult(candidate, query, filters))
    .filter((candidate): candidate is CandidateSearchResult => Boolean(candidate))
    .sort((left, right) => right.matchScore - left.matchScore);

  return {
    results,
    nextCursor: null,
    meta: {
      count: results.length,
      rankVersion: "mock-v1",
      source: "mock",
    },
  };
}

export function getCandidate(candidateId: string) {
  return candidates.find((candidate) => candidate.candidateId === candidateId) ?? candidates[0];
}

export function compareCandidates(candidateIds: string[], requiredSkills: string[] = []): ComparisonResponse {
  const items = candidateIds
    .map((candidateId) => getCandidate(candidateId))
    .map((candidate) => {
      const matchedSkills = candidate.topSkills.filter((skill) => requiredSkills.length === 0 || requiredSkills.includes(skill));
      const gaps = requiredSkills.filter((skill) => !candidate.topSkills.includes(skill));
      const score = Number((candidate.yearsExperience + matchedSkills.length * 0.4 + candidate.matchSignals.semantic * 10).toFixed(1));

      return {
        candidateId: candidate.candidateId,
        name: candidate.name,
        currentTitle: candidate.currentTitle,
        yearsExperience: candidate.yearsExperience,
        seniority: candidate.seniority,
        score,
        matchedSkills,
        gaps,
        strengths: candidate.strengths,
        risks: candidate.risks,
        summary: candidate.shortSummary,
      };
    })
    .sort((left, right) => right.score - left.score);

  const overlap = items
    .map((item) => (item.matchedSkills.length ? item.matchedSkills : getCandidate(item.candidateId).topSkills))
    .reduce<string[]>((memo, skills, index) => {
      if (index === 0) {
        return skills.map((skill) => skill.toLowerCase());
      }
      return memo.filter((skill) => skills.map((item) => item.toLowerCase()).includes(skill));
    }, []);

  return {
    source: "mock",
    overlap,
    recommendedCandidateId: items[0]?.candidateId ?? null,
    items,
    meta: { comparedCount: items.length },
  };
}

export function askCandidates(question: string, candidateIds: string[]): AskResponse {
  const selected = candidateIds.map((candidateId) => getCandidate(candidateId));
  const lowered = question.toLowerCase();
  const intent = lowered.includes("gap")
    ? "gaps"
    : lowered.includes("strength")
      ? "strengths"
      : lowered.includes("experience")
        ? "experience"
        : lowered.includes("compare")
          ? "compare"
          : "why_matched";

  const facts = selected.flatMap((candidate) => {
    if (intent === "gaps") {
      return candidate.risks.map((fact) => ({ candidateId: candidate.candidateId, candidateName: candidate.name, fact }));
    }
    if (intent === "strengths") {
      return candidate.strengths.map((fact) => ({ candidateId: candidate.candidateId, candidateName: candidate.name, fact }));
    }
    if (intent === "experience") {
      return [
        {
          candidateId: candidate.candidateId,
          candidateName: candidate.name,
          fact: `${candidate.name} brings ${candidate.yearsExperience} years of experience as a ${candidate.currentTitle}.`,
        },
      ];
    }
    return [{ candidateId: candidate.candidateId, candidateName: candidate.name, fact: candidate.shortSummary }];
  });

  const citations = selected.flatMap((candidate) => candidate.evidence).slice(0, 6);

  return {
    intent,
    facts,
    citations,
    contextBlocks: citations,
    extractiveAnswer: facts.slice(0, 3).map((fact) => fact.fact).join(" "),
    meta: {
      candidateCount: selected.length,
      topK: 6,
    },
  };
}
