import type { SearchFilters } from "@/lib/contracts";
import {
  extractSeniorityFromText,
  extractSkillsFromText,
  normalizeSeniorityValue,
  normalizeSkillList,
  parseSkillInput,
} from "@/lib/searchTaxonomy";

type SearchFilterInputs = {
  role?: string;
  seniority?: string;
  minYearsExperience?: number;
  skills?: string[];
  location?: string;
};

const ROLE_PATTERNS: Array<{ role: string; patterns: RegExp[] }> = [
  { role: "full-stack", patterns: [/\bfull[\s-]?stack\b/i] },
  { role: "frontend", patterns: [/\bfront[\s-]?end\b/i, /\breact\b/i, /\bangular\b/i, /\bvue\b/i] },
  {
    role: "backend",
    patterns: [/\bback[\s-]?end\b/i, /\bapi\b/i, /\bmicroservices?\b/i, /\bnode(?:\.js)?\b/i, /\bdjango\b/i, /\bflask\b/i, /\b\.net\b/i],
  },
  { role: "ml", patterns: [/\bml\b/i, /\bai\b/i, /\bmachine learning\b/i, /\bllm\b/i] },
  { role: "data", patterns: [/\bdata engineer\b/i, /\banalytics\b/i, /\betl\b/i] },
  { role: "devops", patterns: [/\bdevops\b/i, /\bsre\b/i, /\bterraform\b/i, /\bkubernetes\b/i] },
  { role: "mobile", patterns: [/\bmobile\b/i, /\bandroid\b/i, /\bios\b/i, /\bflutter\b/i, /\breact native\b/i] },
  { role: "security", patterns: [/\bsecurity\b/i, /\bcybersecurity\b/i, /\bsoc\b/i] },
];

export function parseSkillText(input: string) {
  return parseSkillInput(input);
}

export function extractSkillsFromQuery(query: string) {
  return extractSkillsFromText(query);
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
  return extractSeniorityFromText(query);
}

function extractMinYears(query: string) {
  const rangeMatch = query.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:years?|yrs?)(?:\s+of\s+experience)?\b/i);
  if (rangeMatch) {
    const lowerBound = Number(rangeMatch[1]);
    return Number.isFinite(lowerBound) ? lowerBound : undefined;
  }

  const match = query.match(/(?:at least|min(?:imum)?|with)?\s*(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of\s+experience)?/i);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export function deriveSearchFilters(query: string, filters: SearchFilterInputs): SearchFilters {
  const explicitSkills = normalizeSkillList(filters.skills ?? []);
  const inferredSkills = explicitSkills.length ? explicitSkills : extractSkillsFromQuery(query);
  const derivedRole = filters.role || extractRole(query);
  const derivedSeniority = normalizeSeniorityValue(filters.seniority) ?? extractSeniority(query);
  const explicitMinYears =
    typeof filters.minYearsExperience === "number" && filters.minYearsExperience > 0
      ? filters.minYearsExperience
      : undefined;
  const derivedMinYears = explicitMinYears ?? extractMinYears(query);

  return {
    role: derivedRole || undefined,
    seniority: derivedSeniority || undefined,
    minYearsExperience: derivedMinYears ?? 0,
    location: filters.location?.trim() || undefined,
    skills: inferredSkills,
  };
}
