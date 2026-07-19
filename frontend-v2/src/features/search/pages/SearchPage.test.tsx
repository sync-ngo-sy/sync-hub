import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { SearchPage } from '@/features/search/pages/SearchPage'
import { renderWithProviders } from '@/test/RenderWithProviders'
import { searchFilterOptionsFixture, searchResponseFixture } from '@/test/fixtures/search'
import { server } from '@/test/msw/server'

const searchUrl = 'https://test.supabase.co/functions/v1/search'
const platformUrl = 'https://test.supabase.co/functions/v1/platform'
const searchRequestSchema = z
  .object({
    q: z.string(),
    tenant_ids: z.array(z.string()),
    filters: z
      .object({
        skills: z.array(z.string()),
        location: z.string().nullable(),
        seniority: z.string().nullable(),
        companies: z.array(z.string()),
      })
      .strict(),
    limit: z.union([z.literal(20), z.literal(50)]),
    offset: z.number().int().nonnegative(),
    semantic: z.literal(true),
  })
  .strict()
const filterOptionsRequestSchema = z
  .object({
    action: z.literal('search_filter_options'),
    tenant_ids: z.array(z.string()),
  })
  .strict()

const tenant = {
  id: 'tenant-1',
  slug: 'acme',
  name: 'Acme Recruiting',
  iconUrl: null,
  role: 'recruiter' as const,
  status: 'active' as const,
}
const auth = { memberships: [tenant], currentTenant: tenant }

function LocationProbe() {
  return <output aria-label="Current query string">{useLocation().search}</output>
}

function installFilterOptionsHandler() {
  server.use(
    http.post(platformUrl, async ({ request }) => {
      filterOptionsRequestSchema.parse(await request.json())
      return HttpResponse.json(searchFilterOptionsFixture)
    }),
  )
}

describe('search page', () => {
  it('loads results and sends every URL-backed filter through the real adapter', async () => {
    let requestBody: z.infer<typeof searchRequestSchema> | undefined
    installFilterOptionsHandler()
    server.use(
      http.post(searchUrl, async ({ request }) => {
        requestBody = searchRequestSchema.parse(await request.json())
        return HttpResponse.json(searchResponseFixture)
      }),
    )

    renderWithProviders(<SearchPage />, {
      route:
        '/search?q=platform&skills=Kubernetes&location=Cairo%2C+Egypt&seniority=senior&company=Acme+Cloud',
      auth,
    })

    expect(await screen.findByRole('button', { name: 'Maya Hassan' })).toBeInTheDocument()
    expect(screen.getByText('1 candidate on this page')).toBeInTheDocument()
    expect(requestBody).toMatchObject({
      q: 'platform',
      tenant_ids: ['tenant-1'],
      filters: {
        skills: ['Kubernetes'],
        location: 'Cairo, Egypt',
        seniority: 'senior',
        companies: ['Acme Cloud'],
      },
    })
  })

  it('sorts the table and records the choice in the URL', async () => {
    installFilterOptionsHandler()
    server.use(
      http.post(searchUrl, () =>
        HttpResponse.json({
          ...searchResponseFixture,
          results: [
            searchResponseFixture.results[0],
            {
              ...searchResponseFixture.results[0],
              candidate_id: '33333333-3333-4333-8333-333333333333',
              name: 'Aaron Saleh',
              match_rate: 70,
            },
          ],
          next_cursor: null,
          meta: { ...searchResponseFixture.meta, count: 2 },
        }),
      ),
    )

    renderWithProviders(
      <>
        <SearchPage />
        <LocationProbe />
      </>,
      { route: '/search?q=engineer', auth },
    )

    await screen.findByRole('button', { name: 'Maya Hassan' })
    await userEvent.click(screen.getByRole('button', { name: 'Candidate' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Current query string')).toHaveTextContent(
        'sort=name&direction=asc',
      ),
    )
    expect(
      screen
        .getAllByRole('button', { name: /^(Aaron Saleh|Maya Hassan)$/ })
        .map((button) => button.textContent),
    ).toEqual(['Aaron Saleh', 'Maya Hassan'])
  })

  it('reflects an applied filter in the shareable URL', async () => {
    installFilterOptionsHandler()
    server.use(http.post(searchUrl, () => HttpResponse.json(searchResponseFixture)))

    renderWithProviders(
      <>
        <SearchPage />
        <LocationProbe />
      </>,
      { route: '/search?q=platform', auth },
    )

    await screen.findByRole('button', { name: 'Maya Hassan' })
    await userEvent.click(screen.getByRole('combobox', { name: 'Location' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Cairo, Egypt' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Current query string')).toHaveTextContent(
        'location=Cairo%2C+Egypt',
      ),
    )
  })

  it('shows the empty state for a successful search with no matches', async () => {
    installFilterOptionsHandler()
    server.use(
      http.post(searchUrl, () =>
        HttpResponse.json({
          ...searchResponseFixture,
          results: [],
          next_cursor: null,
          meta: { ...searchResponseFixture.meta, count: 0 },
        }),
      ),
    )

    renderWithProviders(<SearchPage />, { route: '/search?q=unfindable', auth })

    expect(await screen.findByText('No candidates match your search')).toBeInTheDocument()
  })

  it('shows a friendly malformed-data error and retries', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let attempts = 0
    installFilterOptionsHandler()
    server.use(
      http.post(searchUrl, () => {
        attempts += 1
        return HttpResponse.json(attempts === 1 ? { results: [] } : searchResponseFixture)
      }),
    )

    renderWithProviders(<SearchPage />, { route: '/search?q=platform', auth })

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Maya Hassan' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})
