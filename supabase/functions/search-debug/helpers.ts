import { createAuthedClient } from "../_shared/client.ts";
import { hasExcludedCompanyMatch } from "../_shared/searchIntent.ts";
import { SEARCH_REST_PAGE_SIZE } from "../_shared/searchScoring.ts";

export async function fetchExcludedCandidateIds(
  supabase: ReturnType<typeof createAuthedClient>,
  excludedCompanyTerms: string[],
) {
  const candidateIds = new Set<string>();
  for (let offset = 0;; offset += SEARCH_REST_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("candidate_search_cache")
      .select("candidate_id, companies")
      .range(offset, offset + SEARCH_REST_PAGE_SIZE - 1);
    if (error) {
      throw error;
    }

    const page = data ?? [];
    for (const row of page) {
      if (
        hasExcludedCompanyMatch(
          row.companies as string[] | null,
          excludedCompanyTerms,
        )
      ) {
        candidateIds.add(String(row.candidate_id));
      }
    }
    if (page.length < SEARCH_REST_PAGE_SIZE) {
      break;
    }
  }
  return candidateIds;
}
