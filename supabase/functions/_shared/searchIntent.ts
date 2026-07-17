import {
  normalizeLocationValue,
  normalizeSeniorityValue,
  normalizeSkillList,
} from "./searchTaxonomy.ts";
import { buildGuardedSystemPrompt } from "./aiGuardrails.ts";

type SearchFilters = {
  role?: string | null;
  seniority?: string | null;
  min_years_experience?: number | null;
  skills?: string[] | null;
  companies?: string[] | null;
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
  companies: string[];
  location: string | null;
};

export type SearchIntentFacetOptions = {
  skills: string[];
  companies: string[];
  locations: string[];
  excludedCompanyTerms?: string[];
};

function nullableEnum(values: readonly string[], description: string) {
  return {
    type: ["string", "null"] as const,
    enum: [...values, null],
    description,
  };
}

function normalizeSkills(skills: string[] | null | undefined) {
  return normalizeSkillList(skills ?? []);
}

function normalizeCompanies(companies: string[] | null | undefined) {
  return Array.from(
    new Set((companies ?? []).map((company) => company.trim()).filter(Boolean)),
  );
}

function normalizeFacetKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactFacetKey(value: string | null | undefined) {
  return normalizeFacetKey(value).replace(/\s+/g, "");
}

const GENERIC_COMPANY_EXCLUSION_TERMS = new Set([
  "company",
  "corp",
  "corporation",
  "group",
  "holding",
  "holdings",
  "inc",
  "limited",
  "llc",
  "ltd",
  "mobile",
  "telecom",
  "technology",
  "technologies",
]);

function isUsefulCompanyExclusionTerm(value: string | null | undefined) {
  const compact = compactFacetKey(value);
  return compact.length >= 4 && !GENERIC_COMPANY_EXCLUSION_TERMS.has(compact);
}

export function buildCompanyExclusionTerms(
  values: Array<string | null | undefined>,
) {
  return Array.from(
    new Set(
      values
        .map(compactFacetKey)
        .filter(isUsefulCompanyExclusionTerm),
    ),
  );
}

function companyMatchesExcludedTerm(
  company: string,
  excludedTerms: string[],
) {
  const companyKey = compactFacetKey(company);
  if (!companyKey || !excludedTerms.length) {
    return false;
  }

  return excludedTerms.some((term) => companyKey.includes(term));
}

export function hasExcludedCompanyMatch(
  companies: string[] | null | undefined,
  excludedTerms: string[] | null | undefined,
) {
  const normalizedExcludedTerms = buildCompanyExclusionTerms(
    excludedTerms ?? [],
  );
  return normalizeCompanies(companies).some((company) =>
    companyMatchesExcludedTerm(company, normalizedExcludedTerms)
  );
}

