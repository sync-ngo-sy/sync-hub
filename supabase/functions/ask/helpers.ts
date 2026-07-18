import { buildGuardedSystemPrompt } from "../_shared/aiGuardrails.ts";
import { generateStructuredObject } from "../_shared/llm.ts";
import { type DossierRow, type EvidenceRow } from "../_shared/agentHelpers.ts";
import { type AskSynthesis, type SupportedIntent } from "./types.ts";

export const MAX_VISIBLE_CITATIONS = 3;
export const MAX_CONTEXT_BLOCKS = 6;

export function inferIntent(question: string): SupportedIntent {
  const normalized = question.toLowerCase();
  if (normalized.includes("why")) return "why_matched";
  if (normalized.includes("strength")) return "strengths";
  if (normalized.includes("gap")) return "gaps";
  if (normalized.includes("compare")) return "compare";
  if (normalized.includes("experience")) return "experience";
  return "skills";
}

export function buildDeterministicFacts(
  intent: SupportedIntent,
  dossiers: DossierRow[],
) {
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
        return [
          {
            candidate_id: row.candidate_id,
            candidate_name: row.name,
            fact: `${row.name} has ${
              row.years_experience ?? 0
            } years of experience and seniority ${row.seniority ?? "unknown"}.`,
          },
        ];
      case "skills":
        return [
          {
            candidate_id: row.candidate_id,
            candidate_name: row.name,
            fact: `${row.name} lists skills: ${
              (row.top_skills ?? []).slice(0, 8).join(", ")
            }.`,
          },
        ];
      case "compare":
      case "why_matched":
      default:
        return [
          {
            candidate_id: row.candidate_id,
            candidate_name: row.name,
            fact: row.short_summary ??
              `${row.name} is profiled as ${row.current_title ?? "candidate"}.`,
          },
        ];
    }
  });
}

export async function synthesizeAnswerWithLlm(
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
    systemPrompt: buildGuardedSystemPrompt(
      "Answer recruiter questions using only the provided candidate dossier facts and retrieved evidence chunks. Do not introduce unsupported claims. If the evidence is weak, say so plainly. Keep the answer concise and structured.",
      "Ask",
    ),
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
