import type { CandidateListGroupBy } from "@/lib/contracts";

export const DEFAULT_PAGE_SIZE = 50;

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export const GROUP_BY_OPTIONS: Array<{ value: CandidateListGroupBy | ""; label: string }> = [
  { value: "", label: "No grouping" },
  { value: "status", label: "Status / stage" },
  { value: "role", label: "Applied role" },
  { value: "source", label: "Source" },
  { value: "location", label: "Location" },
];

export const FILTER_PARAM_KEYS = ["q", "status", "role", "source", "location", "updatedFrom", "updatedTo"] as const;
