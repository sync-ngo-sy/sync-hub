import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

describe('getUserErrorMessage', () => {
  it('maps expected HTTP failures to purpose-written copy', () => {
    expect(getUserErrorMessage(new ApiError('database table details', 403))).toBe(
      'You do not have permission to do that.',
    )
    expect(getUserErrorMessage(new ApiError('private backend text', 404))).toBe(
      'We could not find what you requested.',
    )
  })

  it('logs an unexpected error without exposing its text', () => {
    const logger = vi.fn()

    expect(getUserErrorMessage(new Error('postgres secret'), logger)).toBe(
      'Something went wrong. Please try again.',
    )
    expect(logger).toHaveBeenCalledWith('Unexpected application error', expect.any(Error))
  })
})
