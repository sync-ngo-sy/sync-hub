import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  buildGuardedSystemPrompt,
  evaluatePlatformAiConversation,
  PLATFORM_AI_SCOPE_MESSAGE,
  platformAiGuardErrorMessage,
} from "../_shared/aiGuardrails.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { generateText } from "../_shared/llm.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";

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

type SearchHitRow = {
  candidate_id: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_VISIBLE_CITATIONS = 3;
const MAX_CONTEXT_BLOCKS = 6;

function isCorpusCountQuestion(question: string) {
  const normalized = question.toLowerCase();
  return (
    /(how many|number of|count of|count)\b/.test(normalized) &&
    /\b(cv|cvs|resume|resumes|candidate|candidates|profile|profiles)\b/.test(
      normalized,
    )
  );
}

function isWorkspaceQuestion(question: string) {
  const normalized = question.toLowerCase();
  return /\b(cv|cvs|resume|resumes|candidate|candidates|profile|profiles|recruit|recruiter|hire|hiring|shortlist|compare|match|skill|skills|experience|seniority|role|roles|backend|frontend|full[\s-]?stack|devops|graphql|react|node|engineer|engineers)\b/
    .test(
      normalized,
    );
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.trim()
      ) {
        return {
          role,
          content: content.trim(),
        } satisfies ChatMessage;
      }
      return null;
    })
    .filter((item): item is ChatMessage => Boolean(item))
    .slice(-12);
}

function evidenceSignal(row: EvidenceRow) {
  return Math.max(
    Number(row.semantic_similarity) || 0,
    Number(row.lexical_score) || 0,
  );
}

function limitEvidenceRows(rows: EvidenceRow[], limit: number) {
  const seenChunkIds = new Set<string>();
  return [...rows]
    .sort((left, right) => evidenceSignal(right) - evidenceSignal(left))
    .filter((row) => {
      if (!row.chunk_id || seenChunkIds.has(row.chunk_id)) {
        return false;
      }
      seenChunkIds.add(row.chunk_id);
      return true;
    })
    .slice(0, limit);
}

function normalizeTenantIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function buildFallbackAnswer(
  question: string,
  dossiers: DossierRow[],
  evidence: EvidenceRow[],
) {
  if (!dossiers.length) {
    return `I could not retrieve grounded candidate evidence for: "${question}". Try adding a role, skill, seniority, or location.`;
  }

  const summaries = dossiers
    .slice(0, 3)
    .map(
      (row) =>
        row.short_summary ||
        `${row.name} is profiled as ${row.current_title ?? "candidate"}.`,
    )
    .filter(Boolean);
  const excerpts = evidence
    .slice(0, 2)
    .map((row) => row.text.trim())
    .filter(Boolean);

  return [...summaries, ...excerpts].join("\n\n").trim();
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
    const question = String(body.question ?? "").trim();
    const messages = normalizeMessages(body.messages);
    const tenantIds = normalizeTenantIds(body.tenant_ids);
    const requestedCandidateIds = Array.isArray(body.candidate_ids)
      ? body.candidate_ids
        .map((item: unknown) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
      : [];

    if (!question) {
      return jsonResponse(400, { error: "question is required" });
    }

    const guardResult = evaluatePlatformAiConversation([
      question,
      ...messages
        .filter((message) => message.role === "user")
        .map((message) => message.content),
    ]);
    if (!guardResult.allowed) {
      return jsonResponse(200, {
        answer: platformAiGuardErrorMessage(guardResult),
        citations: [],
        context_blocks: [],
        meta: {
          candidate_count: 0,
          top_k: 0,
          answer_source: "guardrail",
          guardrail_code: guardResult.code ?? null,
          embedding_version: null,
          scope_source: "blocked",
          resolved_candidate_ids: [],
        },
      });
    }

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

    if (!requestedCandidateIds.length && isCorpusCountQuestion(question)) {
      const [documentsCountResult, candidatesCountResult] = await Promise.all([
        tenantIds.length
          ? supabase
            .from("source_documents")
            .select("id", { count: "exact", head: true })
            .in("tenant_id", tenantIds)
          : supabase
            .from("source_documents")
            .select("id", { count: "exact", head: true }),
        tenantIds.length
          ? supabase
            .from("candidates")
            .select("id", { count: "exact", head: true })
            .in("tenant_id", tenantIds)
          : supabase
            .from("candidates")
            .select("id", { count: "exact", head: true }),
      ]);

      if (documentsCountResult.error) {
        return jsonResponse(400, {
          error: "workspace_count_failed",
          details: documentsCountResult.error.message,
        });
      }
      if (candidatesCountResult.error) {
        return jsonResponse(400, {
          error: "workspace_count_failed",
          details: candidatesCountResult.error.message,
        });
      }

      const documentsCount = documentsCountResult.count ?? 0;
      const candidatesCount = candidatesCountResult.count ?? 0;

      return jsonResponse(200, {
        answer: documentsCount === candidatesCount
          ? `There are ${documentsCount} CVs indexed in the current scope.`
          : `There are ${documentsCount} CVs indexed in the current scope, representing ${candidatesCount} candidate profiles.`,
        citations: [],
        context_blocks: [],
        meta: {
          candidate_count: candidatesCount,
          top_k: 0,
          answer_source: "workspace_stats",
          embedding_version: questionEmbeddingPayload.embeddingVersion,
          scope_source: "workspace_stats",
          resolved_candidate_ids: [],
        },
      });
    }

    if (!requestedCandidateIds.length && !isWorkspaceQuestion(question)) {
      return jsonResponse(200, {
        answer: PLATFORM_AI_SCOPE_MESSAGE,
        citations: [],
        context_blocks: [],
        meta: {
          candidate_count: 0,
          top_k: 0,
          answer_source: "guardrail",
          guardrail_code: "off_scope_task",
          embedding_version: questionEmbeddingPayload.embeddingVersion,
          scope_source: "platform_scope",
          resolved_candidate_ids: [],
        },
      });
    }

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
          p_rank_version: body.rank_version ?? "agent-v1",
          p_tenant_ids: tenantIds.length ? tenantIds : null,
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

    if (candidateIds.length && tenantIds.length) {
      const scopedCandidates = await supabase
        .from("candidate_dossier_v1")
        .select("candidate_id")
        .in("candidate_id", candidateIds)
        .in("tenant_id", tenantIds);

      if (scopedCandidates.error) {
        return jsonResponse(400, {
          error: "scope_validation_failed",
          details: scopedCandidates.error.message,
        });
      }

      candidateIds = Array.from(
        new Set(
          ((scopedCandidates.data ?? []) as Array<{ candidate_id: string }>)
            .map((row) => row.candidate_id)
            .filter(Boolean),
        ),
      );
    }

    if (!candidateIds.length) {
      return jsonResponse(200, {
        answer:
          `I could not retrieve grounded candidates for: "${question}". Try adding a clearer role, skill, seniority, or location.`,
        citations: [],
        context_blocks: [],
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
        error: "agent_failed",
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

    let answer = buildFallbackAnswer(question, dossierRows, evidenceRows);
    let answerSource = "deterministic";

    try {
      const generated = await generateText({
        systemPrompt: buildGuardedSystemPrompt(
          "You are a secure recruiter copilot. Answer naturally in plain text, but only using the provided candidate dossiers and evidence chunks for any workspace-specific claims. Be concise, grounded, and explicit when evidence is weak. If asked to dump private records or bulk candidate PII, refuse briefly and offer a safer summary.",
          "SYNC AI chat",
        ),
        userPrompt: JSON.stringify({
          question,
          messages,
          candidate_ids: candidateIds,
          dossiers: dossierRows,
          evidence: evidenceRows.map((item) => ({
            candidate_id: item.candidate_id,
            chunk_id: item.chunk_id,
            chunk_type: item.chunk_type,
            section_name: item.section_name,
            text: item.text,
            lexical_score: item.lexical_score,
            semantic_similarity: item.semantic_similarity,
          })),
        }),
        temperature: 0.2,
      });

      if (generated?.text?.trim()) {
        answer = generated.text.trim();
        answerSource = generated.provider;
      }
    } catch {
      answer = buildFallbackAnswer(question, dossierRows, evidenceRows);
    }

    return jsonResponse(200, {
      answer,
      citations: limitEvidenceRows(evidenceRows, MAX_VISIBLE_CITATIONS),
      context_blocks: limitEvidenceRows(evidenceRows, MAX_CONTEXT_BLOCKS),
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
