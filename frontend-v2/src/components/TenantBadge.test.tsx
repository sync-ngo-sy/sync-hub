import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TenantBadge } from '@/components/TenantBadge'

// Radix's Avatar Image probes load status via a real `Image` instance and
// addEventListener('load' | 'error', ...), which jsdom never resolves (no
// network stack) — stub it so a valid iconUrl resolves to "loaded" instead
// of hanging in "loading" forever.
class ImmediatelyLoadingImage extends EventTarget {
  complete = false
  naturalWidth = 0
  private currentSrc = ''

  get src() {
    return this.currentSrc
  }

  set src(value: string) {
    this.currentSrc = value
    this.complete = true
    this.naturalWidth = 1
    queueMicrotask(() => this.dispatchEvent(new Event('load')))
  }
}

beforeEach(() => {
  vi.stubGlobal('Image', ImmediatelyLoadingImage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TenantBadge', () => {
  it('renders the fallback building icon when no iconUrl is given', () => {
    render(<TenantBadge name="Acme Corp" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders an image with descriptive alt text when iconUrl is given', async () => {
    render(<TenantBadge name="Acme Corp" iconUrl="https://example.com/acme.png" />)

    const image = await screen.findByRole('img', { name: 'Acme Corp logo' })
    expect(image).toHaveAttribute('src', 'https://example.com/acme.png')
  })

  it('falls back to the building icon when iconUrl is null', () => {
    render(<TenantBadge name="Acme Corp" iconUrl={null} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders smaller at size="sm"', () => {
    const { container: sm } = render(<TenantBadge name="Acme Corp" size="sm" />)
    const { container: md } = render(<TenantBadge name="Acme Corp" size="md" />)

    expect(sm.querySelector('[data-slot="avatar"]')).toHaveAttribute('data-size', 'sm')
    expect(md.querySelector('[data-slot="avatar"]')).toHaveAttribute('data-size', 'lg')
  })
})
