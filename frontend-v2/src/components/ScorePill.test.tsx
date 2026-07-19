import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScorePill } from '@/components/ScorePill'

describe('ScorePill', () => {
  it('rounds a fractional score to the nearest whole percent', () => {
    render(<ScorePill score={82.6} />)

    expect(screen.getByText('83%')).toBeInTheDocument()
  })

  it('defaults the caption to "Match"', () => {
    render(<ScorePill score={90} />)

    expect(screen.getByText('Match')).toBeInTheDocument()
  })

  it('renders a custom label when given one', () => {
    render(<ScorePill score={90} label="Corpus parse" />)

    expect(screen.getByText('Corpus parse')).toBeInTheDocument()
    expect(screen.queryByText('Match')).not.toBeInTheDocument()
  })

  it('omits the caption entirely when label is an empty string', () => {
    render(<ScorePill score={90} label="" />)

    expect(screen.queryByText('Match')).not.toBeInTheDocument()
  })
})
