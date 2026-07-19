import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorFallback } from '@/lib/errors/ErrorFallback'

describe('ErrorFallback', () => {
  it('shows friendly blocking-error copy and retries', async () => {
    const resetErrorBoundary = vi.fn()
    render(
      <ErrorFallback
        error={new Error('raw database exception')}
        resetErrorBoundary={resetErrorBoundary}
      />,
    )

    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('raw database exception')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(resetErrorBoundary).toHaveBeenCalledOnce()
  })
})
