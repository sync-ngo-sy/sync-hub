import type { AuthContextValue } from '@/lib/auth/authContextStore'

/**
 * A fully-formed fake `AuthContextValue`, overridable per test. Pairs with
 * `TestAuthProvider` — the "one honest exception to only-the-network-is-
 * mocked": auth is a stateful client MSW can't cleanly intercept, so tests
 * inject a fake session/memberships directly at the provider instead.
 */
export function createTestAuthContextValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    configured: true,
    loading: false,
    session: null,
    user: null,
    memberships: [],
    isAdmin: false,
    currentTenant: null,
    authError: null,
    passwordRecovery: false,
    signIn: () => Promise.resolve(),
    requestPasswordReset: () => Promise.resolve(),
    updatePassword: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    selectTenant: () => undefined,
    ...overrides,
  }
}
