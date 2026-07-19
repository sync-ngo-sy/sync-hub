import type { PropsWithChildren } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { queryClient } from '@/lib/queryClient'
import { getSupabaseClient, hasSupabaseConfig } from '@/lib/supabaseClient'
import { useAuthContextQuery } from '@/lib/auth/api/useAuthContextQuery'
import { AuthContext, type AuthContextValue } from '@/lib/auth/authContextStore'
import {
  clearAuthPreferences,
  readAuthPreferences,
  saveAuthPreferences,
  type ScopeMode,
} from '@/lib/auth/authPreferences'

function resolvePasswordResetRedirect(): string {
  return `${window.location.origin}${window.location.pathname}`
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [storedPreferences] = useState(readAuthPreferences)
  const [session, setSession] = useState<Session | null>(null)
  const [sessionResolved, setSessionResolved] = useState(!hasSupabaseConfig)
  const [sessionError, setSessionError] = useState<Error | null>(null)
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(
    storedPreferences.selectedTenantId,
  )
  const [scopeMode, setScopeMode] = useState<ScopeMode>(storedPreferences.scopeMode)

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
        setSessionError(error)
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
        setScopeMode('current')
        clearAuthPreferences()
        setPasswordRecovery(false)
      }

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }

      setSessionError(null)
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
  const isPlatformAdmin = queryData?.isPlatformAdmin ?? false
  const authError = sessionError ?? authContextQuery.error

  const currentTenant = useMemo(() => {
    if (memberships.length === 0) {
      return null
    }
    return (
      memberships.find((membership) => membership.id === selectedTenantId) ?? memberships[0] ?? null
    )
  }, [memberships, selectedTenantId])

  useEffect(() => {
    if (session === null || !authContextQuery.isSuccess) {
      return
    }
    saveAuthPreferences({ selectedTenantId: currentTenant?.id ?? null, scopeMode })
  }, [authContextQuery.isSuccess, currentTenant, scopeMode, session])

  const selectTenant = useCallback((tenantId: string) => {
    setSelectedTenantId(tenantId)
  }, [])

  const selectScopeMode = useCallback(
    (nextScopeMode: ScopeMode) => {
      setScopeMode(isPlatformAdmin ? nextScopeMode : 'current')
    },
    [isPlatformAdmin],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    })
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
      isPlatformAdmin,
      currentTenant,
      scopeMode,
      authError,
      passwordRecovery,
      signIn,
      requestPasswordReset,
      updatePassword,
      signOut,
      selectTenant,
      selectScopeMode,
    }),
    [
      loading,
      session,
      user,
      memberships,
      isPlatformAdmin,
      currentTenant,
      scopeMode,
      authError,
      passwordRecovery,
      signIn,
      requestPasswordReset,
      updatePassword,
      signOut,
      selectTenant,
      selectScopeMode,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
