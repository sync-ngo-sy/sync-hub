import { describe, expect, it } from 'vitest'
import {
  compareUrlStateSchema,
  writeCompareParams,
} from '@/features/compare/hooks/useCompareParams'

function read(search: string) {
  const params = new URLSearchParams(search)
  return compareUrlStateSchema.parse({
    ids: params.get('ids') ?? '',
    skills: params.get('skills') ?? '',
  })
}

describe('compare url state', () => {
  it('reads the compared set and required skills from the query string', () => {
    expect(read('?ids=alpha,beta&skills=Go,Kubernetes')).toEqual({
      candidateIds: ['alpha', 'beta'],
      requiredSkills: ['Go', 'Kubernetes'],
    })
  })

  it('drops blanks and duplicates so a shared link always compares a real set', () => {
    expect(read('?ids=alpha,,alpha,%20beta%20&skills=Go,go,,Go')).toEqual({
      candidateIds: ['alpha', 'beta'],
      requiredSkills: ['Go', 'go'],
    })
  })

  it('caps the compared set at the supported maximum', () => {
    const ids = Array.from({ length: 12 }, (_, index) => `candidate-${index}`)

    expect(read(`?ids=${ids.join(',')}`).candidateIds).toHaveLength(8)
  })

  it('falls back to an empty selection when the query string is absent', () => {
    expect(read('')).toEqual({ candidateIds: [], requiredSkills: [] })
  })

  it('writes only the parameters that carry a value', () => {
    expect(
      writeCompareParams({ candidateIds: ['alpha', 'beta'], requiredSkills: [] }).toString(),
    ).toBe('ids=alpha%2Cbeta')
  })

  it('writes required skills alongside the compared set', () => {
    expect(
      writeCompareParams({ candidateIds: ['alpha'], requiredSkills: ['Go', 'Kubernetes'] }).get(
        'skills',
      ),
    ).toBe('Go,Kubernetes')
  })
})
