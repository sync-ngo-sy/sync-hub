import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { generateStructuredObject } from "../_shared/llm.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";

type SupportedIntent =
  | "why_matched"
  | "strengths"
  | "gaps"
  | "compare"
  | "experience"
  | "skills";

type DossierRow = {
  candidate_id: string;
  name: string;
  current_title: string | null;
  years_experience: number | null;
  seniority: string | null;
  top_skills: string[] | null;
  short_summary: string | null;
  strengths: string[] | null;
  risks: string[] | null;
};

type EvidenceRow = {
  candidate_id: string;
  chunk_id: string;
  chunk_type: string;
  section_name: string;
  text: string;
  lexical_score: number;
  semantic_similarity: number;
};

type AskSynthesis = {
  answer: string;
  facts: Array<{
    candidate_id: string;
    candidate_name: string;
    fact: string;
  }>;
  cited_chunk_ids: string[];
};

function inferIntent(question: string): SupportedIntent {
  const normalized = question.toLowerCase();
  if (normalized.includes("why")) return "why_matched";
  if (normalized.includes("strength")) return "strengths";
  if (normalized.includes("gap")) return "gaps";
  if (normalized.includes("compare")) return "compare";
  if (normalized.includes("experience")) return "experience";
  return "skills";
}

function buildDeterministicFacts(intent: SupportedIntent, dossiers: DossierRow[]) {
  return dossiers.flatMap((row) => {
    switch (intent) {
      case "strengths":
        return (row.strengths ?? []).map((item) => ({
          candidate_id: row.candidate_id,
          candidate_name: row.name,
          fact: item,
        }));
      case "gaps":
        return (row.risks ?? []).map((item) => ({
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
}

async function synthesizeAnswerWithLlm(
  question: string,
  intent: SupportedIntent,
  dossiers: DossierRow[],
  evidence: EvidenceRow[],
): Promise<AskSynthesis | null> {
  const result = await generateStructuredObject<AskSynthesis>({
    schemaName: "ask_synthesis",
    schema: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          description: "Concise grounded answer to the recruiter question.",
        },
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              candidate_id: { type: "string" },
              candidate_name: { type: "string" },
              fact: { type: "string" },
            },
            required: ["candidate_id", "candidate_name", "fact"],
          },
        },
        cited_chunk_ids: {
          type: "array",
          description: "Chunk ids that directly support the answer.",
          items: { type: "string" },
        },
      },
      required: ["answer", "facts", "cited_chunk_ids"],
    },
    systemPrompt:
      "Answer recruiter questions using only the provided candidate dossier facts and retrieved evidence chunks. Do not introduce unsupported claims. If the evidence is weak, say so plainly. Keep the answer concise and structured.",
    userPrompt: JSON.stringify({
      question,
      intent,
      dossiers,
      evidence: evidence.map((item) => ({
        candidate_id: item.candidate_id,
        chunk_id: item.chunk_id,
        chunk_type: item.chunk_type,
        section_name: item.section_name,
        text: item.text,
        lexical_score: item.lexical_score,
        semantic_similarity: item.semantic_similarity,
      })),
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
    const questionEmbeddingPayload = Array.isArray(body.question_embedding)
      ? {
          embedding: body.question_embedding,
          embeddingVersion: typeof body.embedding_version === "string" ? body.embedding_version : null,
        }
      : await buildQueryEmbedding(question);

    const [dossiers, evidence] = await Promise.all([
      supabase
        .from("candidate_dossier_v1")
        .select("candidate_id, name, current_title, years_experience, seniority, top_skills, short_summary, strengths, risks")
        .in("candidate_id", candidateIds),
      supabase.rpc("retrieve_candidate_evidence_v1", {
        p_candidate_ids: candidateIds,
        p_q: question,
        p_limit: body.top_k ?? 12,
        p_query_embedding: questionEmbeddingPayload.embedding,
        p_embedding_version: questionEmbeddingPayload.embeddingVersion,
      }),
    ]);

    if (dossiers.error) {
      return jsonResponse(400, { error: "ask_failed", details: dossiers.error.message });
    }
    if (evidence.error) {
      return jsonResponse(400, { error: "evidence_failed", details: evidence.error.message });
    }

    const dossierRows = (dossiers.data ?? []) as DossierRow[];
    const evidenceRows = (evidence.data ?? []) as EvidenceRow[];
    const fallbackFacts = buildDeterministicFacts(intent, dossierRows);

    let synthesized: AskSynthesis | null = null;
    let answerSource = "deterministic";
    try {
      synthesized = await synthesizeAnswerWithLlm(question, intent, dossierRows, evidenceRows);
      if (synthesized) {
        answerSource = "llm";
      }
    } catch {
      synthesized = null;
    }

    const citedChunkIds = new Set(synthesized?.cited_chunk_ids ?? []);
    const citations = citedChunkIds.size > 0
      ? evidenceRows.filter((row) => citedChunkIds.has(row.chunk_id))
      : evidenceRows;
    const facts = synthesized?.facts?.length ? synthesized.facts : fallbackFacts;
    const extractiveAnswer = synthesized?.answer?.trim().length
      ? synthesized.answer
      : facts.slice(0, 3).map((item) => item.fact).join(" ");

    return jsonResponse(200, {
      intent,
      facts,
      citations: citations,
      context_blocks: evidenceRows,
      extractive_answer: extractiveAnswer,
      meta: {
        candidate_count: candidateIds.length,
        top_k: body.top_k ?? 12,
        answer_source: answerSource,
        embedding_version: questionEmbeddingPayload.embeddingVersion,
      },
    });
  } catch (error) {
    return jsonResponse(500, { error: "unexpected_error", details: `${error}` });
  }
});
