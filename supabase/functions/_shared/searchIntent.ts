type SearchFilters = {
  role?: string | null;
  seniority?: string | null;
  min_years_experience?: number | null;
  skills?: string[] | null;
  location?: string | null;
};

export const SEARCH_ROLE_VALUES = [
  "backend",
  "frontend",
  "full-stack",
  "mobile",
  "devops",
  "data",
  "ml",
  "qa",
  "security",
  "generalist",
] as const;

export const SEARCH_SENIORITY_VALUES = [
  "junior",
  "mid",
  "senior",
  "staff-plus",
  "unclassified",
] as const;

const SKILL_ALIASES: Record<string, string> = {
  ".net": ".NET",
  "angularjs": "Angular",
  "asp-net": "ASP.NET",
  "asp-net-core": "ASP.NET Core",
  "aws": "AWS",
  "azure": "Azure",
  "c#": "C#",
  "c++": "C++",
  "docker": "Docker",
  "dotnet": ".NET",
  "flask": "Flask",
  "gcp": "Google Cloud",
  "golang": "Go",
  "graphql": "GraphQL",
  "java": "Java",
  "javascript": "JavaScript",
  "js": "JavaScript",
  "k8s": "Kubernetes",
  "kafka": "Kafka",
  "mongodb": "MongoDB",
  "mysql": "MySQL",
  "nestjs": "NestJS",
  "next.js": "Next.js",
  "nextjs": "Next.js",
  "node": "Node.js",
  "node-js": "Node.js",
  "node.js": "Node.js",
  "nodejs": "Node.js",
  "postgres": "PostgreSQL",
  "postgresql": "PostgreSQL",
  "python": "Python",
  "react": "React",
  "reactjs": "React",
  "redis": "Redis",
  "supabase": "Supabase",
  "terraform": "Terraform",
  "ts": "TypeScript",
  "typescript": "TypeScript",
  "vue": "Vue",
};

const ROLE_PATTERNS: Array<{ role: string; patterns: RegExp[] }> = [
  { role: "full-stack", patterns: [/\bfull[\s-]?stack\b/i] },
  { role: "frontend", patterns: [/\bfront[\s-]?end\b/i, /\breact\b/i, /\bangular\b/i, /\bvue\b/i] },
  {
    role: "backend",
    patterns: [/\bback[\s-]?end\b/i, /\bapi\b/i, /\bmicroservices?\b/i, /\bnode(?:\.js)?\b/i, /\bdjango\b/i, /\bflask\b/i, /\b\.net\b/i],
  },
  { role: "ml", patterns: [/\bml\b/i, /\bai\b/i, /\bmachine learning\b/i, /\bllm\b/i, /\bsearch\b/i] },
  { role: "data", patterns: [/\bdata engineer\b/i, /\banalytics\b/i, /\betl\b/i] },
  { role: "devops", patterns: [/\bdevops\b/i, /\bsre\b/i, /\bterraform\b/i, /\bkubernetes\b/i] },
  { role: "mobile", patterns: [/\bmobile\b/i, /\bandroid\b/i, /\bios\b/i, /\bflutter\b/i, /\breact native\b/i] },
  { role: "security", patterns: [/\bsecurity\b/i, /\bcybersecurity\b/i, /\bsoc\b/i] },
];

const SENIORITY_PATTERNS: Array<{ seniority: string; patterns: RegExp[] }> = [
  { seniority: "staff-plus", patterns: [/\bstaff\b/i, /\bprincipal\b/i, /\blead\b/i, /\barchitect\b/i, /\bhead of\b/i] },
  { seniority: "senior", patterns: [/\bsenior\b/i, /\bsr\.?\b/i] },
  { seniority: "mid", patterns: [/\bmid\b/i, /\bmid-level\b/i] },
  { seniority: "junior", patterns: [/\bjunior\b/i, /\bintern\b/i, /\bentry level\b/i] },
];

function normalizeAlias(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractRole(query: string) {
  for (const entry of ROLE_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      return entry.role;
    }
  }
  return null;
}

function extractSeniority(query: string) {
  for (const entry of SENIORITY_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      return entry.seniority;
    }
  }
  return null;
}

function extractMinYears(query: string) {
  const match = query.match(/(?:at least|min(?:imum)?|with)?\s*(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of\s+experience)?/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractSkillsFromQuery(query: string) {
  const haystack = ` ${query.toLowerCase()} `;
  const entries = Object.entries(SKILL_ALIASES).sort((left, right) => right[0].length - left[0].length);
  const matches: string[] = [];

  for (const [alias, canonical] of entries) {
    const pattern = new RegExp(`(^|[^a-z0-9+#.])${escapePattern(alias)}([^a-z0-9+#.]|$)`, "i");
    if (pattern.test(haystack)) {
      matches.push(canonical);
    }
  }

  return dedupe(matches);
}

function normalizeSkills(skills: string[] | null | undefined) {
  return dedupe(
    (skills ?? [])
      .map((skill) => SKILL_ALIASES[normalizeAlias(skill)] ?? skill.trim())
      .filter(Boolean),
  );
}

export function deriveSearchFilters(query: string, filters: SearchFilters = {}) {
  const explicitSkills = normalizeSkills(filters.skills);
  const minYears = typeof filters.min_years_experience === "number" && filters.min_years_experience > 0
    ? filters.min_years_experience
    : null;

  return {
    role: filters.role || extractRole(query),
    seniority: filters.seniority || extractSeniority(query),
    min_years_experience: minYears ?? extractMinYears(query),
    location: filters.location || null,
    skills: explicitSkills.length ? explicitSkills : extractSkillsFromQuery(query),
  };
}
