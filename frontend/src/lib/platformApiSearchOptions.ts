import type { SearchFilterOptions } from "@/lib/contracts";
import { dedupeSorted } from "@/lib/platformApiUtils";
import { formatSeniorityValue, SEARCH_SKILL_TABLE } from "@/lib/searchTaxonomy";

export function createFallbackSearchFilterOptions(): SearchFilterOptions {
  const fallbackSeniorityValues = ["junior", "mid", "senior", "staff-plus"];

  return {
    seniority: fallbackSeniorityValues.map((value) => ({
      value,
      label: formatSeniorityValue(value) || value,
    })),
    skills: dedupeSorted(SEARCH_SKILL_TABLE.map((entry) => String(entry.value))),
    companies: [],
    locations: [],
  };
}
