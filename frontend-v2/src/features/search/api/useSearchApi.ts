import { useQuery } from '@tanstack/react-query'
import { fetchSearchFilterOptions, fetchSearchResults } from '@/features/search/api/searchApi'
import type { SearchParams } from '@/features/search/types'
import { useTenantScope } from '@/lib/auth/useTenantScope'

export function hasSearchCriteria(params: SearchParams): boolean {
  return Boolean(
    params.query || params.skills.length || params.location || params.seniority || params.company,
  )
}

export function useSearchResultsQuery(params: SearchParams) {
  const scope = useTenantScope()
  const query = useQuery({
    queryKey: [
      scope.scopeKey,
      'search-results',
      {
        query: params.query,
        skills: params.skills,
        location: params.location,
        seniority: params.seniority,
        company: params.company,
        page: params.page,
        pageSize: params.pageSize,
      },
    ],
    queryFn: () => fetchSearchResults(scope.resolvedTenantIds, params),
    enabled: hasSearchCriteria(params),
  })

  return { ...query, scope }
}

export function useSearchFilterOptionsQuery() {
  const scope = useTenantScope()
  return useQuery({
    queryKey: [scope.scopeKey, 'search-filter-options'],
    queryFn: () => fetchSearchFilterOptions(scope.resolvedTenantIds),
    staleTime: 10 * 60 * 1_000,
  })
}
