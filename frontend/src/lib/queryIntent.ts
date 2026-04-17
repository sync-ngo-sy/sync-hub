import type { SearchFilters } from "@/lib/contracts";

type SearchFilterInputs = {
  role?: string;
  seniority?: string;
  minYearsExperience?: number;
  skills?: string[];
  location?: string;
};

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

function canonicalSkill(value: string) {
  const normalized = normalizeAlias(value);
  return SKILL_ALIASES[normalized] ?? value.trim();
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function parseSkillText(input: string) {
  return dedupe(
    input
      .split(",")
      .map((item) => canonicalSkill(item))
      .filter(Boolean),
  );
}

export function extractSkillsFromQuery(query: string) {
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

function extractRole(query: string) {
  for (const entry of ROLE_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      return entry.role;
    }
  }
  return undefined;
}

function extractSeniority(query: string) {
  for (const entry of SENIORITY_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      return entry.seniority;
    }
  }
  return undefined;
}

function extractMinYears(query: string) {
  const match = query.match(/(?:at least|min(?:imum)?|with)?\s*(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of\s+experience)?/i);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export function deriveSearchFilters(query: string, filters: SearchFilterInputs): SearchFilters {
  const explicitSkills = dedupe(filters.skills ?? []);
  const inferredSkills = explicitSkills.length ? explicitSkills : extractSkillsFromQuery(query);
  const derivedRole = filters.role || extractRole(query);
  const derivedSeniority = filters.seniority || extractSeniority(query);
  const explicitMinYears =
    typeof filters.minYearsExperience === "number" && filters.minYearsExperience > 0
      ? filters.minYearsExperience
      : undefined;
  const derivedMinYears = explicitMinYears ?? extractMinYears(query);

  return {
    role: derivedRole || undefined,
    seniority: derivedSeniority || undefined,
    minYearsExperience: derivedMinYears ?? 0,
    location: filters.location || undefined,
    skills: inferredSkills,
  };
}
