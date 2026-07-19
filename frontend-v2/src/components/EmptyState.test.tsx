import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'

describe('EmptyState', () => {
  it('renders the title and detail', () => {
    render(<EmptyState title="No candidates yet" detail="Try widening your search filters." />)

    expect(screen.getByText('No candidates yet')).toBeInTheDocument()
    expect(screen.getByText('Try widening your search filters.')).toBeInTheDocument()
  })

  it('omits the action slot when none is given', () => {
    render(<EmptyState title="No candidates yet" detail="Try widening your search filters." />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the action when given one', () => {
    render(
      <EmptyState
        title="No public jobs"
        detail="There are no open roles right now."
        action={<Button>Refresh</Button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })
})
