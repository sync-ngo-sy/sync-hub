import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientTestProvider } from '@/test/QueryClientTestProvider'
import { useAuthContextQuery } from '@/lib/auth/api/useAuthContextQuery'

describe('useAuthContextQuery', () => {
  it('parses the MSW-served wire response into canonical data — raw wire keys never reach the cache', async () => {
    const { result } = renderHook(() => useAuthContextQuery('user-1'), {
      wrapper: QueryClientTestProvider,
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual({
      memberships: [
        {
          id: 'tenant-1',
          slug: 'acme',
          name: 'Acme Recruiting',
          iconUrl: null,
          role: 'recruiter',
          status: 'active',
        },
      ],
      isPlatformAdmin: false,
    })
    expect(result.current.data).not.toHaveProperty('is_platform_admin')
  })
})
