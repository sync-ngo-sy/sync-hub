import { describe, expect, it } from 'vitest'
import { searchUrlStateSchema } from '@/features/search/hooks/useSearchParams'

describe('search URL state', () => {
  it('parses shareable filters, sort, and pagination', () => {
    expect(
      searchUrlStateSchema.parse({
        q: 'platform engineer',
        skills: 'Kubernetes,TypeScript',
        location: 'Cairo, Egypt',
        seniority: 'senior',
        company: 'Acme Cloud',
        sort: 'yearsExperience',
        direction: 'asc',
        page: '3',
        pageSize: '50',
      }),
    ).toEqual({
      query: 'platform engineer',
      skills: ['Kubernetes', 'TypeScript'],
      location: 'Cairo, Egypt',
      seniority: 'senior',
      company: 'Acme Cloud',
      sort: 'yearsExperience',
      direction: 'asc',
      page: 3,
      pageSize: 50,
    })
  })

  it('falls back safely when URL state is malformed', () => {
    expect(
      searchUrlStateSchema.parse({
        q: 'q'.repeat(301),
        skills: '',
        location: 'l'.repeat(181),
        seniority: 's'.repeat(81),
        company: 'c'.repeat(181),
        sort: 'unknown',
        direction: 'sideways',
        page: '2garbage',
        pageSize: '20x',
      }),
    ).toMatchObject({
      sort: 'matchRate',
      direction: 'desc',
      query: '',
      location: '',
      seniority: '',
      company: '',
      page: 1,
      pageSize: 20,
    })
  })
})
