import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="Candidates" />)

    expect(screen.getByRole('heading', { name: 'Candidates' })).toBeInTheDocument()
  })

  it('omits the eyebrow, description, and actions when none are given', () => {
    render(<PageHeader title="Candidates" />)

    expect(screen.queryByText(/./, { selector: 'p' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the eyebrow, description, and actions when given', () => {
    render(
      <PageHeader
        eyebrow="Recruiter tools"
        title="Candidates"
        description="Every candidate in your workspace."
        actions={<Button>Export</Button>}
      />,
    )

    expect(screen.getByText('Recruiter tools')).toBeInTheDocument()
    expect(screen.getByText('Every candidate in your workspace.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })
})
