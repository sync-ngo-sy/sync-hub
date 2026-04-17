import { extractSeniorityFromText, extractSkillsFromText, normalizeSeniorityValue, normalizeSkillList } from "./searchTaxonomy.ts";

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

export type SearchIntentPayload = {
  role: string | null;
  seniority: string | null;
  min_years_experience: number | null;
  skills: string[];
  location: string | null;
};

function nullableEnum(values: readonly string[], description: string) {
  return {
    type: ["string", "null"] as const,
    enum: [...values, null],
    description,
  };
}

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

function extractRole(query: string) {
  for (const entry of ROLE_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      return entry.role;
    }
  }
  return null;
}

function extractSeniority(query: string) {
  return extractSeniorityFromText(query) ?? null;
}

function extractMinYears(query: string) {
  const rangeMatch = query.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:years?|yrs?)(?:\s+of\s+experience)?\b/i);
  if (rangeMatch) {
    const lowerBound = Number(rangeMatch[1]);
    return Number.isFinite(lowerBound) ? lowerBound : null;
  }

  const match = query.match(/(?:at least|min(?:imum)?|with)?\s*(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of\s+experience)?/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractSkillsFromQuery(query: string) {
  return extractSkillsFromText(query);
}

function normalizeSkills(skills: string[] | null | undefined) {
  return normalizeSkillList(skills ?? []);
}

export function buildSearchIntentConfig(query: string, filters: SearchFilters = {}) {
  return {
    schemaName: "search_intent",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        role: nullableEnum(
          SEARCH_ROLE_VALUES,
          "Requested role normalized to allowed_roles; otherwise null.",
        ),
        seniority: nullableEnum(
          SEARCH_SENIORITY_VALUES,
          "Requested seniority normalized to allowed_seniority; otherwise null.",
        ),
        min_years_experience: {
          type: ["integer", "null"] as const,
          minimum: 0,
          description:
            "Explicit minimum years of experience. For ranges, use the lower bound. Otherwise null.",
        },
        skills: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          description:
            "Explicitly requested skills only. Normalize aliases and dedupe.",
        },
        location: {
          type: ["string", "null"] as const,
          description: "Explicit location only. Otherwise null.",
        },
      },
      required: [
        "role",
        "seniority",
        "min_years_experience",
        "skills",
        "location",
      ],
    },
    systemPrompt: [
      "Extract recruiter search intent and return only JSON that matches the schema.",
      "Use query as the primary source of truth.",
      "Use existing_filters only to interpret follow-up edits or preserve previously explicit constraints.",
      "If query conflicts with existing_filters, query wins.",
      "Do not invent constraints.",
      "Normalize role and seniority to the allowed enums.",
      "Set missing or uncertain scalar fields to null and skills to [].",
      "Skills must be explicitly requested, normalized, and deduplicated.",
      "Location must be explicitly stated in the query.",
      "For years of experience, return only the minimum requested number.",
      "Examples: '5+ years' -> 5, '3-5 years' -> 3.",
      "Do not infer skills, location, or years from the role alone.",
    ].join(" "),
    userPrompt: JSON.stringify({
      query,
      existing_filters: filters,
      allowed_roles: SEARCH_ROLE_VALUES,
      allowed_seniority: SEARCH_SENIORITY_VALUES,
    }),
    temperature: 0,
  };
}

export function resolveSearchFilters(query: string, requestFilters: SearchFilters = {}, llmIntent: SearchIntentPayload | null = null) {
  return deriveSearchFilters(query, {
    role: llmIntent?.role ?? requestFilters.role ?? null,
    seniority: llmIntent?.seniority ?? requestFilters.seniority ?? null,
    min_years_experience: llmIntent?.min_years_experience ?? requestFilters.min_years_experience ?? null,
    location: llmIntent?.location ?? requestFilters.location ?? null,
    skills: llmIntent?.skills?.length ? llmIntent.skills : (requestFilters.skills ?? []),
  });
}

export function deriveSearchFilters(query: string, filters: SearchFilters = {}) {
  const explicitSkills = normalizeSkills(filters.skills);
  const minYears = typeof filters.min_years_experience === "number" && filters.min_years_experience > 0
    ? filters.min_years_experience
    : null;

  return {
    role: filters.role || extractRole(query),
    seniority: normalizeSeniorityValue(filters.seniority) ?? extractSeniority(query),
    min_years_experience: minYears ?? extractMinYears(query),
    location: filters.location?.trim() || null,
    skills: explicitSkills.length ? explicitSkills : extractSkillsFromQuery(query),
  };
}
