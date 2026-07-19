import { setupServer } from 'msw/node'
import { handlers } from '@/test/msw/handlers'

/**
 * The one network seam: every feature integration test renders through
 * React Testing Library exactly as it would in the browser, with backend
 * responses supplied here instead of a mocked hook or client function. Auth
 * is deliberately not part of this seam (it's a stateful client MSW can't
 * cleanly intercept) — tests inject a fake session via a test auth provider
 * instead.
 */
export const server = setupServer(...handlers)
