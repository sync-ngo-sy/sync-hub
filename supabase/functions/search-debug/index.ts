import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { generateStructuredObject } from "../_shared/llm.ts";
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
      console.warn(`search_debug_intent_llm_retry:${describeError(error)}`);
      await wait(180);
    }
  }

  throw lastError;
}

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

async function fetchExcludedCandidateIds(
  supabase: ReturnType<typeof createAuthedClient>,
  excludedCompanyTerms: string[],
) {
  const candidateIds = new Set<string>();
  for (let offset = 0;; offset += SEARCH_REST_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("candidate_search_cache")
      .select("candidate_id, companies")
      .range(offset, offset + SEARCH_REST_PAGE_SIZE - 1);
    if (error) {
      throw error;
    }

    const page = data ?? [];
    for (const row of page) {
      if (
        hasExcludedCompanyMatch(
          row.companies as string[] | null,
          excludedCompanyTerms,
        )
      ) {
        candidateIds.add(String(row.candidate_id));
      }
    }
    if (page.length < SEARCH_REST_PAGE_SIZE) {
      break;
    }
  }
  return candidateIds;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const body = await req.json();
    const supabase = createAuthedClient(req);
    const query = String(body.q ?? "");
    const tenantIds = asStringArray(body.tenant_ids);
    const requestFilters = normalizeExplicitFilters(
      (body.filters ?? {}) as Record<string, unknown>,
    );
    const limit = typeof body.limit === "number" ? body.limit : 20;
    const offset = typeof body.offset === "number" ? body.offset : 0;

    let intentSource: "llm" | "explicit" = "explicit";
    let llmIntent: SearchIntentPayload | null = null;
    const requiresIntentExtraction = query.trim().length > 0;
    let intentFacets: SearchIntentFacetOptions;

    try {
      intentFacets = await fetchSearchIntentFacets(supabase, tenantIds);
      llmIntent = requiresIntentExtraction
        ? await extractIntentWithLlm(query, {
          ...requestFilters,
          companies: excludeCompanyMatches(
            requestFilters.companies,
            intentFacets.excludedCompanyTerms,
          ),
        }, intentFacets)
        : null;
      if (llmIntent) {
        intentSource = "llm";
      }
    } catch (error) {
      return jsonResponse(503, {
        error: "intent_extraction_failed",
        details: `${error}`,
      });
    }

    if (requiresIntentExtraction && !llmIntent) {
      return jsonResponse(503, {
        error: "intent_llm_unavailable",
        details:
          "LLM intent extraction is required for natural-language search.",
      });
    }

    const scopedRequestFilters = {
      ...requestFilters,
      companies: excludeCompanyMatches(
        requestFilters.companies,
        intentFacets.excludedCompanyTerms,
      ),
    };

    const resolvedIntent = resolveSearchFilters(
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

    const queryEmbeddingPayload = Array.isArray(body.query_embedding)
      ? {
        embedding: body.query_embedding,
        embeddingVersion: typeof body.embedding_version === "string"
          ? body.embedding_version
          : null,
        provider: "client",
      }
      : await buildQueryEmbedding(query);

    const rpcPayload = {
      p_q: query,
      p_query_embedding: queryEmbeddingPayload.embedding,
      p_limit: limit,
      p_offset: offset,
      p_role: resolvedIntent.role ?? null,
      p_seniority: resolvedIntent.seniority ?? null,
      p_min_years: resolvedIntent.min_years_experience ?? null,
      p_skills: resolvedIntent.skills ?? [],
      p_embedding_version: queryEmbeddingPayload.embeddingVersion,
      p_rank_version: body.rank_version ?? "v2-rate",
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
      return jsonResponse(400, {
        error: "search_debug_failed",
        details: error.message,
      });
    }

    const strictFilters = Object.entries(scopedRequestFilters)
      .filter(([, value]) =>
        Array.isArray(value) ? value.length > 0 : value !== null && value !== ""
      )
      .map(([key]) => key);

    const excludedCandidateIds = await fetchExcludedCandidateIds(
      supabase,
      intentFacets.excludedCompanyTerms ?? [],
    );
    const eligibleData = ((data ?? []) as Array<Record<string, unknown>>)
      .filter((row) =>
        !excludedCandidateIds.has(String(row.candidate_id ?? ""))
      );
    const results = attachMatchRates(eligibleData);
    const response = {
      request: {
        query,
        limit,
        offset,
        tenant_ids: tenantIds,
        explicit_filters: scopedRequestFilters,
        excluded_company_terms: intentFacets.excludedCompanyTerms ?? [],
      },
      analysis: {
        intent_source: intentSource,
        llm_intent: llmIntent,
        resolved_intent: resolvedIntent,
        embedding: {
          provider: queryEmbeddingPayload.provider,
          version: queryEmbeddingPayload.embeddingVersion,
          dimensions: Array.isArray(queryEmbeddingPayload.embedding)
            ? queryEmbeddingPayload.embedding.length
            : 0,
          preview: Array.isArray(queryEmbeddingPayload.embedding)
            ? queryEmbeddingPayload.embedding.slice(0, 12)
            : [],
        },
        rpc_payload: {
          ...rpcPayload,
          p_query_embedding: undefined,
          p_query_embedding_dimensions: Array.isArray(
              queryEmbeddingPayload.embedding,
            )
            ? queryEmbeddingPayload.embedding.length
            : 0,
          p_query_embedding_preview: Array.isArray(
              queryEmbeddingPayload.embedding,
            )
            ? queryEmbeddingPayload.embedding.slice(0, 12)
            : [],
        },
        uses_lexical: query.trim().length > 0,
        uses_semantic: Boolean(queryEmbeddingPayload.embedding),
        uses_name_boost: query.trim().length > 0,
        strict_filters: strictFilters,
      },
      results,
      next_cursor: results.length < limit ? null : offset + limit,
      meta: {
        count: results.length,
        rank_version: body.rank_version ?? "v2-rate",
        source: "remote",
      },
    };

    return jsonResponse(200, {
      ...response,
      raw_response: response,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "unexpected_error",
      details: `${error}`,
    });
  }
});
