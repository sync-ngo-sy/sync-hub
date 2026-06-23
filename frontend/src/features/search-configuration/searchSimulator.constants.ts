import { BrainCircuit, DatabaseZap, GitCompareArrows, SearchCheck, Sparkles } from "lucide-react";

export const PAGE_SIZE = 12;

export const SIMULATOR_VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "results", label: "Ranked results" },
  { id: "internals", label: "Advanced internals" },
] as const;

export type SearchSimulatorView = (typeof SIMULATOR_VIEWS)[number]["id"];

export const SIMULATOR_STAGES = [
  {
    id: "request",
    label: "Normalize request",
    icon: SearchCheck,
    description: "Normalize explicit filters, scope, and request shape before any retrieval runs.",
  },
  {
    id: "intent",
    label: "Extract intent",
    icon: BrainCircuit,
    description: "Use LLM or rule-based extraction to convert the text query into structured ranking intent.",
  },
  {
    id: "embedding",
    label: "Build embedding",
    icon: Sparkles,
    description: "Generate the query vector that semantic retrieval uses against stored chunk embeddings.",
  },
  {
    id: "retrieve",
    label: "Retrieve candidates",
    icon: DatabaseZap,
    description: "Apply strict filters, run lexical and semantic retrieval, and collect candidate evidence.",
  },
  {
    id: "rank",
    label: "Rank response",
    icon: GitCompareArrows,
    description: "Fuse chunk, name, skill, seniority, and experience signals into the final ordered shortlist.",
  },
] as const;
