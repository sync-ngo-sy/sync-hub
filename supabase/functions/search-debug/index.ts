import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { evaluatePlatformAiInput } from "../_shared/aiGuardrails.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";
import {
  excludeCompanyMatches,
  resolveSearchFilters,
  type SearchIntentFacetOptions,
  type SearchIntentPayload,
} from "../_shared/searchIntent.ts";
import { asStringArray } from "../_shared/utils.ts";
import {
  attachMatchRates,
  extractIntentWithLlm,
  fetchSearchIntentFacets,
  normalizeExplicitFilters,
} from "../_shared/searchScoring.ts";
import { fetchExcludedCandidateIds } from "./helpers.ts";

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
    const queryGuard = evaluatePlatformAiInput(query, {
      allowRecruitmentContextBypass: true,
    });
    if (!queryGuard.allowed) {
      return jsonResponse(400, {
        error: "ai_guardrail",
        guardrail_code: queryGuard.code ?? null,
        details: queryGuard.message ?? "Query is outside platform scope.",
      });
    }

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
        ? await extractIntentWithLlm("search_debug_intent_llm_retry", query, {
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
