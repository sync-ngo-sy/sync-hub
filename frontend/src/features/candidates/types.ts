import type { CandidateListItem } from "@/lib/contracts";

export type CandidateListGroupSection = {
  key: string;
  label: string;
  count: number;
  items: CandidateListItem[];
};
