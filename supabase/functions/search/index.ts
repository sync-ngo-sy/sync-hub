import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";

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
    const filters = body.filters ?? {};

    const { data, error } = await supabase.rpc("search_candidates_v1", {
      p_q: body.q ?? "",
      p_query_embedding: body.query_embedding ?? null,
      p_limit: body.limit ?? 20,
      p_offset: body.offset ?? 0,
      p_role: filters.role ?? null,
      p_seniority: filters.seniority ?? null,
      p_min_years: filters.min_years_experience ?? null,
      p_skills: filters.skills ?? [],
      p_embedding_version: body.embedding_version ?? null,
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
      },
    });
  } catch (error) {
    return jsonResponse(500, { error: "unexpected_error", details: `${error}` });
  }
});
