import type { PropsWithChildren } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { z } from 'zod'
import { queryClient } from '@/lib/queryClient'
import { getSupabaseClient, hasSupabaseConfig } from '@/lib/supabaseClient'
import { useAuthContextQuery } from '@/lib/auth/api/useAuthContextQuery'
import { AuthContext, type AuthContextValue } from '@/lib/auth/authContextStore'
import {
  clearVersionedLocalStorage,
  readVersionedLocalStorage,
  writeVersionedLocalStorage,
} from '@/lib/auth/versionedLocalStorage'

const SELECTED_TENANT_STORAGE_KEY = 'frontend-v2.auth.selected-tenant-id'
const SELECTED_TENANT_STORAGE_VERSION = 1
const selectedTenantIdSchema = z.string().min(1)

function readStoredTenantId(): string | null {
  return readVersionedLocalStorage(SELECTED_TENANT_STORAGE_KEY, SELECTED_TENANT_STORAGE_VERSION, selectedTenantIdSchema)
}

function storeTenantId(tenantId: string | null): void {
  if (tenantId) {
    writeVersionedLocalStorage(SELECTED_TENANT_STORAGE_KEY, SELECTED_TENANT_STORAGE_VERSION, tenantId)
  } else {
    clearVersionedLocalStorage(SELECTED_TENANT_STORAGE_KEY)
  }
}

function resolvePasswordResetRedirect(): string {
  return `${window.location.origin}${window.location.pathname}`
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionResolved, setSessionResolved] = useState(!hasSupabaseConfig)
  const [authError, setAuthError] = useState<string | null>(null)
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(() => readStoredTenantId())

  const user = session?.user ?? null
  const userId = user?.id ?? null

  const authContextQuery = useAuthContextQuery(userId)

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return
    }

    const supabase = getSupabaseClient()
    let active = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) {
        return
      }
      if (error) {
        setAuthError(error.message)
      }
      setSession(data.session)
      setSessionResolved(true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) {
        return
      }

      if (event === 'SIGNED_OUT') {
        queryClient.clear()
        setSelectedTenantId(null)
        storeTenantId(null)
        setPasswordRecovery(false)
      }

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }

      setAuthError(null)
      setSession(nextSession)
      setSessionResolved(true)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const queryData = authContextQuery.data
  const memberships = useMemo(() => queryData?.memberships ?? [], [queryData])
  const isAdmin = queryData?.isPlatformAdmin ?? false

  const currentTenant = useMemo(() => {
    if (memberships.length === 0) {
      return null
    }
    return memberships.find((membership) => membership.id === selectedTenantId) ?? memberships[0] ?? null
  }, [memberships, selectedTenantId])

  useEffect(() => {
    storeTenantId(currentTenant?.id ?? null)
  }, [currentTenant])

  const selectTenant = useCallback((tenantId: string) => {
    setSelectedTenantId(tenantId)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      throw error
    }
    setPasswordRecovery(false)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: resolvePasswordResetRedirect(),
    })
    if (error) {
      throw error
    }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabaseClient().auth.updateUser({ password })
    if (error) {
      throw error
    }
    setPasswordRecovery(false)
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseClient().auth.signOut()
    if (error) {
      throw error
    }
  }, [])

  const loading = !sessionResolved || (session !== null && authContextQuery.isPending)

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: hasSupabaseConfig,
      loading,
      session,
      user,
      memberships,
      isAdmin,
      currentTenant,
      authError,
      passwordRecovery,
      signIn,
      requestPasswordReset,
      updatePassword,
      signOut,
      selectTenant,
    }),
    [
      loading,
      session,
      user,
      memberships,
      isAdmin,
      currentTenant,
      authError,
      passwordRecovery,
      signIn,
      requestPasswordReset,
      updatePassword,
      signOut,
      selectTenant,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
