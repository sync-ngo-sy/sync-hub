import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AuthContextValue } from '@/lib/auth/authContextStore'
import { createTestAuthContextValue } from '@/test/createTestAuthContextValue'
import { TestAuthProvider } from '@/test/TestAuthProvider'

interface RenderWithProvidersOptions {
  route?: string
  path?: string
  auth?: Partial<AuthContextValue>
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path, auth }: RenderWithProvidersOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const content = path ? (
    <Routes>
      <Route path={path} element={ui} />
    </Routes>
  ) : (
    ui
  )

  return render(
    <QueryClientProvider client={queryClient}>
      <TestAuthProvider value={createTestAuthContextValue(auth)}>
        <MemoryRouter initialEntries={[route]}>{content}</MemoryRouter>
      </TestAuthProvider>
    </QueryClientProvider>,
  )
}
