import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CareersListPage } from '@/features/careers/pages/CareersListPage'
import { CareerDetailPage } from '@/features/careers/pages/CareerDetailPage'
import { renderWithProviders } from '@/test/RenderWithProviders'
import { publicJobFixture } from '@/test/fixtures/publicJobs'
import { server } from '@/test/msw/server'

const publicJobsUrl = 'https://test.supabase.co/functions/v1/public-jobs'
const publicJobsRequestSchema = z
  .object({ action: z.enum(['list', 'detail', 'apply']) })
  .passthrough()

describe('public careers pages', () => {
  it('lists verified jobs through MSW and the real query/adapter flow', async () => {
    server.use(http.post(publicJobsUrl, () => HttpResponse.json({ jobs: [publicJobFixture] })))

    renderWithProviders(<CareersListPage />, { route: '/careers' })

    expect(
      await screen.findByRole('heading', { name: 'Senior Platform Engineer' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Cairo, Egypt')).toBeInTheDocument()
  })

  it('shows a friendly list error and retries', async () => {
    let attempts = 0
    server.use(
      http.post(publicJobsUrl, () => {
        attempts += 1
        if (attempts === 1) {
          return HttpResponse.json({ details: 'private database failure' }, { status: 500 })
        }
        return HttpResponse.json({ jobs: [publicJobFixture] })
      }),
    )

    renderWithProviders(<CareersListPage />, { route: '/careers' })

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('private database failure')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { name: 'Senior Platform Engineer' }),
    ).toBeInTheDocument()
  })

  it('loads a job and submits an application through the network boundary', async () => {
    server.use(
      http.post(publicJobsUrl, async ({ request }) => {
        const body: unknown = await request.json()
        const parsedBody = publicJobsRequestSchema.parse(body)
        if (parsedBody.action === 'apply') {
          return HttpResponse.json({
            receipt: {
              accepted: true,
              applicationId: 'application-1',
              submittedAt: '2026-07-20T01:00:00.000Z',
            },
          })
        }
        return HttpResponse.json({ job: publicJobFixture })
      }),
    )

    renderWithProviders(<CareerDetailPage />, {
      route: '/careers/senior-platform-engineer',
      path: '/careers/:slug',
    })

    expect(
      await screen.findByRole('heading', { name: 'Senior Platform Engineer' }),
    ).toBeInTheDocument()
    expect(document.querySelector('title')?.textContent).toBe(
      'Senior Platform Engineer | SYNC Careers',
    )
    expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toContain(
      'JobPosting',
    )
    await userEvent.type(screen.getByLabelText('Name'), 'Mina Nabil')
    await userEvent.type(screen.getByLabelText('Email'), 'mina@example.com')
    await userEvent.type(screen.getByLabelText('Current title'), 'Platform Engineer')
    await userEvent.type(screen.getByLabelText('Years experience'), '6')
    await userEvent.selectOptions(screen.getByLabelText('Seniority'), 'Senior')
    await userEvent.type(screen.getByLabelText('Top skills'), 'TypeScript, PostgreSQL')
    await userEvent.upload(
      screen.getByLabelText('CV upload'),
      new File(['resume'], 'mina.pdf', { type: 'application/pdf' }),
    )
    await userEvent.click(screen.getByLabelText(/I consent to storing my application/i))
    await userEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByRole('heading', { name: 'Application received' })).toBeInTheDocument()
  })
})
