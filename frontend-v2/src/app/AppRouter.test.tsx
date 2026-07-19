import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createTestAuthContextValue } from '@/test/createTestAuthContextValue'
import { createTestSession, createTestUser } from '@/test/createTestSession'
import { TestAuthProvider } from '@/test/TestAuthProvider'
import type { TenantMembership } from '@/lib/auth/api/authContext'
import { createAppRoutes } from '@/app/AppRouter'

const membership: TenantMembership = {
  id: 'tenant-1',
  slug: 'acme',
  name: 'Acme Recruiting',
  iconUrl: null,
  role: 'recruiter',
  status: 'active',
}

function renderRoute(path: string, overrides = {}) {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: [path] })
  const auth = createTestAuthContextValue(overrides)

  render(
    <TestAuthProvider value={auth}>
      <RouterProvider router={router} />
    </TestAuthProvider>,
  )

  return router
}

describe('app routes', () => {
  it('keeps careers public', async () => {
    renderRoute('/careers')

    expect(await screen.findByRole('heading', { name: 'Careers' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Workspace' })).not.toBeInTheDocument()
  })

  it('redirects an unauthenticated recruiter route to sign in', async () => {
    const router = renderRoute('/candidates')

    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
  })

  it('renders authenticated routes inside the app shell with route metadata', async () => {
    renderRoute('/candidates', {
      session: createTestSession(),
      user: createTestUser(),
      memberships: [membership],
      currentTenant: membership,
    })

    expect(await screen.findByRole('heading', { name: 'Candidates' })).toBeInTheDocument()
    expect(screen.getByText('Browse, filter, and group your talent pool')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
  })

  it('blocks a non-admin who enters an admin URL directly', async () => {
    renderRoute('/admin/accounts', {
      session: createTestSession(),
      user: createTestUser(),
      memberships: [membership],
      currentTenant: membership,
    })

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
  })

  it('shows access pending for a signed-in user without a membership', async () => {
    renderRoute('/candidates', {
      session: createTestSession(),
      user: createTestUser(),
    })

    expect(
      await screen.findByRole('heading', { name: 'Your account is not active yet.' }),
    ).toBeInTheDocument()
  })

  it('shows a configuration screen when development config is missing', async () => {
    renderRoute('/candidates', { configured: false })

    expect(await screen.findByRole('heading', { name: 'App not configured' })).toBeInTheDocument()
  })
})
