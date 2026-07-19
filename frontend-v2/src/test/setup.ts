import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from '@/test/msw/server'

// jsdom doesn't implement ResizeObserver — cmdk (shadcn's Command
// primitive, used by Combobox) needs one to measure its list. The methods
// are intentionally no-ops: this test environment never actually resizes.
/* eslint-disable @typescript-eslint/no-empty-function */
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
/* eslint-enable @typescript-eslint/no-empty-function */

globalThis.ResizeObserver ??= NoopResizeObserver

window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})

// jsdom doesn't implement scrollIntoView either — cmdk calls it to keep
// the highlighted item visible. No-op is correct: there's no real
// viewport to scroll in this test environment.
// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/unbound-method
Element.prototype.scrollIntoView ??= function scrollIntoViewNoop(this: void) {}

// The one network seam (`@/test/msw/server`): every test that touches
// `@/lib/api/client` gets its Edge Function responses from here.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => {
  server.resetHandlers()
  window.localStorage.clear()
})
afterAll(() => {
  server.close()
})
