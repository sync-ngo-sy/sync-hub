import { describe, expect, it } from 'vitest'
import { toCsv } from '@/features/search/csv'

describe('search CSV export', () => {
  it('quotes commas, quotes, and newlines without losing values', () => {
    expect(
      toCsv([
        {
          name: 'Hassan, Maya',
          currentTitle: 'Senior "Platform" Engineer',
          location: 'Cairo\nEgypt',
          yearsExperience: 9,
          seniority: 'senior',
          primaryRole: 'platform-engineering',
          matchRate: 92,
          topSkills: ['Kubernetes', 'TypeScript'],
        },
      ]),
    ).toBe(
      'Name,Title,Location,Years Experience,Seniority,Primary Role,Match Rate,Top Skills\r\n"Hassan, Maya","Senior ""Platform"" Engineer","Cairo\nEgypt",9,senior,platform-engineering,92%,"Kubernetes, TypeScript"',
    )
  })

  it('neutralizes spreadsheet formulas in candidate-controlled cells', () => {
    expect(
      toCsv([
        {
          name: '=HYPERLINK("https://example.test")',
          currentTitle: '+cmd',
          location: '@remote',
          yearsExperience: 9,
          seniority: '-senior',
          primaryRole: 'platform-engineering',
          matchRate: 92,
          topSkills: ['Kubernetes'],
        },
      ]),
    ).toContain('"\'=HYPERLINK(""https://example.test"")",\'+cmd,\'@remote,9,\'-senior')
  })
})
