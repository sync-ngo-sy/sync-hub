import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTestAuthContextValue } from '@/test/createTestAuthContextValue'
import { TestAuthProvider } from '@/test/TestAuthProvider'
import App from './App'

describe('App', () => {
  it('mounts the clean-URL application router', async () => {
    window.history.replaceState(null, '', '/sign-in')
    render(
      <TestAuthProvider value={createTestAuthContextValue()}>
        <App />
      </TestAuthProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument()
  })
})
