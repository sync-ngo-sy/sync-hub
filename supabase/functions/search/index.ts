import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { evaluatePlatformAiInput } from "../_shared/aiGuardrails.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { generateStructuredObject } from "../_shared/llm.ts";
import {
  createTraceId,
  recordEdgeRequest,
  withTraceHeader,
} from "../_shared/ops.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";
import {
  buildCompanyExclusionTerms,
  buildSearchIntentConfig,
  excludeCompanyMatches,
  hasExcludedCompanyMatch,
  resolveSearchFilters,
  type SearchIntentFacetOptions,
  type SearchIntentPayload,
} from "../_shared/searchIntent.ts";
import {
  normalizeLocationValue,
  normalizeSeniorityValue,
  normalizeSkillList,
} from "../_shared/searchTaxonomy.ts";

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
    : [];
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function isTransientLlmError(error: unknown) {
  const message = describeError(error).toLowerCase();
  return (
    message.includes("abort") ||
    message.includes("signal") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("overloaded") ||
    message.includes("503") ||
    message.includes("504")
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(query: string) {
  return normalizeSearchText(query)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 12);
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
    : [];
}

const GENERIC_TITLE_QUERY_TOKENS = new Set([
  "candidate",
  "developer",
  "development",
  "dev",
  "engineer",
  "engineering",
  "expert",
  "junior",
  "lead",
  "manager",
  "mid",
  "person",
  "people",
  "principal",
  "role",
  "senior",
  "software",
  "specialist",
  "staff",
]);

function calibratedMatchRate(row: Record<string, unknown>) {
  const subscores = row.subscores &&
      typeof row.subscores === "object" &&
      !Array.isArray(row.subscores)
    ? (row.subscores as Record<string, unknown>)
    : {};
  const rawScore = Math.max(0, toFiniteNumber(row.score_raw ?? row.score));
  const retrievalSignal = Math.max(
    toFiniteNumber(subscores.semantic_similarity),
    Math.min(1, toFiniteNumber(subscores.max_chunk_rrf) * 40),
    Math.min(1, toFiniteNumber(subscores.avg_top3_chunk_rrf) * 45),
  );
  const weightedSignal = Math.max(
    rawScore,
    0.5 * retrievalSignal +
      0.14 * toFiniteNumber(subscores.role_match) +
      0.12 * toFiniteNumber(subscores.skill_match) +
      0.08 * toFiniteNumber(subscores.experience_match) +
      0.06 * toFiniteNumber(subscores.seniority_match) +
      0.07 * toFiniteNumber(subscores.name_match) +
      0.07 * toFiniteNumber(subscores.contact_match) +
      0.03 * toFiniteNumber(subscores.company_match),
  );

  if (weightedSignal <= 0) {
    return 0;
  }
  return Math.min(
    99,
    Math.max(1, Math.round((1 - Math.exp(-3.2 * weightedSignal)) * 100)),
  );
}

function attachMatchRates(rows: unknown[]) {
  return rows.map((row) => {
    const record = row && typeof row === "object" && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : {};
    const rawScore = toFiniteNumber(record.score_raw ?? record.score);
    const providedRate = Number(record.match_rate);
    const matchRate = Number.isFinite(providedRate) && providedRate >= 0
      ? Math.round(Math.max(0, Math.min(100, providedRate)))
      : calibratedMatchRate({ ...record, score: rawScore });

    return {
      ...record,
      score: matchRate / 100,
      score_raw: rawScore,
      match_rate: matchRate,
    };
  });
}

function normalizeExplicitFilters(filters: Record<string, unknown>) {
  const minYearsRaw = asNumber(filters.min_years_experience);

  return {
    role: asString(filters.role),
    seniority: normalizeSeniorityValue(asString(filters.seniority)) ?? null,
    min_years_experience: minYearsRaw !== null && minYearsRaw > 0
      ? minYearsRaw
      : null,
    location: normalizeLocationValue(asString(filters.location), {
      allowFallback: false,
    }) ?? null,
    skills: normalizeSkillList(asStringArray(filters.skills)),
    companies: asStringArray(filters.companies),
  };
}

async function extractIntentWithLlm(
  query: string,
  filters: Record<string, unknown>,
  facets: SearchIntentFacetOptions,
): Promise<SearchIntentPayload | null> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateStructuredObject<SearchIntentPayload>(
        buildSearchIntentConfig(query, filters, facets),
      );
      return result?.object ?? null;
    } catch (error) {
      lastError = error;
      if (!isTransientLlmError(error) || attempt === 1) {
        throw error;
      }
      console.warn(`search_intent_llm_retry:${describeError(error)}`);
      await wait(180);
    }
  }

  throw lastError;
}

