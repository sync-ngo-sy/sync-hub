import { useCallback, useMemo, useState } from 'react'
import { z } from 'zod'
import { useAuth } from '@/lib/auth/authContextStore'
import { readVersionedLocalStorage, writeVersionedLocalStorage } from '@/lib/auth/versionedLocalStorage'

const SCOPE_MODE_STORAGE_KEY = 'frontend-v2.auth.scope-mode'
const SCOPE_MODE_STORAGE_VERSION = 1
const scopeModeSchema = z.enum(['current', 'all'])

export type ScopeMode = z.infer<typeof scopeModeSchema>

function readStoredScopeMode(): ScopeMode {
  return readVersionedLocalStorage(SCOPE_MODE_STORAGE_KEY, SCOPE_MODE_STORAGE_VERSION, scopeModeSchema) ?? 'current'
}

/**
 * Resolves which tenant(s) the current view is scoped to (a single company,
 * or an admin's "all companies" view), and a stable `scopeKey` string.
 * Every feature's React Query key must start with `[domain, scopeKey,
 * ...params]` — switching company or scope changes the key, so React Query
 * refetches automatically instead of relying on a manual cache clear.
 */
export function useTenantScope() {
  const { isAdmin, currentTenant, memberships } = useAuth()
  const [scopeModeState, setScopeModeState] = useState<ScopeMode>(() => readStoredScopeMode())

  const scopeMode: ScopeMode = isAdmin ? scopeModeState : 'current'
  const isAllScope = isAdmin && scopeMode === 'all'
  const workspaceOptions = useMemo(() => (isAdmin ? memberships : []), [isAdmin, memberships])

  const resolvedTenantIds = useMemo(() => {
    if (isAllScope) {
      return workspaceOptions.map((membership) => membership.id)
    }
    return currentTenant ? [currentTenant.id] : []
  }, [isAllScope, workspaceOptions, currentTenant])

  const scopeKey = useMemo(() => {
    if (isAllScope) {
      return `all:${[...resolvedTenantIds].sort().join(',')}`
    }
    return currentTenant ? `tenant:${currentTenant.id}` : 'none'
  }, [isAllScope, resolvedTenantIds, currentTenant])

  const setScopeMode = useCallback(
    (mode: ScopeMode) => {
      const nextMode = isAdmin ? mode : 'current'
      setScopeModeState(nextMode)
      writeVersionedLocalStorage(SCOPE_MODE_STORAGE_KEY, SCOPE_MODE_STORAGE_VERSION, nextMode)
    },
    [isAdmin],
  )

  return {
    scopeMode,
    setScopeMode,
    isAllScope,
    workspaceOptions,
    currentTenant,
    resolvedTenantIds,
    scopeKey,
  }
}
