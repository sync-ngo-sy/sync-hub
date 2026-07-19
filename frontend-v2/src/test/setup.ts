import '@testing-library/jest-dom/vitest'

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

// jsdom doesn't implement scrollIntoView either — cmdk calls it to keep
// the highlighted item visible. No-op is correct: there's no real
// viewport to scroll in this test environment.
// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/unbound-method
Element.prototype.scrollIntoView ??= function scrollIntoViewNoop(this: void) {}
