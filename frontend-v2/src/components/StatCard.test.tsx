import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrendingUp } from 'lucide-react'
import { StatCard } from '@/components/StatCard'

describe('StatCard', () => {
  it('renders the label, value, delta, and icon when not loading', () => {
    render(
      <StatCard
        label="Pending Manatal"
        value="128"
        delta="queued candidates"
        icon={<TrendingUp data-testid="stat-icon" />}
      />,
    )

    expect(screen.getByText('Pending Manatal')).toBeInTheDocument()
    expect(screen.getByText('128')).toBeInTheDocument()
    expect(screen.getByText('queued candidates')).toBeInTheDocument()
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument()
  })

  it('omits the delta when none is given', () => {
    render(<StatCard label="Total candidates" value="4,201" />)

    expect(screen.getByText('4,201')).toBeInTheDocument()
    expect(screen.queryByText('queued candidates')).not.toBeInTheDocument()
  })

  it('renders skeleton placeholders instead of content while loading', () => {
    render(<StatCard label="Pending Manatal" value="128" delta="queued candidates" loading />)

    expect(screen.queryByText('Pending Manatal')).not.toBeInTheDocument()
    expect(screen.queryByText('128')).not.toBeInTheDocument()
    expect(screen.queryByText('queued candidates')).not.toBeInTheDocument()
  })

  it('gives the icon accent a distinct tone per the tone prop', () => {
    const { rerender } = render(
      <StatCard
        label="Synced Manatal"
        value="4,201"
        tone="secondary"
        icon={<TrendingUp data-testid="stat-icon" />}
      />,
    )
    expect(screen.getByTestId('stat-icon').parentElement).toHaveClass('bg-muted')

    rerender(
      <StatCard
        label="Synced Manatal"
        value="4,201"
        tone="tertiary"
        icon={<TrendingUp data-testid="stat-icon" />}
      />,
    )
    expect(screen.getByTestId('stat-icon').parentElement).toHaveClass('bg-success/10')
  })
})
