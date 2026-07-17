export type DossierRow = {
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

export type EvidenceRow = {
  candidate_id: string;
  chunk_id: string;
  chunk_type: string;
  section_name: string;
  text: string;
  lexical_score: number;
  semantic_similarity: number;
};

export function evidenceSignal(row: EvidenceRow) {
  return Math.max(
    Number(row.semantic_similarity) || 0,
    Number(row.lexical_score) || 0,
  );
}

export function limitEvidenceRows(rows: EvidenceRow[], limit: number) {
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