type CandidateSearchRow = {
  tenant_id: string;
  candidate_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  headline: string | null;
  current_title: string | null;
  location: string | null;
  years_experience: number | null;
  seniority: string | null;
  primary_role: string | null;
  role_tags: string[] | null;
  skills: string[] | null;
  companies: string[] | null;
  summary_short: string | null;
  stored_short_summary: string | null;
};

const SEARCH_REST_PAGE_SIZE = 1000;

function dedupeSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

async function fetchTenantCompanyExclusionTerms(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
) {
  if (!tenantIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("slug, name")
    .in("id", tenantIds);

  if (error) {
    throw error;
  }

  return buildCompanyExclusionTerms(
    (data ?? []).flatMap((tenant) => [tenant.slug, tenant.name]),
  );
}

async function fetchSearchIntentFacets(
  supabase: ReturnType<typeof createAuthedClient>,
  tenantIds: string[],
): Promise<SearchIntentFacetOptions> {
  const rows: Array<{
    skills: string[] | null;
    companies: string[] | null;
    location: string | null;
  }> = [];

  for (let offset = 0;; offset += SEARCH_REST_PAGE_SIZE) {
    const request = supabase
      .from("candidate_search_cache")
      .select("skills, companies, location")
      .range(offset, offset + SEARCH_REST_PAGE_SIZE - 1);

    const { data, error } = await request;
    if (error) {
      throw error;
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < SEARCH_REST_PAGE_SIZE) {
      break;
    }
  }

  const excludedCompanyTerms = await fetchTenantCompanyExclusionTerms(
    supabase,
    tenantIds,
  );

  return {
    skills: dedupeSorted(
      normalizeSkillList(rows.flatMap((row) => row.skills ?? [])),
    ),
    companies: dedupeSorted(rows.flatMap((row) => row.companies ?? [])),
    locations: dedupeSorted(
      rows
        .map((row) =>
          normalizeLocationValue(row.location, { allowFallback: false })
        )
        .filter((location): location is string => Boolean(location)),
    ),
    excludedCompanyTerms,
  };
}

function roleSearchAliases(role: string | null | undefined) {
  switch (role) {
    case "frontend":
      return [
        "frontend",
        "front end",
        "front-end",
        "web developer",
        "web application engineer",
        "ui developer",
      ];
    case "backend":
      return [
        "backend",
        "back end",
        "back-end",
        "api developer",
        "server developer",
        "server engineer",
      ];
    case "full-stack":
      return ["full-stack", "full stack", "fullstack"];
    case "mobile":
      return ["mobile", "android", "ios", "flutter", "react native"];
    case "devops":
      return ["devops", "sre", "kubernetes", "terraform", "platform"];
    case "data":
      return ["data", "analytics", "etl", "bi"];
    case "ml":
      return ["ml", "ai", "machine learning", "llm"];
    case "qa":
      return ["qa", "quality", "test", "automation"];
    case "security":
      return ["security", "cybersecurity", "soc"];
    default:
      return role ? [role] : [];
  }
}

function roleSkillAliases(role: string | null | undefined) {
  switch (role) {
    case "frontend":
      return [
        "react",
        "angular",
        "vue",
        "next.js",
        "nextjs",
        "javascript",
        "typescript",
        "html",
        "css",
        "tailwind",
        "bootstrap",
      ];
    case "backend":
      return [
        "node.js",
        "node",
        "django",
        "flask",
        ".net",
        "asp.net",
        "java",
        "php",
        "laravel",
        "api",
        "rest api",
        "postgresql",
        "mysql",
      ];
    case "full-stack":
      return [
        "react",
        "angular",
        "vue",
        "node.js",
        "node",
        ".net",
        "django",
        "laravel",
        "javascript",
        "typescript",
      ];
    case "mobile":
      return [
        "android",
        "ios",
        "flutter",
        "react native",
        "swift",
        "kotlin",
        "dart",
      ];
    case "devops":
      return ["kubernetes", "terraform", "docker", "aws", "azure", "ci/cd"];
    case "data":
      return [
        "data analysis",
        "analytics",
        "etl",
        "bi",
        "sql",
        "python",
        "pandas",
      ];
    case "ml":
      return ["machine learning", "ml", "ai", "llm", "tensorflow", "pytorch"];
    case "qa":
      return [
        "qa",
        "quality assurance",
        "testing",
        "automation testing",
        "selenium",
      ];
    case "security":
      return ["security", "cybersecurity", "soc", "penetration testing"];
    default:
      return [];
  }
}

function roleCompatibilityScore(
  row: CandidateSearchRow,
  role: string | null | undefined,
) {
  const primaryRole = normalizeSearchText(row.primary_role);
  if (!role || !primaryRole) {
    return 0;
  }
  const normalizedRole = normalizeSearchText(role);
  if (
    primaryRole === "full stack" &&
    (normalizedRole === "frontend" || normalizedRole === "backend")
  ) {
    return 0.78;
  }
  if (normalizedRole === "full stack" && primaryRole === "full stack") {
    return 0.78;
  }
  return 0;
}

function aliasHitCount(text: string, aliases: string[]) {
  return new Set(
    aliases
      .map(normalizeSearchText)
      .filter((alias) => alias && text.includes(alias)),
  ).size;
}

function genericEngineeringTitleScore(
  row: CandidateSearchRow,
  role: string | null | undefined,
) {
  const title = normalizeSearchText(row.current_title);
  if (!title || !role) {
    return 0;
  }
  if (
    role === "frontend" &&
    /\b(?:software|ui|front end|frontend)\b/.test(title)
  ) {
    return 0.66;
  }
  if (
    role === "backend" &&
    /\b(?:software|backend|back end|api|server)\b/.test(title)
  ) {
    return 0.66;
  }
  return 0;
}

function roleMatchScore(
  row: CandidateSearchRow,
  role: string | null | undefined,
) {
  const aliases = roleSearchAliases(role)
    .map(normalizeSearchText)
    .filter(Boolean);
  if (!aliases.length) {
    return 0;
  }
  const titleText = normalizeSearchText(row.current_title);
  if (aliases.some((alias) => titleText.includes(alias))) {
    return 1;
  }

  const skillHits = aliasHitCount(
    normalizeSearchText(toStringArray(row.skills).join(" ")),
    roleSkillAliases(role),
  );
  const supportScore = Math.max(
    genericEngineeringTitleScore(row, role),
    roleCompatibilityScore(row, role) * 0.86,
  );
  if (skillHits >= 2 && supportScore > 0) {
    return Math.max(0.72, supportScore);
  }
  if (skillHits > 0 && supportScore > 0) {
    return Math.max(supportScore, 0.58);
  }

  return 0;
}

function titleIntentScore(
  row: CandidateSearchRow,
  query: string,
  role: string | null | undefined,
) {
  const title = normalizeSearchText(row.current_title);
  const skillsText = normalizeSearchText(toStringArray(row.skills).join(" "));
  const aliases = roleSearchAliases(role)
    .map(normalizeSearchText)
    .filter(Boolean);
  const focusTokens = tokenizeQuery(query).filter(
    (token) => !GENERIC_TITLE_QUERY_TOKENS.has(token),
  );

  const titleAliasHit = aliases.some((alias) => title.includes(alias));
  if (titleAliasHit) {
    return 1;
  }

  const titleTokenScore = focusTokens.length
    ? focusTokens.filter((token) => title.includes(token)).length /
      focusTokens.length
    : 0;
  const skillHits = aliasHitCount(skillsText, roleSkillAliases(role));
  const skillAliasScore = skillHits >= 2 ? 0.72 : skillHits === 1 ? 0.58 : 0;
  const skillTokenScore = focusTokens.length
    ? 0.68 *
      (focusTokens.filter((token) => skillsText.includes(token)).length /
        focusTokens.length)
    : 0;

  return Math.max(
    titleTokenScore,
    skillAliasScore,
    skillTokenScore,
    genericEngineeringTitleScore(row, role),
  );
}

function skillMatchScore(row: CandidateSearchRow, skills: string[]) {
  if (!skills.length) {
    return 0;
  }
  const rowSkills = new Set(
    normalizeSkillList(toStringArray(row.skills)).map(normalizeSearchText),
  );
  const normalizedSkills = normalizeSkillList(skills).map(normalizeSearchText);
  if (!normalizedSkills.length) {
    return 0;
  }
  return (
    normalizedSkills.filter((skill) => rowSkills.has(skill)).length /
    normalizedSkills.length
  );
}

function companyMatchScore(row: CandidateSearchRow, companies: string[]) {
  if (!companies.length) {
    return 0;
  }
  const rowCompanies = toStringArray(row.companies).map(normalizeSearchText);
  return companies.some((company) =>
      rowCompanies.includes(normalizeSearchText(company))
    )
    ? 1
    : 0;
}

function queryTextMatchScore(query: string, value: unknown) {
  const queryText = normalizeSearchText(query);
  const candidateText = normalizeSearchText(value);
  const queryTokens = tokenizeQuery(query);
  if (!queryText || !candidateText) {
    return 0;
  }
  if (queryText === candidateText) {
    return 1;
  }
  if (candidateText.includes(queryText) || queryText.includes(candidateText)) {
    return 0.92;
  }
  if (
    queryTokens.length >= 2 &&
    queryTokens.every((token) => candidateText.includes(token))
  ) {
    return 0.88;
  }
  if (queryTokens.length === 1 && candidateText.includes(queryTokens[0])) {
    return 0.72;
  }
  return 0;
}

function normalizeContactText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9@.+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D+/g, "");
}

