import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { generateStructuredObject } from "../_shared/llm.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";
import { deriveSearchFilters, SEARCH_ROLE_VALUES, SEARCH_SENIORITY_VALUES } from "../_shared/searchIntent.ts";

type SearchIntentPayload = {
  role: string | null;
  seniority: string | null;
  min_years_experience: number | null;
  skills: string[];
  location: string | null;
};

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

async function extractIntentWithLlm(query: string, filters: Record<string, unknown>): Promise<SearchIntentPayload | null> {
  const result = await generateStructuredObject<SearchIntentPayload>({
    schemaName: "search_intent",
    schema: {
      type: "object",
      properties: {
        role: {
          type: ["string", "null"],
          enum: [...SEARCH_ROLE_VALUES, null],
          description: "Normalized role requested by the recruiter.",
        },
        seniority: {
          type: ["string", "null"],
          enum: [...SEARCH_SENIORITY_VALUES, null],
          description: "Normalized seniority requested by the recruiter.",
        },
        min_years_experience: {
          type: ["number", "null"],
          description: "Minimum years of experience explicitly requested, otherwise null.",
        },
        skills: {
          type: "array",
          description: "Explicitly requested skills only. Normalize aliases.",
          items: {
            type: "string",
          },
        },
        location: {
          type: ["string", "null"],
          description: "Explicit location hint only if directly stated.",
        },
      },
      required: ["role", "seniority", "min_years_experience", "skills", "location"],
    },
    systemPrompt:
      "Extract recruiter search intent into normalized fields. Only capture constraints explicitly or strongly implied by the query. Do not invent skills or locations. Normalize roles and seniority to the allowed enums.",
    userPrompt: JSON.stringify({
      query,
      existing_filters: filters,
      allowed_roles: SEARCH_ROLE_VALUES,
      allowed_seniority: SEARCH_SENIORITY_VALUES,
    }),
    temperature: 0,
  });

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
    const requestFilters = (body.filters ?? {}) as Record<string, unknown>;
    let intentSource = "rule_based";
    let llmIntent: SearchIntentPayload | null = null;

    try {
      llmIntent = await extractIntentWithLlm(query, requestFilters);
      if (llmIntent) {
        intentSource = "llm";
      }
    } catch {
      llmIntent = null;
    }

    const filters = deriveSearchFilters(query, {
      role: asString(requestFilters.role) ?? llmIntent?.role ?? null,
      seniority: asString(requestFilters.seniority) ?? llmIntent?.seniority ?? null,
      min_years_experience: asNumber(requestFilters.min_years_experience) ?? llmIntent?.min_years_experience ?? null,
      location: asString(requestFilters.location) ?? llmIntent?.location ?? null,
      skills: (() => {
        const explicit = asStringArray(requestFilters.skills);
        return explicit.length > 0 ? explicit : (llmIntent?.skills ?? []);
      })(),
    });
    const queryEmbeddingPayload = Array.isArray(body.query_embedding)
      ? {
          embedding: body.query_embedding,
          embeddingVersion: typeof body.embedding_version === "string" ? body.embedding_version : null,
          provider: "client",
        }
      : await buildQueryEmbedding(query);

    const { data, error } = await supabase.rpc("search_candidates_v1", {
      p_q: query,
      p_query_embedding: queryEmbeddingPayload.embedding,
      p_limit: body.limit ?? 20,
      p_offset: body.offset ?? 0,
      p_role: filters.role ?? null,
      p_seniority: filters.seniority ?? null,
      p_min_years: filters.min_years_experience ?? null,
      p_skills: filters.skills ?? [],
      p_embedding_version: queryEmbeddingPayload.embeddingVersion,
      p_rank_version: body.rank_version ?? "v1",
    });

    if (error) {
      return jsonResponse(400, { error: "search_failed", details: error.message });
    }

    return jsonResponse(200, {
      results: data ?? [],
      next_cursor: (body.offset ?? 0) + (body.limit ?? 20),
      meta: {
        count: (data ?? []).length,
        rank_version: body.rank_version ?? "v1",
        intent_source: intentSource,
        intent: filters,
        embedding_provider: queryEmbeddingPayload.provider,
        embedding_version: queryEmbeddingPayload.embeddingVersion,
      },
    });
  } catch (error) {
    return jsonResponse(500, { error: "unexpected_error", details: `${error}` });
  }
});