export function excludeCompanyMatches(
  companies: string[] | null | undefined,
  excludedTerms: string[] | null | undefined,
) {
  const normalizedCompanies = normalizeCompanies(companies);
  const normalizedExcludedTerms = buildCompanyExclusionTerms(
    excludedTerms ?? [],
  );
  if (!normalizedExcludedTerms.length) {
    return normalizedCompanies;
  }

  return normalizedCompanies.filter(
    (company) => !companyMatchesExcludedTerm(company, normalizedExcludedTerms),
  );
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildAllowedSkills(facets?: SearchIntentFacetOptions | null) {
  const allowedSkills = normalizeSkills(facets?.skills);
  const allowedByKey = new Map(
    allowedSkills.map((skill) => [normalizeFacetKey(skill), skill] as const),
  );
  return { allowedSkills, allowedByKey };
}

function buildAllowedCompanies(facets?: SearchIntentFacetOptions | null) {
  const allowedCompanies = excludeCompanyMatches(
    facets?.companies,
    facets?.excludedCompanyTerms,
  );
  const allowedByKey = new Map(
    allowedCompanies.map(
      (company) => [normalizeFacetKey(company), company] as const,
    ),
  );
  return { allowedCompanies, allowedByKey };
}

function buildAllowedLocations(facets?: SearchIntentFacetOptions | null) {
  const allowedLocations = dedupe(
    (facets?.locations ?? [])
      .map((location) =>
        normalizeLocationValue(location, { allowFallback: false })
      )
      .filter((location): location is string => Boolean(location)),
  );
  const allowedByKey = new Map(
    allowedLocations.map(
      (location) => [normalizeFacetKey(location), location] as const,
    ),
  );
  return { allowedLocations, allowedByKey };
}

function limitSkillsToFacets(
  skills: string[] | null | undefined,
  facets?: SearchIntentFacetOptions | null,
) {
  const normalizedSkills = normalizeSkills(skills);
  if (!facets) {
    return normalizedSkills;
  }

  const { allowedByKey } = buildAllowedSkills(facets);
  return dedupe(
    normalizedSkills
      .map((skill) => allowedByKey.get(normalizeFacetKey(skill)) ?? "")
      .filter(Boolean),
  );
}

function limitCompaniesToFacets(
  companies: string[] | null | undefined,
  facets?: SearchIntentFacetOptions | null,
) {
  const normalizedCompanies = excludeCompanyMatches(
    companies,
    facets?.excludedCompanyTerms,
  );
  if (!facets) {
    return normalizedCompanies;
  }

  const { allowedByKey } = buildAllowedCompanies(facets);
  return dedupe(
    normalizedCompanies
      .map((company) => allowedByKey.get(normalizeFacetKey(company)) ?? "")
      .filter(Boolean),
  );
}

function limitLocationToFacets(
  location: string | null | undefined,
  facets?: SearchIntentFacetOptions | null,
) {
  const normalizedLocation =
    normalizeLocationValue(location, { allowFallback: false }) ?? null;
  if (!normalizedLocation || !facets) {
    return normalizedLocation;
  }

  const { allowedByKey } = buildAllowedLocations(facets);
  return allowedByKey.get(normalizeFacetKey(normalizedLocation)) ?? null;
}

export function buildSearchIntentConfig(
  query: string,
  filters: SearchFilters = {},
  facets?: SearchIntentFacetOptions | null,
) {
  const allowedLocations = buildAllowedLocations(facets).allowedLocations;
  const allowedCompanies = buildAllowedCompanies(facets).allowedCompanies;
  const excludedCompanyTerms = buildCompanyExclusionTerms(
    facets?.excludedCompanyTerms ?? [],
  );

  return {
    schemaName: "search_intent",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        role: nullableEnum(
          SEARCH_ROLE_VALUES,
          "Requested candidate role normalized to allowed_roles; otherwise null.",
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
          description:
            "Explicitly requested skills only. Normalize aliases and dedupe.",
        },
        companies: {
          type: "array",
          items: { type: "string" },
          description:
            "Explicitly requested past/current employer, client, or company filters only. Preserve canonical company spelling when possible.",
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
        "companies",
        "location",
      ],
    },
    systemPrompt: buildGuardedSystemPrompt(
      [
        "Extract recruiter search intent and return only JSON that matches the schema.",
        "Use query as the primary source of truth.",
        "Use existing_filters only to interpret follow-up edits or preserve previously explicit constraints.",
        "If query conflicts with existing_filters, query wins.",
        "Do not invent constraints.",
        "Normalize role and seniority to the allowed enums.",
        "For broad generic titles like 'software engineer', 'software developer', or 'engineer' with no frontend/backend/mobile/data/ML/DevOps/QA/security focus, set role to null.",
        "Set missing or uncertain scalar fields to null, and list fields to [].",
        "Skills must be explicitly requested, normalized, and deduplicated. Technologies, frameworks, libraries, platforms, protocols, and tools belong in skills.",
        "Companies must be explicit employer/client/company filters only, such as candidates who worked at/for/with a named company.",
        "The backend validates extracted skills, companies, and locations against indexed DB facets after you respond.",
        "Use canonical common spelling for skills and companies; if a value is uncertain, omit it instead of inventing a new filter.",
        "Never return company filters matching current workspace or tenant exclusion terms. If the query mentions the hiring workspace/tenant company, omit that company from companies.",
        "For location, use only the indexed locations provided in the user payload when there is a clear explicit location match.",
        "Never put technologies or tools in companies. Node.js, Express, React, React Native, JavaScript, TypeScript, REST, JSON, HTTP, Babel, Webpack, NPM, iOS, and Android are skills or platforms, not companies.",
        "For pasted job descriptions, extract the desired candidate profile from requirements and responsibilities, but do not treat the hiring company, product, business unit, or team name as a company filter unless the query asks for candidates who worked at or with that company.",
        "Example: 'Experience with Node.js / Express' -> skills ['Node.js','Express'], companies [].",
        "Example: 'senior frontend with React worked with Noon' -> skills ['React'], companies ['Noon'].",
        "Example: 'Frontend Engineer level 2 at Noon Food team with React Native and Node.js' -> role frontend, skills ['React Native','Node.js'], companies [] unless the user asks for prior Noon experience.",
        "Location must be explicitly stated in the query.",
        "Never use role, department, technology, or skill words as a location. Examples: devops, frontend, backend, data, cloud, Kubernetes, AWS, and React are not locations.",
        "For years of experience, return only the minimum requested number.",
        "Examples: '5+ years' -> 5, '3-5 years' -> 3.",
        "Do not infer skills, companies, location, or years from the role alone.",
      ].join(" "),
      "Search intent",
    ),
    userPrompt: JSON.stringify({
      query,
      existing_filters: filters,
      allowed_roles: SEARCH_ROLE_VALUES,
      allowed_seniority: SEARCH_SENIORITY_VALUES,
      allowed_locations: allowedLocations,
      excluded_company_terms: excludedCompanyTerms,
      indexed_facet_counts: {
        skills: facets?.skills.length ?? 0,
        companies: allowedCompanies.length,
        locations: allowedLocations.length,
      },
    }),
    temperature: 0,
  };
}

