import type { PropsWithChildren } from 'react'
import { AuthContext, type AuthContextValue } from '@/lib/auth/authContextStore'

interface TestAuthProviderProps extends PropsWithChildren {
  value: AuthContextValue
}

/** Injects a given `AuthContextValue` directly — see `createTestAuthContextValue`. */
export function TestAuthProvider({ value, children }: TestAuthProviderProps) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
