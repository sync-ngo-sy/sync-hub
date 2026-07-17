import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { evaluatePlatformAiInput } from "../_shared/aiGuardrails.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";
import { createTraceId, withTraceHeader } from "../_shared/ops";
import {
  excludeCompanyMatches,
  hasExcludedCompanyMatch,
  resolveSearchFilters,
  type SearchIntentFacetOptions,
  type SearchIntentPayload,
} from "../_shared/searchIntent";
import {
  asString,
  asStringArray,
  describeError,
  type JsonRecord,
} from "../_shared/utils";
import {
  attachMatchRates,
  extractIntentWithLlm,
  fetchCandidateSearchRows,
  fetchSearchIntentFacets,
  normalizeExplicitFilters,
  runFastProfileSearch,
} from "../_shared/searchScoring";
import { createResponder } from "./telemetry.ts";
import { buildRpcPayload } from "./helpers.ts";

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

  const respond = createResponder(
    () => supabase,
    () => tenantIds,
    traceId,
    startedAt,
  );

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
        extractIntentWithLlm("search_intent_llm_retry", query, {
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

    const rpcPayload = buildRpcPayload(
      query,
      queryEmbeddingPayload.embedding,
      limit,
      offset,
      filters,
      scopedRequestFilters,
      queryEmbeddingPayload.embeddingVersion,
      rankVersion,
    );

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
