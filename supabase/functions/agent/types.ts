export type SearchHitRow = {
  candidate_id: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