function contactMatchScore(row: CandidateSearchRow, query: string) {
  const queryText = normalizeContactText(query);
  const queryCompact = queryText.replace(/\s+/g, "");
  const email = normalizeContactText(row.email).replace(/\s+/g, "");
  const phoneDigits = digitsOnly(row.phone);
  const queryDigits = digitsOnly(query);
  const queryTokens = queryText
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);

  if (!queryText) {
    return 0;
  }
  if (
    email &&
    (queryCompact === email ||
      email.includes(queryCompact) ||
      queryCompact.includes(email))
  ) {
    return queryCompact === email ? 1 : 0.92;
  }
  if (
    phoneDigits &&
    queryDigits.length >= 5 &&
    (phoneDigits === queryDigits ||
      phoneDigits.includes(queryDigits) ||
      queryDigits.includes(phoneDigits))
  ) {
    return phoneDigits === queryDigits ? 1 : 0.92;
  }
  if (email && queryTokens.some((token) => email.includes(token))) {
    return 0.88;
  }
  if (
    phoneDigits &&
    queryDigits.length >= 4 &&
    phoneDigits.includes(queryDigits)
  ) {
    return 0.88;
  }
  return 0;
}

function rowPassesExplicitFilters(
  row: CandidateSearchRow,
  filters: SearchIntentPayload,
) {
  const filterLocation = normalizeLocationValue(filters.location) ?? null;
  const rowLocation = normalizeLocationValue(row.location) ?? null;
  if (filters.role && roleMatchScore(row, filters.role) <= 0) {
    return false;
  }
  if (
    filters.seniority &&
    normalizeSearchText(row.seniority) !==
      normalizeSearchText(filters.seniority)
  ) {
    return false;
  }
  if (
    filters.min_years_experience !== null &&
    toFiniteNumber(row.years_experience) < filters.min_years_experience
  ) {
    return false;
  }
  if (
    filterLocation &&
    rowLocation !== filterLocation &&
    !normalizeSearchText(row.location).includes(
      normalizeSearchText(filters.location),
    )
  ) {
    return false;
  }
  if (filters.skills.length && skillMatchScore(row, filters.skills) <= 0) {
    return false;
  }
  if (
    filters.companies.length &&
    companyMatchScore(row, filters.companies) < 1
  ) {
    return false;
  }
  return true;
}

