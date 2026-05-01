import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { generateStructuredObject } from "../_shared/llm.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";
import { buildSearchIntentConfig, resolveSearchFilters, type SearchIntentPayload } from "../_shared/searchIntent.ts";
import { normalizeSeniorityValue, normalizeSkillList } from "../_shared/searchTaxonomy.ts";

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calibratedMatchRate(row: Record<string, unknown>) {
  const subscores = row.subscores && typeof row.subscores === "object" && !Array.isArray(row.subscores)
    ? row.subscores as Record<string, unknown>
    : {};
  const rawScore = Math.max(0, toFiniteNumber(row.score_raw ?? row.score));
  const retrievalSignal = Math.max(
    toFiniteNumber(subscores.semantic_similarity),
    Math.min(1, toFiniteNumber(subscores.max_chunk_rrf) * 40),
    Math.min(1, toFiniteNumber(subscores.avg_top3_chunk_rrf) * 45),
  );
  const weightedSignal = Math.max(
    rawScore,
    (0.5 * retrievalSignal)
      + (0.14 * toFiniteNumber(subscores.role_match))
      + (0.12 * toFiniteNumber(subscores.skill_match))
      + (0.08 * toFiniteNumber(subscores.experience_match))
      + (0.06 * toFiniteNumber(subscores.seniority_match))
      + (0.07 * toFiniteNumber(subscores.name_match))
      + (0.03 * toFiniteNumber(subscores.company_match)),
  );

  if (weightedSignal <= 0) {
    return 0;
  }
  return Math.min(99, Math.max(1, Math.round((1 - Math.exp(-3.2 * weightedSignal)) * 100)));
}

function attachMatchRates(rows: unknown[]) {
  return rows.map((row) => {
    const record = row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
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
    min_years_experience: minYearsRaw !== null && minYearsRaw > 0 ? minYearsRaw : null,
    location: asString(filters.location),
    skills: normalizeSkillList(asStringArray(filters.skills)),
    companies: asStringArray(filters.companies),
  };
}

async function extractIntentWithLlm(query: string, filters: Record<string, unknown>): Promise<SearchIntentPayload | null> {
  const result = await generateStructuredObject<SearchIntentPayload>(buildSearchIntentConfig(query, filters));
  return result?.object ?? null;
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
    const requestFilters = normalizeExplicitFilters((body.filters ?? {}) as Record<string, unknown>);
    const limit = typeof body.limit === "number" ? body.limit : 20;
    const offset = typeof body.offset === "number" ? body.offset : 0;

    let intentSource: "llm" | "rule_based" = "rule_based";
    let llmIntent: SearchIntentPayload | null = null;

    try {
      llmIntent = await extractIntentWithLlm(query, requestFilters);
      if (llmIntent) {
        intentSource = "llm";
      }
    } catch {
      llmIntent = null;
    }

    const resolvedIntent = resolveSearchFilters(query, {
      role: requestFilters.role ?? null,
      seniority: requestFilters.seniority ?? null,
      min_years_experience: requestFilters.min_years_experience ?? null,
      location: requestFilters.location ?? null,
      skills: requestFilters.skills,
      companies: requestFilters.companies,
    }, llmIntent);

    const queryEmbeddingPayload = Array.isArray(body.query_embedding)
      ? {
          embedding: body.query_embedding,
          embeddingVersion: typeof body.embedding_version === "string" ? body.embedding_version : null,
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
      p_tenant_ids: tenantIds.length ? tenantIds : null,
      p_filter_role: requestFilters.role ?? null,
      p_filter_seniority: requestFilters.seniority ?? null,
      p_filter_min_years: requestFilters.min_years_experience ?? null,
      p_filter_skills: requestFilters.skills ?? [],
      p_filter_companies: requestFilters.companies ?? [],
      p_filter_location: requestFilters.location ?? null,
    };

    let { data, error } = await supabase.rpc("search_candidates_with_rate_v1", rpcPayload);

    if (error && `${error.message}`.includes("search_candidates_with_rate_v1")) {
      const fallback = await supabase.rpc("search_candidates_v1", rpcPayload);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return jsonResponse(400, { error: "search_debug_failed", details: error.message });
    }

    const strictFilters = Object.entries(requestFilters)
      .filter(([, value]) => Array.isArray(value) ? value.length > 0 : value !== null && value !== "")
      .map(([key]) => key);

    const results = attachMatchRates(data ?? []);
    const response = {
      request: {
        query,
        limit,
        offset,
        tenant_ids: tenantIds,
        explicit_filters: requestFilters,
      },
      analysis: {
        intent_source: intentSource,
        llm_intent: llmIntent,
        resolved_intent: resolvedIntent,
        embedding: {
          provider: queryEmbeddingPayload.provider,
          version: queryEmbeddingPayload.embeddingVersion,
          dimensions: Array.isArray(queryEmbeddingPayload.embedding) ? queryEmbeddingPayload.embedding.length : 0,
          preview: Array.isArray(queryEmbeddingPayload.embedding) ? queryEmbeddingPayload.embedding.slice(0, 12) : [],
        },
        rpc_payload: {
          ...rpcPayload,
          p_query_embedding: undefined,
          p_query_embedding_dimensions: Array.isArray(queryEmbeddingPayload.embedding) ? queryEmbeddingPayload.embedding.length : 0,
          p_query_embedding_preview: Array.isArray(queryEmbeddingPayload.embedding) ? queryEmbeddingPayload.embedding.slice(0, 12) : [],
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
    return jsonResponse(500, { error: "unexpected_error", details: `${error}` });
  }
});
