import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import {
  compareParamsSchema,
  MAXIMUM_COMPARED_CANDIDATES,
  type CompareParams,
} from '@/features/compare/types'
import { commaSeparatedValues } from '@/lib/url/commaSeparatedValues'

function commaSeparated(limit: number) {
  return z.string().transform((value) => commaSeparatedValues(value).slice(0, limit))
}

/**
 * The comparison is fully described by the URL: which candidates are being
 * compared (`?ids=`) and which skills the recruiter requires of them
 * (`?skills=`), so a comparison survives a refresh and can be shared.
 */
export const compareUrlStateSchema = z
  .object({
    ids: commaSeparated(MAXIMUM_COMPARED_CANDIDATES).catch([]),
    skills: commaSeparated(20).catch([]),
  })
  .transform((value) =>
    compareParamsSchema.parse({ candidateIds: value.ids, requiredSkills: value.skills }),
  )

export function writeCompareParams(params: CompareParams): URLSearchParams {
  const next = new URLSearchParams()
  if (params.candidateIds.length) next.set('ids', params.candidateIds.join(','))
  if (params.requiredSkills.length) next.set('skills', params.requiredSkills.join(','))
  return next
}

export function useCompareParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = useMemo(
    () =>
      compareUrlStateSchema.parse({
        ids: searchParams.get('ids') ?? '',
        skills: searchParams.get('skills') ?? '',
      }),
    [searchParams],
  )

  const updateParams = useCallback(
    (patch: Partial<CompareParams>) => {
      setSearchParams(writeCompareParams(compareParamsSchema.parse({ ...params, ...patch })))
    },
    [params, setSearchParams],
  )

  return { params, updateParams }
}
