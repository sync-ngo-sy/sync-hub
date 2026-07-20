import { describe, expect, it } from 'vitest'
import { encodeCompareRequest, parseComparison } from '@/features/compare/api/compareApi'
import { comparisonCachedFixture, comparisonFreshFixture } from '@/test/fixtures/compare'

describe('compare adapter', () => {
  it('maps the freshly computed wire variant to canonical camelCase data', () => {
    expect(parseComparison(comparisonFreshFixture)).toEqual({
      source: 'deterministic_fallback',
      overlap: ['kubernetes', 'go'],
      recommendedCandidateId: '22222222-2222-4222-8222-222222222222',
      overallSummary: null,
      items: [
        {
          candidateId: '22222222-2222-4222-8222-222222222222',
          score: 10.85,
          matchedSkills: ['Kubernetes', 'Go'],
          gaps: ['Terraform'],
          detail: {
            tenantId: '11111111-1111-4111-8111-111111111111',
            name: 'Maya Hassan',
            currentTitle: 'Senior Platform Engineer',
            yearsExperience: 9,
            seniority: 'senior',
            strengths: ['Ran multi-region platform migrations'],
            risks: ['No recent people-management experience'],
            summary: 'Built reliable internal platforms for product teams.',
          },
        },
        {
          candidateId: '33333333-3333-4333-8333-333333333333',
          score: 7.4,
          matchedSkills: ['Go'],
          gaps: [],
          detail: {
            tenantId: '11111111-1111-4111-8111-111111111111',
            name: 'Omar Farid',
            currentTitle: null,
            yearsExperience: 6,
            seniority: 'mid',
            strengths: [],
            risks: [],
            summary: '',
          },
        },
      ],
    })
  })

  it('maps the cached artifact wire variant, whose items carry no dossier detail', () => {
    expect(parseComparison(comparisonCachedFixture)).toEqual({
      source: 'cached_artifact',
      overlap: ['kubernetes', 'go'],
      recommendedCandidateId: '22222222-2222-4222-8222-222222222222',
      overallSummary:
        'Compared 2 candidates. Shared strengths center on kubernetes, go. Recommended candidate: Maya Hassan.',
      items: [
        {
          candidateId: '22222222-2222-4222-8222-222222222222',
          score: 11.2,
          matchedSkills: ['Kubernetes', 'Go'],
          gaps: ['Terraform'],
          detail: null,
        },
        {
          candidateId: '33333333-3333-4333-8333-333333333333',
          score: 7.4,
          matchedSkills: ['Go'],
          gaps: [],
          detail: null,
        },
      ],
    })
  })

  it('reads an empty recommended id as "no recommendation" rather than an id', () => {
    const raw = {
      ...comparisonCachedFixture,
      comparison: { ...comparisonCachedFixture.comparison, recommended_candidate_id: '' },
    }

    expect(parseComparison(raw).recommendedCandidateId).toBeNull()
  })

  it('rejects a payload whose source conflicts with its body shape', () => {
    const conflicting = { ...comparisonFreshFixture, source: 'cached_artifact' }

    expect(() => parseComparison(conflicting)).toThrow()
  })

  it('rejects a payload carrying both a cached artifact body and fresh top-level items', () => {
    const conflicting = { ...comparisonCachedFixture, items: comparisonFreshFixture.items }

    expect(() => parseComparison(conflicting)).toThrow()
  })

  it('rejects an unknown source', () => {
    expect(() => parseComparison({ ...comparisonFreshFixture, source: 'llm' })).toThrow()
  })

  it('rejects an item missing a required dossier field', () => {
    const malformed = {
      ...comparisonFreshFixture,
      items: [{ ...comparisonFreshFixture.items[0], years_experience: null }],
    }

    expect(() => parseComparison(malformed)).toThrow()
  })

  it('rejects the backend error payload instead of rendering it as an empty comparison', () => {
    expect(() =>
      parseComparison({ error: 'candidate_ids must contain at least two ids' }),
    ).toThrow()
  })

  it('encodes a request with the backend request keys', () => {
    expect(encodeCompareRequest({ candidateIds: ['a', 'b'], requiredSkills: ['Go'] })).toEqual({
      candidate_ids: ['a', 'b'],
      required_skills: ['Go'],
    })
  })
})
