import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  evaluatePlatformAiInput,
  platformAiGuardErrorMessage,
} from "../_shared/aiGuardrails.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";
import {
  type DossierRow,
  type EvidenceRow,
  limitEvidenceRows,
} from "../_shared/agentHelpers.ts";

import {
  buildDeterministicFacts,
  inferIntent,
  MAX_CONTEXT_BLOCKS,
  MAX_VISIBLE_CITATIONS,
  synthesizeAnswerWithLlm,
} from "./helpers.ts";
import { type AskSynthesis, type SearchHitRow } from "./types.ts";

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
    const requestedCandidateIds = Array.isArray(body.candidate_ids)
      ? body.candidate_ids
        .map((item: unknown) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
      : [];

    if (!question) {
      return jsonResponse(400, { error: "question is required" });
    }

    const guardResult = evaluatePlatformAiInput(question);
    if (!guardResult.allowed) {
      return jsonResponse(200, {
        intent: inferIntent(question),
        facts: [],
        citations: [],
        context_blocks: [],
        extractive_answer: platformAiGuardErrorMessage(guardResult),
        meta: {
          candidate_count: 0,
          top_k: body.top_k ?? 12,
          answer_source: "guardrail",
          guardrail_code: guardResult.code ?? null,
          embedding_version: null,
          scope_source: "blocked",
          resolved_candidate_ids: [],
        },
      });
    }

    const intent = inferIntent(question);
    const supabase = createAuthedClient(req);
    const questionEmbeddingPayload = Array.isArray(body.question_embedding)
      ? {
        embedding: body.question_embedding,
        embeddingVersion: typeof body.embedding_version === "string"
          ? body.embedding_version
          : null,
      }
      : await buildQueryEmbedding(question);

    let candidateIds = requestedCandidateIds;
    const scopeSource = requestedCandidateIds.length ? "explicit" : "retrieved";

    if (!candidateIds.length) {
      const { data: searchRows, error: searchError } = await supabase.rpc(
        "search_candidates_v1",
        {
          p_q: question,
          p_query_embedding: questionEmbeddingPayload.embedding,
          p_limit: body.candidate_limit ?? 4,
          p_offset: 0,
          p_role: null,
          p_seniority: null,
          p_min_years: null,
          p_skills: [],
          p_embedding_version: questionEmbeddingPayload.embeddingVersion,
          p_rank_version: body.rank_version ?? "chat-v1",
        },
      );

      if (searchError) {
        return jsonResponse(400, {
          error: "candidate_scope_failed",
          details: searchError.message,
        });
      }

      candidateIds = Array.from(
        new Set(
          ((searchRows ?? []) as SearchHitRow[])
            .map((row) => row.candidate_id)
            .filter(Boolean),
        ),
      );
    }

    if (!candidateIds.length) {
      return jsonResponse(200, {
        intent,
        facts: [],
        citations: [],
        context_blocks: [],
        extractive_answer:
          "No grounded candidates were retrieved for this question yet. Try adding a role, skill, seniority, or location to narrow the corpus.",
        meta: {
          candidate_count: 0,
          top_k: body.top_k ?? 12,
          answer_source: "empty_scope",
          embedding_version: questionEmbeddingPayload.embeddingVersion,
          scope_source: scopeSource,
          resolved_candidate_ids: [],
        },
      });
    }

    const [dossiers, evidence] = await Promise.all([
      supabase
        .from("candidate_dossier_v1")
        .select(
          "candidate_id, name, current_title, years_experience, seniority, top_skills, short_summary, strengths, risks",
        )
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
      return jsonResponse(400, {
        error: "ask_failed",
        details: dossiers.error.message,
      });
    }
    if (evidence.error) {
      return jsonResponse(400, {
        error: "evidence_failed",
        details: evidence.error.message,
      });
    }

    const dossierRows = (dossiers.data ?? []) as DossierRow[];
    const evidenceRows = (evidence.data ?? []) as EvidenceRow[];
    const fallbackFacts = buildDeterministicFacts(intent, dossierRows);

    let synthesized: AskSynthesis | null = null;
    let answerSource = "deterministic";
    try {
      synthesized = await synthesizeAnswerWithLlm(
        question,
        intent,
        dossierRows,
        evidenceRows,
      );
      if (synthesized) {
        answerSource = "llm";
      }
    } catch {
      synthesized = null;
    }

    const citedChunkIds = new Set(synthesized?.cited_chunk_ids ?? []);
    const citationCandidates = citedChunkIds.size > 0
      ? evidenceRows.filter((row) => citedChunkIds.has(row.chunk_id))
      : evidenceRows;
    const citations = limitEvidenceRows(
      citationCandidates,
      MAX_VISIBLE_CITATIONS,
    );
    const contextBlocks = limitEvidenceRows(evidenceRows, MAX_CONTEXT_BLOCKS);
    const facts = synthesized?.facts?.length
      ? synthesized.facts
      : fallbackFacts;
    const extractiveAnswer = synthesized?.answer?.trim().length
      ? synthesized.answer
      : facts
        .slice(0, 3)
        .map((item) => item.fact)
        .join(" ");

    return jsonResponse(200, {
      intent,
      facts,
      citations: citations,
      context_blocks: contextBlocks,
      extractive_answer: extractiveAnswer,
      meta: {
        candidate_count: candidateIds.length,
        top_k: body.top_k ?? 12,
        answer_source: answerSource,
        embedding_version: questionEmbeddingPayload.embeddingVersion,
        scope_source: scopeSource,
        resolved_candidate_ids: candidateIds,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "unexpected_error",
      details: `${error}`,
    });
  }
});
