import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ComparePage } from '@/features/compare/pages/ComparePage'
import { renderWithProviders } from '@/test/RenderWithProviders'
import { comparisonCachedFixture, comparisonFreshFixture } from '@/test/fixtures/compare'
import { shortlistItemFixture } from '@/test/fixtures/shortlist'
import { server } from '@/test/msw/server'

const compareUrl = 'https://test.supabase.co/functions/v1/compare'
const platformUrl = 'https://test.supabase.co/functions/v1/platform'
const compareRequestSchema = z
  .object({
    candidate_ids: z.array(z.string()),
    required_skills: z.array(z.string()),
  })
  .strict()

const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'acme',
  name: 'Acme Recruiting',
  iconUrl: null,
  role: 'recruiter' as const,
  status: 'active' as const,
}
const auth = { memberships: [tenant], currentTenant: tenant }
const selectedRoute = `/compare?ids=${comparisonFreshFixture.items[0]?.candidate_id},${comparisonFreshFixture.items[1]?.candidate_id}`

function LocationProbe() {
  return <output aria-label="Current query string">{useLocation().search}</output>
}

function installShortlistHandler(items: unknown[] = []) {
  server.use(http.post(platformUrl, () => HttpResponse.json(items)))
}

describe('compare page', () => {
  it('compares the candidate set carried in the URL and renders the grounded result', async () => {
    let requestBody: z.infer<typeof compareRequestSchema> | undefined
    installShortlistHandler()
    server.use(
      http.post(compareUrl, async ({ request }) => {
        requestBody = compareRequestSchema.parse(await request.json())
        return HttpResponse.json(comparisonFreshFixture)
      }),
    )

    renderWithProviders(<ComparePage />, { route: `${selectedRoute}&skills=Terraform`, auth })

    const compared = await screen.findByRole('region', { name: 'Compared candidates' })
    expect(within(compared).getByText('Maya Hassan')).toBeInTheDocument()
    expect(within(compared).getByText('Omar Farid')).toBeInTheDocument()
    expect(within(compared).getByText('Terraform')).toBeInTheDocument()
    expect(screen.getByText('Recommended candidate')).toBeInTheDocument()
    expect(requestBody).toEqual({
      candidate_ids: [
        comparisonFreshFixture.items[0]?.candidate_id,
        comparisonFreshFixture.items[1]?.candidate_id,
      ],
      required_skills: ['Terraform'],
    })
  })

  it('guides the recruiter instead of calling the backend when too few are selected', async () => {
    let compareCalls = 0
    installShortlistHandler()
    server.use(
      http.post(compareUrl, () => {
        compareCalls += 1
        return HttpResponse.json(comparisonFreshFixture)
      }),
    )

    renderWithProviders(<ComparePage />, {
      route: `/compare?ids=${comparisonFreshFixture.items[0]?.candidate_id}`,
      auth,
    })

    expect(await screen.findByText('Compare candidates side by side')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Compared candidates' })).not.toBeInTheDocument()
    expect(compareCalls).toBe(0)
  })

  it('builds the compared set from the shortlist and carries it in the URL', async () => {
    const user = userEvent.setup()
    installShortlistHandler([
      shortlistItemFixture,
      {
        ...shortlistItemFixture,
        candidate_id: '33333333-3333-4333-8333-333333333333',
        candidate_name: 'Omar Farid',
      },
    ])
    server.use(http.post(compareUrl, () => HttpResponse.json(comparisonFreshFixture)))

    renderWithProviders(
      <>
        <ComparePage />
        <LocationProbe />
      </>,
      { route: '/compare', auth },
    )

    await user.click(await screen.findByRole('button', { name: /Choose candidates/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('checkbox', { name: /Maya Hassan/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Omar Farid/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Compare selected' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Current query string')).toHaveTextContent(
        '?ids=22222222-2222-4222-8222-222222222222%2C33333333-3333-4333-8333-333333333333',
      )
    })
  })

  it('labels a cached artifact and explains its missing dossier detail', async () => {
    installShortlistHandler()
    server.use(http.post(compareUrl, () => HttpResponse.json(comparisonCachedFixture)))

    renderWithProviders(<ComparePage />, { route: selectedRoute, auth })

    expect(await screen.findByText('Cached result')).toBeInTheDocument()
    expect(screen.getAllByText(/served from a cached artifact/)).toHaveLength(2)
  })

  it('shows a mapped error with a retry action when the comparison payload is malformed', async () => {
    installShortlistHandler()
    server.use(http.post(compareUrl, () => HttpResponse.json({ source: 'deterministic_fallback' })))

    renderWithProviders(<ComparePage />, { route: selectedRoute, auth })

    expect(await screen.findByText('Unable to compare these candidates')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Compared candidates' })).not.toBeInTheDocument()
  })
})
