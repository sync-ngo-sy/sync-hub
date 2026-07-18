import { type DossierRow, type EvidenceRow } from "../_shared/agentHelpers.ts";
import { type ChatMessage } from "./types.ts";

export const MAX_VISIBLE_CITATIONS = 3;
export const MAX_CONTEXT_BLOCKS = 6;

export function isCorpusCountQuestion(question: string) {
  const normalized = question.toLowerCase();
  return (
    /(how many|number of|count of|count)\b/.test(normalized) &&
    /\b(cv|cvs|resume|resumes|candidate|candidates|profile|profiles)\b/.test(
      normalized,
    )
  );
}

export function isWorkspaceQuestion(question: string) {
  const normalized = question.toLowerCase();
  return /\b(cv|cvs|resume|resumes|candidate|candidates|profile|profiles|recruit|recruiter|hire|hiring|shortlist|compare|match|skill|skills|experience|seniority|role|roles|backend|frontend|full[\s-]?stack|devops|graphql|react|node|engineer|engineers)\b/
    .test(
      normalized,
    );
}

export function normalizeMessages(value: unknown): ChatMessage[] {
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

export function normalizeTenantIds(value: unknown): string[] {
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

export function buildFallbackAnswer(
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
