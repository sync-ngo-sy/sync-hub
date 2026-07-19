import { describe, expect, it } from 'vitest'
import {
  encodeSearchRequest,
  parseSearchFilterOptions,
  parseSearchResponse,
} from '@/features/search/api/searchApi'
import { searchFilterOptionsFixture, searchResponseFixture } from '@/test/fixtures/search'

describe('search compatibility adapters', () => {
  it('maps the verified snake_case search response to canonical results', () => {
    expect(parseSearchResponse(searchResponseFixture)).toEqual({
      results: [
        {
          tenantId: 'tenant-1',
          candidateId: '22222222-2222-4222-8222-222222222222',
          name: 'Maya Hassan',
          currentTitle: 'Senior Platform Engineer',
          location: 'Cairo, Egypt',
          yearsExperience: 9,
          seniority: 'senior',
          primaryRole: 'platform-engineering',
          matchRate: 92,
          scoreRaw: 0.83,
          topSkills: ['Kubernetes'],
          matchSignals: { semantic: 0.88, skill: 0.75, experience: 1 },
          summary: 'Built reliable internal platforms for product teams.',
        },
      ],
      nextCursor: 20,
      meta: {
        pageCount: 1,
        rankVersion: 'v2-rate',
        intentSource: 'explicit',
      },
    })
  })

  it('rejects speculative camelCase result fields', () => {
    expect(() =>
      parseSearchResponse({
        ...searchResponseFixture,
        results: [
          {
            ...searchResponseFixture.results[0],
            candidateId: 'speculative-id',
          },
        ],
      }),
    ).toThrow()
  })

  it('parses the verified filter-option action response', () => {
    expect(parseSearchFilterOptions(searchFilterOptionsFixture)).toEqual(searchFilterOptionsFixture)
  })

  it('encodes canonical URL filters into the current Edge request', () => {
    expect(
      encodeSearchRequest(['tenant-1'], {
        query: 'platform engineer',
        skills: ['Kubernetes'],
        location: 'Cairo, Egypt',
        seniority: 'senior',
        company: 'Acme Cloud',
        sort: 'matchRate',
        direction: 'desc',
        page: 2,
        pageSize: 20,
      }),
    ).toEqual({
      q: 'platform engineer',
      tenant_ids: ['tenant-1'],
      filters: {
        skills: ['Kubernetes'],
        location: 'Cairo, Egypt',
        seniority: 'senior',
        companies: ['Acme Cloud'],
      },
      limit: 20,
      offset: 20,
      semantic: true,
    })
  })
})
