import type {
  AccessRoster,
  WorkspaceStats,
  AnalyticsSnapshot,
  AskResponse,
  CandidateDetail,
  CandidateSearchResult,
  ComparisonResponse,
  DataConnector,
  InsightsDashboardSnapshot,
  IndexingJob,
  IndexingWorkbench,
  OpsAlert,
  ParsingDocumentDetail,
  ParsingOverview,
  ParserProfile,
  ParserProfileInput,
  SearchFilters,
  SearchQueryOptions,
  SearchResponse,
  SystemHealth,
} from "@/lib/contracts";

const candidates: CandidateDetail[] = [
  {

    candidateId: "elena-rostova",
    name: "Elena Rostova",
    currentTitle: "Senior Backend Platform Engineer",
    jobReadinessLevel: "L4",
preferredWorkMode: "hybrid",
yearsOfExperience: 8,
primarySkills: [
  "Node.js",
  "GraphQL",
  "PostgreSQL",
  "Kafka",
  "Kubernetes"
],
noticePeriod: "1_month",
englishProficiency: "fluent",
syncAffiliation: "member",
currentLocationCity: "London",
willingnessToRelocate: true,
externalProfiles: {
  linkedin: "https://linkedin.com",
  github: "https://github.com",
  portfolio: null
},
employmentTypePreference: [
  "full_time",
  "contract"
],
aiProfileSummary:
  "Experienced backend engineer focused on distributed systems and platform reliability.",
    headline: "Distributed systems leader focused on GraphQL federation and platform reliability.",
    location: "London, United Kingdom",
    yearsExperience: 8,
    seniority: "senior",
    primaryRole: "backend",
    topSkills: ["Node.js", "GraphQL", "PostgreSQL", "Kafka", "Kubernetes", "Redis"],
    matchScore: 96,
    backendMatchRate: 96,
    backendScoreRaw: 0.96,
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
    avatarHue: 174,
    matchNarrative: "Exceptional structural fit with direct overlap on Node.js, GraphQL, and distributed backend operations.",
    email: "elena.rostova@example.com",
    phone: "+44 20 7946 0181",
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
    backendMatchRate: 92,
    backendScoreRaw: 0.92,
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
    avatarHue: 209,
    matchNarrative: "Strong backend architect with good overlap on APIs and infrastructure, slightly lighter direct search relevance.",
    email: "marcus.thorne@example.com",
    phone: "+49 30 9018 2040",
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
    backendMatchRate: 88,
    backendScoreRaw: 0.88,
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
    avatarHue: 332,
    matchNarrative: "Best fit if the role needs strong product delivery across search UX and backend APIs, not just platform depth.",
    email: "layla.haddad@example.com",
    phone: "+962 6 555 0199",
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

export const insightsDashboardSnapshot: InsightsDashboardSnapshot = {
  generatedAt: new Date().toISOString(),
  metrics: [
    { key: "total_cvs_indexed", label: "Total CVs Indexed", value: 1795, deltaValue: 124, deltaPercent: 7.4, trend: "up", sparkline: [14, 19, 22, 18, 24, 21, 26] },
    { key: "cvs_added_30d", label: "CVs Added (Last 30 Days)", value: 124, deltaValue: 19, deltaPercent: 18.1, trend: "up", sparkline: [12, 14, 17, 13, 19, 22, 27] },
    { key: "avg_parse_confidence", label: "Avg Parse Confidence", value: 91, deltaValue: 3, deltaPercent: 3.4, trend: "up", sparkline: [84, 86, 87, 88, 89, 90, 91] },
    { key: "classified_job_family", label: "Job Family Coverage", value: 100, deltaValue: 100, deltaPercent: null, trend: "up", sparkline: [0, 0, 0, 0, 0, 88, 100] },
  ],
  profilesBySeniority: [
    { label: "mid", value: 674 },
    { label: "junior", value: 506 },
    { label: "senior", value: 384 },
    { label: "unclassified", value: 186 },
    { label: "staff", value: 45 },
  ],
  profilesByLocation: [
    { label: "Damascus, Syria", value: 1021 },
    { label: "Homs, Syria", value: 80 },
    { label: "Aleppo, Syria", value: 74 },
    { label: "Syria", value: 56 },
    { label: "Dubai, United Arab Emirates", value: 54 },
  ],
  jobFamilies: [
    { label: "Cloud, DevOps & SRE", value: 415, percent: 23.1 },
    { label: "Full-Stack Engineering", value: 309, percent: 17.2 },
    { label: "Software Engineering", value: 249, percent: 13.9 },
    { label: "Mobile Engineering", value: 234, percent: 13.0 },
    { label: "AI & Machine Learning", value: 132, percent: 7.4 },
    { label: "Data & Analytics", value: 122, percent: 6.8 },
    { label: "Frontend Engineering", value: 121, percent: 6.7 },
    { label: "Backend Engineering", value: 100, percent: 5.6 },
    { label: "Cybersecurity", value: 99, percent: 5.5 },
    { label: "QA & Test Automation", value: 14, percent: 0.8 },
  ],
  skillsFrequency: [
    { skill: "APIs", count: 914 },
    { skill: "Git", count: 743 },
    { skill: "JavaScript", count: 732 },
    { skill: "Python", count: 706 },
    { skill: "CSS", count: 644 },
    { skill: "HTML", count: 626 },
    { skill: "SQL", count: 615 },
    { skill: "MySQL", count: 562 },
    { skill: "REST APIs", count: 549 },
    { skill: "Problem Solving", count: 493 },
    { skill: "React", count: 423 },
    { skill: "Java", count: 420 },
    { skill: "React Native", count: 188 },
    { skill: "Kubernetes", count: 128 },
    { skill: "Terraform", count: 82 },
    { skill: "Docker", count: 76 },
  ],
  gapUseCases: [
    {
      id: "employer-brief",
      title: "Employer brief",
      detail: "Check whether the pool can satisfy a live role demand.",
      skills: ["React", "React Native", "JavaScript"],
      query: "React and React Native and JavaScript",
    },
    {
      id: "training-cohort",
      title: "Training cohort",
      detail: "Find partial candidates that could convert with focused upskilling.",
      skills: ["Kubernetes", "Terraform", "Docker"],
      query: "Kubernetes and Terraform and Docker",
    },
    {
      id: "funding-evidence",
      title: "Funding evidence",
      detail: "Quantify scarce capabilities for program and grant narratives.",
      skills: ["SQL", "Python"],
      query: "SQL and Python",
    },
    {
      id: "delivery-risk",
      title: "Delivery risk",
      detail: "Spot backend/API supply depth before committing to delivery targets.",
      skills: ["APIs", "SQL"],
      query: "APIs and SQL",
    },
  ],
  seniorityPyramid: [
    { jobFamily: "Cloud, DevOps & SRE", junior: 93, mid: 189, senior: 98, lead: 17, executive: 0 },
    { jobFamily: "Full-Stack Engineering", junior: 75, mid: 127, senior: 72, lead: 14, executive: 0 },
    { jobFamily: "Software Engineering", junior: 48, mid: 94, senior: 78, lead: 7, executive: 0 },
    { jobFamily: "Mobile Engineering", junior: 83, mid: 86, senior: 30, lead: 3, executive: 0 },
    { jobFamily: "AI & Machine Learning", junior: 63, mid: 30, senior: 10, lead: 0, executive: 0 },
    { jobFamily: "Data & Analytics", junior: 25, mid: 48, senior: 41, lead: 1, executive: 0 },
  ],
  gapAnalysis: {
    targetRole: "Cloud Engineer with Kubernetes and Terraform",
    targetSkills: ["Kubernetes", "Terraform", "AWS"],
    fullyMatchingCandidates: 15,
    partiallyMatchingCandidates: 190,
    zeroMatchCandidates: 1590,
    missingSkills: [
      { skill: "Terraform", missingFromPartialCandidates: 184 },
      { skill: "Kubernetes", missingFromPartialCandidates: 133 },
      { skill: "AWS", missingFromPartialCandidates: 34 },
    ],
  },
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

export const opsAlerts: OpsAlert[] = [
  {
    dedupeKey: "candidate_search_cache_stale:demo",
    severity: "P1",
    component: "search",
    tenantId: "demo",
    alertKey: "candidate_search_cache_stale",
    status: "firing",
    message: "Candidate search cache is missing 4 candidates.",
    currentValue: 4,
    threshold: 0,
    runbookUrl: "/runbooks/candidate-search-cache-stale",
    firstSeenAt: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
    lastSeenAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    context: {
      candidate_count: 128,
      cache_count: 124,
      latest_candidate_at: new Date(Date.now() - 24 * 60 * 1000).toISOString(),
    },
  },
  {
    dedupeKey: "parse_review_rate:demo",
    severity: "P2",
    component: "data_quality",
    tenantId: "demo",
    alertKey: "parse_review_rate",
    status: "acknowledged",
    message: "Parse review rate is 14.2% over the most recent profiles.",
    currentValue: 14.2,
    threshold: 10,
    runbookUrl: "/runbooks/parser-quality-review",
    firstSeenAt: new Date(Date.now() - 62 * 60 * 1000).toISOString(),
    lastSeenAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    context: {
      total_profiles: 100,
      review_profiles: 14,
    },
  },
];

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

const mockParsingDetails: ParsingDocumentDetail[] = candidates.slice(0, 6).map((candidate, index) => {
  const parsedPercentage = [94, 88, 83, 74, 66, 58][index] ?? 72;
  const extractionConfidence = [91, 86, 81, 72, 64, 52][index] ?? 70;
  const parseWarnings =
    index === 0
      ? []
      : index === 3
        ? ["Experience section needed model-backed retry."]
        : index === 4
          ? ["Header contact block was only partially parsed."]
          : ["PDF layout created sparse section boundaries."];
  const processingWarnings = index >= 4 ? ["Review parser output before bulk re-indexing."] : [];
  const missingFields =
    index === 0 ? [] : index === 4 ? ["phone", "projects"] : index === 5 ? ["email", "skills"] : ["projects"];
  const status = index === 5 ? "partial_failed" : "completed";
  const qualityBand = parsedPercentage >= 80 ? "healthy" : parsedPercentage >= 65 ? "review" : "critical";
  const fieldCoverage = [
    { label: "Document text", state: "parsed", detail: `${(2400 - index * 180).toLocaleString()} characters extracted from the document body.` },
    { label: "Identity", state: "parsed", detail: `${candidate.name} · ${candidate.currentTitle}` },
    { label: "Contact details", state: missingFields.includes("email") && missingFields.includes("phone") ? "missing" : missingFields.includes("email") || missingFields.includes("phone") ? "partial" : "parsed", detail: [candidate.email, candidate.phone].filter(Boolean).join(" · ") || "Contact data missing" },
    { label: "Skills", state: candidate.topSkills.length >= 5 ? "parsed" : "partial", detail: `${candidate.topSkills.length} normalized skills extracted.` },
    { label: "Experience timeline", state: candidate.timeline.length >= 2 ? "parsed" : "partial", detail: `${candidate.timeline.length} experience entries extracted.` },
    { label: "Education", state: candidate.education.length ? "parsed" : "missing", detail: candidate.education[0] ?? "No education parsed." },
    { label: "Projects", state: candidate.projects.length >= 2 ? "parsed" : candidate.projects.length ? "partial" : "missing", detail: `${candidate.projects.length} projects extracted.` },
    { label: "Summary", state: candidate.longSummary ? "parsed" : "partial", detail: candidate.shortSummary },
  ] as ParsingDocumentDetail["fieldCoverage"];

  return {
    documentId: `doc-${candidate.candidateId}`,
    tenantId: "mock-tenant",
    candidateId: candidate.candidateId,
    candidateName: candidate.name,
    currentTitle: candidate.currentTitle,
    originalFilename: `${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`,
    mimeType: "application/pdf",
    sourceType: "folder",
    sourceUri: `/mock/${candidate.candidateId}.pdf`,
    uploadedAt: "2026-04-17T08:00:00.000Z",
    parsedPercentage,
    extractionConfidence,
    rawTextLength: 2400 - index * 180,
    status,
    qualityBand,
    parserVersion: "pdftotext-raw-v2",
    modelVersion: index >= 4 ? "gemini-2.5-flash-v1" : "ollama-qwen3-30b-a3b-v1",
    promptVersion: "structured-json-v2",
    embeddingVersion: "ollama-nomic-embed-text-v1",
    warnings: [...parseWarnings, ...processingWarnings],
    missingFields,
    keyFindings: [
      `${candidate.timeline.length} roles parsed`,
      `${candidate.topSkills.length} skills normalized`,
      parseWarnings.length ? `${parseWarnings.length} parser warnings` : "No parser warnings",
    ],
    needsAttention: parsedPercentage < 75 || extractionConfidence < 65 || status !== "completed",
    storagePath: `cv-originals/demo/${candidate.candidateId}.pdf`,
    updatedAt: "2026-04-17T08:15:00.000Z",
    location: candidate.location,
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    seniority: candidate.seniority,
    primaryRole: candidate.primaryRole,
    yearsExperience: candidate.yearsExperience,
    headline: candidate.headline,
    summary: candidate.longSummary,
    links: candidate.links,
    skills: candidate.topSkills,
    languages: candidate.languages,
    certifications: candidate.certifications,
    education: candidate.education,
    projects: candidate.projects,
    timeline: candidate.timeline,
    fieldCoverage,
    parsedSections: ["Identity", "Summary", "Skills", "Experience", "Education", "Projects"],
    parseWarnings,
    processingWarnings,
    errorCode: status === "partial_failed" ? "LOW_TEXT_COVERAGE" : null,
    errorMessage: status === "partial_failed" ? "Document completed with low text coverage and sparse skills extraction." : null,
    rawTextPreview: [
      `${candidate.name}`,
      `${candidate.currentTitle}`,
      ...candidate.evidence.map((item) => item.excerpt),
      ...candidate.projects,
    ].join("\n\n"),
    optimizationHints:
      status === "partial_failed"
        ? [
            "Raw text coverage is low for this document. Add OCR fallback before trusting embeddings.",
            "Contact and skills extraction need a deterministic header pass before the model run.",
            "Use this document as a prompt-tuning regression case once the parser is improved.",
          ]
        : [
            "This document is a stable baseline for parser quality comparisons.",
            "If you tune prompts, compare the extracted skills and timeline against this output first.",
          ],
  };
});

export const parsingOverview: ParsingOverview = {
  overallParsedPercentage: Math.round(mockParsingDetails.reduce((sum, item) => sum + item.parsedPercentage, 0) / mockParsingDetails.length),
  averageConfidence: Math.round(mockParsingDetails.reduce((sum, item) => sum + item.extractionConfidence, 0) / mockParsingDetails.length),
  documentsCount: mockParsingDetails.length,
  completedCount: mockParsingDetails.filter((item) => item.status === "completed").length,
  needsReviewCount: mockParsingDetails.filter((item) => item.needsAttention).length,
  failedCount: mockParsingDetails.filter((item) => item.status === "failed" || item.status === "partial_failed").length,
  items: [...mockParsingDetails]
    .map((item) => ({
      documentId: item.documentId,
      tenantId: item.tenantId,
      candidateId: item.candidateId,
      candidateName: item.candidateName,
      currentTitle: item.currentTitle,
      originalFilename: item.originalFilename,
      mimeType: item.mimeType,
      sourceType: item.sourceType,
      sourceUri: item.sourceUri,
      uploadedAt: item.uploadedAt,
      parsedPercentage: item.parsedPercentage,
      extractionConfidence: item.extractionConfidence,
      rawTextLength: item.rawTextLength,
      status: item.status,
      qualityBand: item.qualityBand,
      parserVersion: item.parserVersion,
      modelVersion: item.modelVersion,
      promptVersion: item.promptVersion,
      embeddingVersion: item.embeddingVersion,
      warnings: item.warnings,
      missingFields: item.missingFields,
      keyFindings: item.keyFindings,
      needsAttention: item.needsAttention,
    }))
    .sort((left, right) => left.parsedPercentage - right.parsedPercentage),
};

export function getParsingDocument(documentId: string) {
  return mockParsingDetails.find((item) => item.documentId === documentId) ?? mockParsingDetails[0];
}

let parserProfiles: ParserProfile[] = [
  {
    id: "profile-active-gemini-v1",
    tenantId: "mock-tenant",
    name: "Gemini Flash Extraction v1",
    slug: "gemini-flash-v1",
    description: "Primary production profile for clean digital PDFs with Gemini Flash extraction and Gemini 768-dimension embeddings.",
    status: "active",
    extractionProvider: "openai-compatible",
    extractionModel: "gemini-2.5-flash",
    parserVersion: "pdftotext-raw-v2",
    modelVersion: "gemini-2.5-flash-v1",
    promptVersion: "openai-json-v1",
    chunkVersion: "section-first-v2",
    embeddingProvider: "openai",
    embeddingModel: "gemini-embedding-001",
    embeddingVersion: "gemini-embedding-001-768-v1",
    chunkingProfile: "section-first",
    ocrEnabled: false,
    allowHeuristicFallback: false,
    promptTemplate: [
      "You are extracting a recruiter-ready candidate profile from a CV.",
      "Return valid JSON only.",
      "Preserve evidence-backed skills and role history.",
      "Do not invent dates, companies, or contact details that are not present in the source text.",
    ].join("\n"),
    notes: "Best baseline for the current sample corpus. Use this for most reprocessing until OCR coverage improves.",
    lastEvaluatedAt: "2026-04-17T16:40:00.000Z",
    avgParsePercentage: 84,
    avgConfidence: 79,
    documentsEvaluated: 10,
    createdAt: "2026-04-17T15:20:00.000Z",
    updatedAt: "2026-04-17T16:40:00.000Z",
  },
  {
    id: "profile-ocr-draft-v1",
    tenantId: "mock-tenant",
    name: "OCR Rescue Draft",
    slug: "ocr-rescue-draft",
    description: "Draft profile for scanned or layout-heavy PDFs that need OCR before extraction.",
    status: "draft",
    extractionProvider: "openai-compatible",
    extractionModel: "gemini-2.5-flash",
    parserVersion: "ocr-pipeline-v1",
    modelVersion: "gemini-2.5-flash-v1",
    promptVersion: "openai-json-ocr-v1",
    chunkVersion: "dense-experience-v1",
    embeddingProvider: "openai",
    embeddingModel: "gemini-embedding-001",
    embeddingVersion: "gemini-embedding-001-768-v1",
    chunkingProfile: "dense-experience",
    ocrEnabled: true,
    allowHeuristicFallback: false,
    promptTemplate: [
      "You are extracting a candidate profile from OCR text.",
      "Expect noisy line breaks.",
      "Prioritize contact details, company names, role titles, dates, and normalized skills.",
      "Return valid JSON only.",
    ].join("\n"),
    notes: "Needs evaluation on scanned CVs before activation.",
    lastEvaluatedAt: "2026-04-17T15:55:00.000Z",
    avgParsePercentage: 68,
    avgConfidence: 61,
    documentsEvaluated: 3,
    createdAt: "2026-04-17T15:40:00.000Z",
    updatedAt: "2026-04-17T15:55:00.000Z",
  },
];

function slugifyProfile(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 48);
}

export function getParserProfiles() {
  return [...parserProfiles].sort((left, right) => {
    if (left.status === "active" && right.status !== "active") {
      return -1;
    }
    if (left.status !== "active" && right.status === "active") {
      return 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function saveParserProfile(input: ParserProfileInput) {
  const now = new Date().toISOString();
  const existing = input.id ? parserProfiles.find((profile) => profile.id === input.id) : null;
  const nextProfile: ParserProfile = {
    id: existing?.id ?? `profile-${slugifyProfile(input.slug || input.name)}-${Date.now()}`,
    tenantId: existing?.tenantId ?? "mock-tenant",
    status: existing?.status ?? "draft",
    lastEvaluatedAt: existing?.lastEvaluatedAt ?? null,
    avgParsePercentage: existing?.avgParsePercentage ?? null,
    avgConfidence: existing?.avgConfidence ?? null,
    documentsEvaluated: existing?.documentsEvaluated ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...input,
    slug: slugifyProfile(input.slug || input.name),
  };

  parserProfiles = existing
    ? parserProfiles.map((profile) => (profile.id === existing.id ? nextProfile : profile))
    : [nextProfile, ...parserProfiles];

  return nextProfile;
}

export function publishParserProfile(profileId: string) {
  const now = new Date().toISOString();
  let published: ParserProfile | null = null;

  parserProfiles = parserProfiles.map((profile) => {
    if (profile.status === "archived") {
      return profile;
    }

    const nextStatus: ParserProfile["status"] = profile.id === profileId ? "active" : "draft";
    const nextProfile: ParserProfile = {
      ...profile,
      status: nextStatus,
      updatedAt: profile.id === profileId ? now : profile.updatedAt,
    };

    if (profile.id === profileId) {
      published = nextProfile;
    }

    return nextProfile;
  });

  return published ?? parserProfiles[0];
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+.#-]+/)
    .filter((token) => token.length > 2);
}

function calculateSearchResult(candidate: CandidateDetail, query: string, filters: SearchFilters): CandidateSearchResult | null {
  const employerNames = candidate.timeline.map((entry) => entry.employer);
  const haystack = [
    candidate.name,
    candidate.currentTitle,
    candidate.headline,
    candidate.shortSummary,
    candidate.longSummary,
    candidate.primaryRole,
    candidate.location,
    ...candidate.topSkills,
    ...employerNames,
    ...candidate.recommendedRoles,
  ]
    .join(" ")
    .toLowerCase();

  const tokens = tokenize(query);
  const matchedTokens = tokens.filter((token) => haystack.includes(token)).length;
  const semantic = tokens.length ? Math.min(1, 0.45 + matchedTokens / (tokens.length * 1.2)) : 0.76;

  const requiredSkills = filters.skills ?? [];
  const requiredCompanies = filters.companies ?? [];
  const matchedSkills = requiredSkills.filter((skill) =>
    candidate.topSkills.some((candidateSkill) => candidateSkill.toLowerCase() === skill.toLowerCase()),
  );
  const matchedCompanies = requiredCompanies.filter((company) =>
    employerNames.some((employer) => employer.toLowerCase() === company.toLowerCase()),
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
  if (filters.seniority && seniorityRank(candidate.seniority) < seniorityRank(filters.seniority)) {
    return null;
  }
  if (requiredYears && candidate.yearsExperience < requiredYears) {
    return null;
  }
  if (filters.location && !candidate.location.toLowerCase().includes(filters.location.toLowerCase())) {
    return null;
  }
  if (requiredSkills.length > 0 && matchedSkills.length !== requiredSkills.length) {
    return null;
  }
  if (requiredCompanies.length > 0 && matchedCompanies.length === 0) {
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
    backendMatchRate: score,
    backendScoreRaw: score / 100,
    matchSignals: { semantic, skill: skillSignal, experience },
    shortSummary: candidate.shortSummary,
    strengths: candidate.strengths,
    risks: candidate.risks,
    recommendedRoles: candidate.recommendedRoles,
    stage: candidate.stage,
    avatarHue: candidate.avatarHue,
    matchNarrative: candidate.matchNarrative,
  };
}

function seniorityRank(value: string | null | undefined) {
  switch ((value ?? "").trim().toLowerCase()) {
    case "junior":
      return 1;
    case "mid":
    case "mid-level":
      return 2;
    case "senior":
    case "mid-senior":
      return 3;
    case "staff":
    case "staff-plus":
    case "lead":
      return 4;
    default:
      return 0;
  }
}

export function searchCandidates(query: string, filters: SearchFilters, options: SearchQueryOptions = {}): SearchResponse {
  const limit = Math.max(1, Math.min(50, Math.trunc(options.limit ?? 12)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const results = candidates
    .map((candidate) => calculateSearchResult(candidate, query, filters))
    .filter((candidate): candidate is CandidateSearchResult => Boolean(candidate))
    .sort((left, right) => right.matchScore - left.matchScore);
  const pagedResults = results.slice(offset, offset + limit);

  return {
    results: pagedResults,
    nextCursor: offset + limit < results.length ? offset + limit : null,
    meta: {
      count: pagedResults.length,
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

export function getWorkspaceStats(): WorkspaceStats {
  const companyCount = new Set(
    candidates
      .flatMap((candidate) => candidate.timeline.map((entry) => entry.employer.trim()))
      .filter(Boolean),
  ).size;

  return {
    documentCount: candidates.length,
    candidateCount: candidates.length,
    companyCount,
  };
}

function isCorpusCountQuestion(question: string) {
  const normalized = question.toLowerCase();
  return /(how many|number of|count of|count)\b/.test(normalized) &&
    /\b(cv|cvs|resume|resumes|candidate|candidates|profile|profiles)\b/.test(normalized);
}

export function askCandidates(question: string, candidateIds: string[]): AskResponse {
  if (isCorpusCountQuestion(question) && candidateIds.length === 0) {
    return {
      intent: "workspace_stats",
      facts: [
        {
          candidateId: "workspace",
          candidateName: "Workspace",
          fact: `There are ${candidates.length} CVs in the current demo corpus.`,
        },
      ],
      citations: [],
      contextBlocks: [],
      extractiveAnswer: `There are ${candidates.length} CVs in the current demo corpus.`,
      meta: {
        candidateCount: candidates.length,
        topK: 0,
        answerSource: "mock",
        scopeSource: "workspace_stats",
        resolvedCandidateIds: [],
      },
    };
  }

  const resolvedIds = candidateIds.length
    ? candidateIds
    : searchCandidates(question, {}, { limit: 3, offset: 0 }).results.map((candidate) => candidate.candidateId);
  const selected = resolvedIds.map((candidateId) => getCandidate(candidateId));
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

  const citations = selected.flatMap((candidate) => candidate.evidence).slice(0, 3);

  return {
    intent,
    facts,
    citations,
    contextBlocks: citations,
    extractiveAnswer: facts.slice(0, 3).map((fact) => fact.fact).join(" "),
    meta: {
      candidateCount: selected.length,
      topK: 3,
      answerSource: "mock",
      scopeSource: candidateIds.length ? "explicit" : "mock",
      resolvedCandidateIds: resolvedIds,
    },
  };
}