function fastProfileScore(
  row: CandidateSearchRow,
  query: string,
  filters: SearchIntentPayload,
) {
  const tokens = tokenizeQuery(query);
  const name = normalizeSearchText(row.name);
  const contact = normalizeSearchText(`${row.email ?? ""} ${row.phone ?? ""}`);
  const title = normalizeSearchText(row.current_title);
  const skillsText = normalizeSearchText(toStringArray(row.skills).join(" "));
  const companiesText = normalizeSearchText(
    toStringArray(row.companies).join(" "),
  );
  const summary = normalizeSearchText(
    `${row.summary_short ?? ""} ${row.stored_short_summary ?? ""}`,
  );
  const haystack =
    `${name} ${contact} ${title} ${skillsText} ${companiesText} ${summary} ${
      normalizeSearchText(row.location)
    }`;
  const tokenHits = tokens.filter((token) => haystack.includes(token)).length;
  const nameScore = queryTextMatchScore(query, row.name);
  const contactScore = contactMatchScore(row, query);
  const roleScore = roleMatchScore(row, filters.role);
  const titleScore = titleIntentScore(row, query, filters.role);
  const skillScore = skillMatchScore(row, filters.skills);
  const companyScore = companyMatchScore(row, filters.companies);
  const seniorityScore = filters.seniority &&
      normalizeSearchText(row.seniority) ===
        normalizeSearchText(filters.seniority)
    ? 1
    : 0;
  const yearsScore = filters.min_years_experience !== null
    ? Math.min(
      1,
      toFiniteNumber(row.years_experience) /
        Math.max(1, filters.min_years_experience),
    )
    : 0;
  const filterLocation = normalizeLocationValue(filters.location) ?? null;
  const rowLocation = normalizeLocationValue(row.location) ?? null;
  const locationScore = filterLocation &&
      (rowLocation === filterLocation ||
        normalizeSearchText(row.location).includes(
          normalizeSearchText(filters.location),
        ))
    ? 1
    : 0;

  let tokenScore = tokens.length ? tokenHits / tokens.length : 0.15;
  for (const token of tokens) {
    if (name.includes(token)) tokenScore += 0.2;
    if (contact.includes(token)) tokenScore += 0.2;
    if (title.includes(token)) tokenScore += 0.15;
    if (skillsText.includes(token)) tokenScore += 0.1;
  }

  let weighted = Math.max(
    tokenScore * 0.34,
    nameScore * 0.82,
    contactScore * 0.82,
    titleScore * 0.82,
    roleScore * 0.76,
    skillScore * 0.62,
    companyScore * 0.5,
  ) +
    seniorityScore * 0.1 +
    yearsScore * 0.07 +
    locationScore * 0.06 +
    Math.min(0.08, toFiniteNumber(row.years_experience) / 200);

  if (filters.role && roleScore <= 0 && titleScore < 0.5) {
    weighted *= 0.35;
  }

  if (filters.role && titleScore >= 0.9) {
    weighted += 0.06;
  }

  return Math.min(0.99, weighted);
}

