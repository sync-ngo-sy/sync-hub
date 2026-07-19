import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { TenantMembership } from '@/lib/auth/api/authContext'

export interface AuthContextValue {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  memberships: TenantMembership[]
  isAdmin: boolean
  currentTenant: TenantMembership | null
  authError: string | null
  passwordRecovery: boolean
  signIn: (email: string, password: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
  selectTenant: (tenantId: string) => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