function normalizePositiveYears(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizeRoleFilter(value: string | null | undefined) {
  const normalized = value?.trim() || null;
  return normalized === "generalist" ? null : normalized;
}

function mergeUnique<T>(left: T[], right: T[]) {
  return Array.from(new Set([...left, ...right]));
}

export function resolveSearchFilters(
  query: string,
  requestFilters: SearchFilters = {},
  llmIntent: SearchIntentPayload | null = null,
  facets?: SearchIntentFacetOptions | null,
) {
  void query;
  const requestSkills = limitSkillsToFacets(requestFilters.skills, facets);
  const llmSkills = limitSkillsToFacets(llmIntent?.skills, facets);
  const requestCompanies = limitCompaniesToFacets(
    requestFilters.companies,
    facets,
  );
  const llmCompanies = limitCompaniesToFacets(llmIntent?.companies, facets);

  return deriveSearchFilters("", {
    role: normalizeRoleFilter(llmIntent?.role ?? requestFilters.role ?? null),
    seniority: llmIntent?.seniority ?? requestFilters.seniority ?? null,
    min_years_experience: llmIntent?.min_years_experience ??
      requestFilters.min_years_experience ??
      null,
    location: limitLocationToFacets(
      llmIntent?.location ?? requestFilters.location ?? null,
      facets,
    ),
    skills: mergeUnique(requestSkills, llmSkills),
    companies: mergeUnique(requestCompanies, llmCompanies),
  });
}

export function deriveSearchFilters(
  query: string,
  filters: SearchFilters = {},
) {
  void query;
  const explicitSkills = normalizeSkills(filters.skills);
  const explicitCompanies = normalizeCompanies(filters.companies);

  return {
    role: normalizeRoleFilter(filters.role),
    seniority: normalizeSeniorityValue(filters.seniority) ?? null,
    min_years_experience: normalizePositiveYears(filters.min_years_experience),
    location:
      normalizeLocationValue(filters.location, { allowFallback: false }) ??
        null,
    skills: explicitSkills,
    companies: explicitCompanies,
  };
}