async function fetchCandidateSearchRows(
  supabase: ReturnType<typeof createAuthedClient>,
) {
  const rows: CandidateSearchRow[] = [];
  for (let offset = 0;; offset += SEARCH_REST_PAGE_SIZE) {
    const request = supabase
      .from("candidate_search_cache")
      .select(
        "tenant_id, candidate_id, name, email, phone, headline, current_title, location, years_experience, seniority, primary_role, role_tags, skills, companies, summary_short, stored_short_summary",
      )
      .range(offset, offset + SEARCH_REST_PAGE_SIZE - 1);

    const { data, error } = await request;
    if (error) {
      throw error;
    }
    const page = (data ?? []) as CandidateSearchRow[];
    rows.push(...page);
    if (page.length < SEARCH_REST_PAGE_SIZE) {
      break;
    }
  }
  return rows;
}

function mapFastProfileResult(
  row: CandidateSearchRow,
  score: number,
  query: string,
  filters: SearchIntentPayload,
  rankVersion: string,
) {
  const requiredSkills = normalizeSkillList(filters.skills).map(
    normalizeSearchText,
  );
  const requiredCompanies = filters.companies.map(normalizeSearchText);
  const matchedSkills = filters.skills.length
    ? normalizeSkillList(toStringArray(row.skills)).filter((skill) =>
      requiredSkills.includes(normalizeSearchText(skill))
    )
    : normalizeSkillList(toStringArray(row.skills)).slice(0, 8);
  const matchedCompanies = filters.companies.length
    ? toStringArray(row.companies).filter((company) =>
      requiredCompanies.includes(normalizeSearchText(company))
    )
    : [];
  const subscores = {
    name_match: queryTextMatchScore(query, row.name),
    contact_match: contactMatchScore(row, query),
    company_match: companyMatchScore(row, filters.companies),
    semantic_similarity: 0,
    role_match: roleMatchScore(row, filters.role),
    seniority_match: filters.seniority &&
        normalizeSearchText(row.seniority) ===
          normalizeSearchText(filters.seniority)
      ? 1
      : 0,
    skill_match: skillMatchScore(row, filters.skills),
    experience_match: filters.min_years_experience !== null
      ? Math.min(
        1,
        toFiniteNumber(row.years_experience) /
          Math.max(1, filters.min_years_experience),
      )
      : 0,
    max_chunk_rrf: 0,
    avg_top3_chunk_rrf: 0,
  };
  return {
    tenant_id: row.tenant_id,
    candidate_id: row.candidate_id,
    name: row.name ?? "Unknown candidate",
    current_title: row.current_title ?? "Candidate",
    location: row.location ?? "Unknown",
    years_experience: row.years_experience ?? 0,
    seniority: row.seniority ?? "unknown",
    primary_role: row.primary_role ?? "generalist",
    score,
    score_raw: score,
    match_rate: calibratedMatchRate({ score, subscores }),
    subscores,
    matched_filters: {
      required_skills: filters.skills,
      matched_skills: matchedSkills,
      required_companies: filters.companies,
      matched_companies: matchedCompanies,
      role: filters.role,
      seniority: filters.seniority,
      min_years_experience: filters.min_years_experience,
      location: normalizeLocationValue(filters.location) ?? filters.location,
    },
    summary_short: row.summary_short ?? row.stored_short_summary ?? "",
    evidence: [],
    meta: {
      rank_version: rankVersion,
      search_engine: "edge-profile-fast-path",
    },
  };
}

