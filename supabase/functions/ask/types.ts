export type SupportedIntent =
  | "why_matched"
  | "strengths"
  | "gaps"
  | "compare"
  | "experience"
  | "skills";

export type AskSynthesis = {
  answer: string;
  facts: Array<{
    candidate_id: string;
    candidate_name: string;
    fact: string;
  }>;
  cited_chunk_ids: string[];
};

export type SearchHitRow = {
  candidate_id: string;
};
