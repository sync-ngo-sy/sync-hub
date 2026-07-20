import { useQuery } from '@tanstack/react-query'
import { fetchComparison } from '@/features/compare/api/compareApi'
import { MINIMUM_COMPARED_CANDIDATES, type CompareParams } from '@/features/compare/types'
import { useTenantScope } from '@/lib/auth/useTenantScope'

export function hasComparableSelection(params: CompareParams): boolean {
  return params.candidateIds.length >= MINIMUM_COMPARED_CANDIDATES
}

export function useComparisonQuery(params: CompareParams) {
  const scope = useTenantScope()
  return useQuery({
    queryKey: [
      scope.scopeKey,
      'comparison',
      { candidateIds: params.candidateIds, requiredSkills: params.requiredSkills },
    ],
    queryFn: () => fetchComparison(params),
    enabled: hasComparableSelection(params),
  })
}