async function runFastProfileSearch(
  supabase: ReturnType<typeof createAuthedClient>,
  query: string,
  filters: SearchIntentPayload,
  _explicitFilters: SearchIntentPayload,
  excludedCompanyTerms: string[],
  limit: number,
  offset: number,
  rankVersion: string,
  queryEmbedding: number[] | null,
  embeddingVersion: string | null,
) {
  const rows = await fetchCandidateSearchRows(supabase);
  let scored = rows
    .filter((row) =>
      !hasExcludedCompanyMatch(row.companies, excludedCompanyTerms)
    )
    .filter((row) => rowPassesExplicitFilters(row, filters))
    .map((row) => ({ row, score: fastProfileScore(row, query, filters) }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        toFiniteNumber(right.row.years_experience) -
          toFiniteNumber(left.row.years_experience) ||
        String(left.row.name ?? "").localeCompare(String(right.row.name ?? "")),
    );

  if (queryEmbedding) {
    const candidateIds = scored
      .slice(0, 80)
      .map((item) => item.row.candidate_id);
    if (candidateIds.length) {
      const { data, error } = await supabase.rpc("search_semantic_rerank_v1", {
        p_query_embedding: queryEmbedding,
        p_tenant_ids: null,
        p_candidate_ids: candidateIds,
        p_embedding_version: embeddingVersion,
        p_limit: Math.max(100, limit * 20),
      });

      if (!error) {
        const semanticByCandidate = new Map(
          (
            (data ?? []) as Array<{
              candidate_id: string;
              best_similarity: number | null;
            }>
          ).map((item) => [
            item.candidate_id,
            toFiniteNumber(item.best_similarity),
          ]),
        );
        scored = scored
          .map((item) => {
            const semanticScore =
              semanticByCandidate.get(item.row.candidate_id) ?? 0;
            return {
              ...item,
              score: Math.min(
                0.99,
                Math.max(item.score, item.score * 0.55 + semanticScore * 0.45),
              ),
            };
          })
          .sort(
            (left, right) =>
              right.score - left.score ||
              toFiniteNumber(right.row.years_experience) -
                toFiniteNumber(left.row.years_experience) ||
              String(left.row.name ?? "").localeCompare(
                String(right.row.name ?? ""),
              ),
          );
      }
    }
  }

  return scored
    .slice(offset, offset + limit)
    .map((item) =>
      mapFastProfileResult(item.row, item.score, query, filters, rankVersion)
    );
}

Deno.serve(async (req) => {
  const traceId = createTraceId();
  const startedAt = performance.now();

  if (req.method === "OPTIONS") {
    return withTraceHeader(
      new Response("ok", { headers: corsHeaders }),
      traceId,
    );
  }

  if (req.method !== "POST") {
    return withTraceHeader(
      jsonResponse(405, { error: "method_not_allowed" }),
      traceId,
    );
  }

  let supabase: ReturnType<typeof createAuthedClient> | null = null;
  let tenantIds: string[] = [];

  const respond = async (
    status: number,
    payload: Record<string, unknown>,
    telemetry: Record<string, unknown> = {},
  ) => {
    if (supabase) {
      await recordEdgeRequest(supabase, {
        component: "search",
        tenantIds,
        traceId,
        startedAt,
        statusCode: status,
        payload: {
          error_code: typeof payload.error === "string" ? payload.error : null,
          result_count: Array.isArray(payload.results)
            ? payload.results.length
            : null,
          ...telemetry,
        },
      });
    }
    return withTraceHeader(jsonResponse(status, payload), traceId);
  };

  try {
    const body = await req.json();
    supabase = createAuthedClient(req);
    const query = String(body.q ?? "");
    const queryGuard = evaluatePlatformAiInput(query, {
      allowRecruitmentContextBypass: true,
    });
    if (!queryGuard.allowed) {
      return await respond(400, {
        error: "ai_guardrail",
        guardrail_code: queryGuard.code ?? null,
        details: queryGuard.message ?? "Query is outside platform scope.",
      });
    }

    tenantIds = asStringArray(body.tenant_ids);
    const requestFilters = normalizeExplicitFilters(
      (body.filters ?? {}) as Record<string, unknown>,
    );
    let intentSource: "llm" | "explicit" = "explicit";
    const requiresIntentExtraction = query.trim().length > 0;
    const useSemanticSearch = body.semantic !== false &&
      (query.trim().length > 0 || Array.isArray(body.query_embedding));
    const intentFacetsPromise = fetchSearchIntentFacets(supabase, tenantIds);
    const llmIntentPromise = requiresIntentExtraction
      ? intentFacetsPromise.then((facets) =>
        extractIntentWithLlm(query, {
          ...requestFilters,
          companies: excludeCompanyMatches(
            requestFilters.companies,
            facets.excludedCompanyTerms,
          ),
        }, facets)
      )
      : Promise.resolve(null);
    const queryEmbeddingPromise = !useSemanticSearch
      ? Promise.resolve({
        embedding: null,
        embeddingVersion: null,
        provider: "disabled",
      })
      : Array.isArray(body.query_embedding)
      ? Promise.resolve({
        embedding: body.query_embedding,
        embeddingVersion: typeof body.embedding_version === "string"
          ? body.embedding_version
          : null,
        provider: "client",
      })
      : buildQueryEmbedding(query);

    let llmIntent: SearchIntentPayload | null = null;
    let intentFacets: SearchIntentFacetOptions;
    try {
      [llmIntent, intentFacets] = await Promise.all([
        llmIntentPromise,
        intentFacetsPromise,
      ]);
    } catch (error) {
      return await respond(503, {
        error: "intent_extraction_failed",
        details: describeError(error),
      });
    }

    if (requiresIntentExtraction && !llmIntent) {
      return await respond(503, {
        error: "intent_llm_unavailable",
        details:
          "LLM intent extraction is required for natural-language search.",
      });
    }

    if (llmIntent) {
      intentSource = "llm";
    }

    const scopedRequestFilters = {
      ...requestFilters,
      companies: excludeCompanyMatches(
        requestFilters.companies,
        intentFacets.excludedCompanyTerms,
      ),
    };

    const filters = resolveSearchFilters(
      query,
      {
        role: scopedRequestFilters.role ?? null,
        seniority: scopedRequestFilters.seniority ?? null,
        min_years_experience: scopedRequestFilters.min_years_experience ?? null,
        location: scopedRequestFilters.location ?? null,
        skills: scopedRequestFilters.skills,
        companies: scopedRequestFilters.companies,
      },
      llmIntent,
      intentFacets,
    );
    const queryEmbeddingPayload = await queryEmbeddingPromise;
    const limit = Math.max(
      1,
      Math.min(50, Math.trunc(Number(body.limit ?? 20))),
    );
    const offset = Math.max(0, Math.trunc(Number(body.offset ?? 0)));
    const rankVersion = String(body.rank_version ?? "v2-rate");

    if (!Array.isArray(body.query_embedding)) {
      const results = attachMatchRates(
        await runFastProfileSearch(
          supabase,
          query,
          filters,
          scopedRequestFilters,
          intentFacets.excludedCompanyTerms ?? [],
          limit,
          offset,
          rankVersion,
          queryEmbeddingPayload.embedding,
          queryEmbeddingPayload.embeddingVersion,
        ),
      );

      return await respond(
        200,
        {
          results,
          next_cursor: results.length < limit ? null : offset + limit,
          meta: {
            count: results.length,
            rank_version: rankVersion,
            intent_source: intentSource,
            intent: filters,
            explicit_filters: scopedRequestFilters,
            tenant_ids: tenantIds,
            embedding_provider: queryEmbeddingPayload.provider,
            embedding_version: queryEmbeddingPayload.embeddingVersion,
            search_engine: queryEmbeddingPayload.embedding
              ? "edge-profile-semantic-rerank"
              : "edge-profile-fast-path",
          },
        },
        {
          search_engine: queryEmbeddingPayload.embedding
            ? "edge-profile-semantic-rerank"
            : "edge-profile-fast-path",
          embedding_provider: queryEmbeddingPayload.provider,
          embedding_version: queryEmbeddingPayload.embeddingVersion,
        },
      );
    }

    const rpcPayload = {
      p_q: query,
      p_query_embedding: queryEmbeddingPayload.embedding,
      p_limit: limit,
      p_offset: offset,
      p_role: filters.role ?? null,
      p_seniority: filters.seniority ?? null,
      p_min_years: filters.min_years_experience ?? null,
      p_skills: filters.skills ?? [],
      p_embedding_version: queryEmbeddingPayload.embeddingVersion,
      p_rank_version: rankVersion,
      p_tenant_ids: null,
      p_filter_role: scopedRequestFilters.role ?? null,
      p_filter_seniority: scopedRequestFilters.seniority ?? null,
      p_filter_min_years: scopedRequestFilters.min_years_experience ?? null,
      p_filter_skills: scopedRequestFilters.skills ?? [],
      p_filter_companies: scopedRequestFilters.companies ?? [],
      p_filter_location: scopedRequestFilters.location ?? null,
    };

    let { data, error } = await supabase.rpc(
      "search_candidates_with_rate_v1",
      rpcPayload,
    );

    if (
      error &&
      `${error.message}`.includes("search_candidates_with_rate_v1")
    ) {
      const fallback = await supabase.rpc("search_candidates_v1", rpcPayload);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return await respond(400, {
        error: "search_failed",
        details: error.message,
      });
    }

    const excludedCandidateIds = new Set(
      (await fetchCandidateSearchRows(supabase))
        .filter((row) =>
          hasExcludedCompanyMatch(
            row.companies,
            intentFacets.excludedCompanyTerms,
          )
        )
        .map((row) => row.candidate_id),
    );
    const eligibleData = ((data ?? []) as Array<Record<string, unknown>>)
      .filter((row) =>
        !excludedCandidateIds.has(String(row.candidate_id ?? ""))
      );
    const results = attachMatchRates(eligibleData);

    return await respond(
      200,
      {
        results,
        next_cursor: results.length < limit ? null : offset + limit,
        meta: {
          count: results.length,
          rank_version: rankVersion,
          intent_source: intentSource,
          intent: filters,
          explicit_filters: scopedRequestFilters,
          tenant_ids: tenantIds,
          embedding_provider: queryEmbeddingPayload.provider,
          embedding_version: queryEmbeddingPayload.embeddingVersion,
        },
      },
      {
        search_engine: "rpc",
        embedding_provider: queryEmbeddingPayload.provider,
        embedding_version: queryEmbeddingPayload.embeddingVersion,
      },
    );
  } catch (error) {
    return await respond(500, {
      error: "unexpected_error",
      details: describeError(error),
    });
  }
});
