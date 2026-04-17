import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";

type SupportedIntent =
  | "why_matched"
  | "strengths"
  | "gaps"
  | "compare"
  | "experience"
  | "skills";

function inferIntent(question: string): SupportedIntent {
  const normalized = question.toLowerCase();
  if (normalized.includes("why")) return "why_matched";
  if (normalized.includes("strength")) return "strengths";
  if (normalized.includes("gap")) return "gaps";
  if (normalized.includes("compare")) return "compare";
  if (normalized.includes("experience")) return "experience";
  return "skills";
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
    const question = (body.question ?? "").trim();
    const candidateIds = body.candidate_ids ?? [];

    if (!question) {
      return jsonResponse(400, { error: "question is required" });
    }

    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      return jsonResponse(400, { error: "candidate_ids is required" });
    }

    const intent = inferIntent(question);
    const supabase = createAuthedClient(req);

    const [dossiers, evidence] = await Promise.all([
      supabase
        .from("candidate_dossier_v1")
        .select("candidate_id, name, current_title, years_experience, seniority, top_skills, short_summary, strengths, risks")
        .in("candidate_id", candidateIds),
      supabase.rpc("retrieve_candidate_evidence_v1", {
        p_candidate_ids: candidateIds,
        p_q: question,
        p_limit: body.top_k ?? 12,
        p_query_embedding: body.question_embedding ?? null,
        p_embedding_version: body.embedding_version ?? null,
      }),
    ]);

    if (dossiers.error) {
      return jsonResponse(400, { error: "ask_failed", details: dossiers.error.message });
    }
    if (evidence.error) {
      return jsonResponse(400, { error: "evidence_failed", details: evidence.error.message });
    }

    const facts = (dossiers.data ?? []).flatMap((row: any) => {
      switch (intent) {
        case "strengths":
          return (row.strengths ?? []).map((item: string) => ({
            candidate_id: row.candidate_id,
            candidate_name: row.name,
            fact: item,
          }));
        case "gaps":
          return (row.risks ?? []).map((item: string) => ({
            candidate_id: row.candidate_id,
            candidate_name: row.name,
            fact: item,
          }));
        case "experience":
          return [{
            candidate_id: row.candidate_id,
            candidate_name: row.name,
            fact: `${row.name} has ${row.years_experience ?? 0} years of experience and seniority ${row.seniority ?? "unknown"}.`,
          }];
        case "skills":
          return [{
            candidate_id: row.candidate_id,
            candidate_name: row.name,
            fact: `${row.name} lists skills: ${(row.top_skills ?? []).slice(0, 8).join(", ")}.`,
          }];
        case "compare":
        case "why_matched":
        default:
          return [{
            candidate_id: row.candidate_id,
            candidate_name: row.name,
            fact: row.short_summary ?? `${row.name} is profiled as ${row.current_title ?? "candidate"}.`,
          }];
      }
    });

    return jsonResponse(200, {
      intent,
      facts,
      citations: evidence.data ?? [],
      context_blocks: evidence.data ?? [],
      extractive_answer: facts.slice(0, 3).map((item) => item.fact).join(" "),
      meta: {
        candidate_count: candidateIds.length,
        top_k: body.top_k ?? 12,
      },
    });
  } catch (error) {
    return jsonResponse(500, { error: "unexpected_error", details: `${error}` });
  }
});
