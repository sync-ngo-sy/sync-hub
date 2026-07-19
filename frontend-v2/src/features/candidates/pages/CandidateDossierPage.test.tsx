import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { CandidateDossierPage } from '@/features/candidates/pages/CandidateDossierPage'
import { renderWithProviders } from '@/test/RenderWithProviders'
import { candidateDossierResponseFixture } from '@/test/fixtures/candidates'
import { server } from '@/test/msw/server'

const platformUrl = 'https://test.supabase.co/functions/v1/platform'
const candidateDetailRequestSchema = z
  .object({
    action: z.literal('candidate_detail'),
    candidate_id: z.string().min(1),
    tenant_ids: z.array(z.string()),
  })
  .strict()
const originalDocumentRequestSchema = z
  .object({
    action: z.literal('original_document_url'),
    candidate_id: z.string().min(1),
    tenant_ids: z.array(z.string()),
  })
  .strict()
const dossierActionRequestSchema = z.discriminatedUnion('action', [
  candidateDetailRequestSchema,
  originalDocumentRequestSchema,
])
const tenant = {
  id: 'tenant-1',
  slug: 'acme',
  name: 'Acme Recruiting',
  iconUrl: null,
  role: 'recruiter' as const,
  status: 'active' as const,
}
const auth = { memberships: [tenant], currentTenant: tenant }

describe('candidate dossier page', () => {
  it('loads the grounded profile and exposes timeline, skills, and evidence', async () => {
    server.use(
      http.post(platformUrl, async ({ request }) => {
        expect(candidateDetailRequestSchema.parse(await request.json()).tenant_ids).toEqual([
          tenant.id,
        ])
        return HttpResponse.json(candidateDossierResponseFixture)
      }),
    )

    renderWithProviders(<CandidateDossierPage />, {
      route: '/dossier/22222222-2222-4222-8222-222222222222',
      path: '/dossier/:candidateId',
      auth,
    })

    expect(await screen.findByRole('heading', { name: 'Maya Hassan' })).toBeInTheDocument()
    expect(screen.getByText('Senior Platform Engineer')).toBeInTheDocument()
    expect(screen.getByText(/Maya builds reliable platforms/)).toBeInTheDocument()
    expect(screen.getByText('Cairo University')).toBeInTheDocument()
    expect(screen.getByText('Developer Platform')).toBeInTheDocument()
    expect(screen.getByText('USD 5,500')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/maya-hassan',
    )

    const overviewTab = screen.getByRole('tab', { name: 'Overview' })
    overviewTab.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveFocus()

    await userEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    expect(screen.getByText('Acme Cloud')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }))
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Evidence' }))
    expect(screen.getByText(/reliability roadmap for six product teams/)).toBeInTheDocument()
  })

  it('shows a clear not-found state for an absent candidate', async () => {
    server.use(
      http.post(platformUrl, () =>
        HttpResponse.json({ error: 'not_found', details: 'Candidate not found.' }, { status: 404 }),
      ),
    )

    renderWithProviders(<CandidateDossierPage />, {
      route: '/dossier/missing-candidate',
      path: '/dossier/:candidateId',
      auth,
    })

    expect(await screen.findByRole('heading', { name: 'Candidate not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to candidates' })).toHaveAttribute(
      'href',
      '/candidates',
    )
  })

  it('opens a placeholder window before requesting the signed CV URL', async () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const target = frame.contentWindow
    if (!target) throw new Error('Test iframe did not create a window.')
    const open = vi.spyOn(window, 'open').mockReturnValue(target)
    server.use(
      http.post(platformUrl, async ({ request }) => {
        const body = dossierActionRequestSchema.parse(await request.json())
        if (body.action === 'candidate_detail') {
          return HttpResponse.json(candidateDossierResponseFixture)
        }
        return HttpResponse.json({
          url: 'about:blank#signed-cv',
          source: 'gcs_signed_url',
          expires_at: '2026-07-20T12:15:00.000Z',
          original_filename: 'maya.pdf',
        })
      }),
    )

    renderWithProviders(<CandidateDossierPage />, {
      route: '/dossier/22222222-2222-4222-8222-222222222222',
      path: '/dossier/:candidateId',
      auth,
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Open CV' }))
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    await waitFor(() => expect(target.location.href).toBe('about:blank#signed-cv'))
    open.mockRestore()
    frame.remove()
  })
})
