import { describe, expect, it } from 'vitest'
import { candidateRoleLabel } from '@/features/search/candidateRoleLabel'

describe('candidateRoleLabel', () => {
  it('prefers the current title', () => {
    expect(candidateRoleLabel({ currentTitle: 'Staff Engineer', primaryRole: 'engineer' })).toBe(
      'Staff Engineer',
    )
  })

  it('falls back to the primary role when there is no title', () => {
    expect(candidateRoleLabel({ currentTitle: '', primaryRole: 'platform engineer' })).toBe(
      'platform engineer',
    )
  })

  it('uses a neutral placeholder when neither is present', () => {
    expect(candidateRoleLabel({ currentTitle: '', primaryRole: null })).toBe('Role not available')
  })
})
