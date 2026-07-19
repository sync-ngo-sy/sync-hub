import { useMemo } from 'react'
import { useAuth } from '@/lib/auth/authContextStore'
export type { ScopeMode } from '@/lib/auth/authPreferences'

/**
 * Resolves which tenant(s) the current view is scoped to (a single company,
 * or an admin's "all companies" view), and a stable `scopeKey` string.
 * Every feature's React Query key must start with `[domain, scopeKey,
 * ...params]` — switching company or scope changes the key, so React Query
 * refetches automatically instead of relying on a manual cache clear.
 */
export function useTenantScope() {
  const {
    isPlatformAdmin,
    currentTenant,
    memberships,
    scopeMode: storedScopeMode,
    selectScopeMode,
  } = useAuth()

  const scopeMode = isPlatformAdmin ? storedScopeMode : 'current'
  const isAllScope = isPlatformAdmin && scopeMode === 'all'
  const tenantOptions = useMemo(
    () => (isPlatformAdmin ? memberships : []),
    [isPlatformAdmin, memberships],
  )

  const resolvedTenantIds = useMemo(() => {
    if (isAllScope) {
      return tenantOptions.map((membership) => membership.id)
    }
    return currentTenant ? [currentTenant.id] : []
  }, [isAllScope, tenantOptions, currentTenant])

  const scopeKey = useMemo(() => {
    if (isAllScope) {
      return `all:${[...resolvedTenantIds].sort().join(',')}`
    }
    return currentTenant ? `tenant:${currentTenant.id}` : 'none'
  }, [isAllScope, resolvedTenantIds, currentTenant])

  return {
    scopeMode,
    setScopeMode: selectScopeMode,
    isAllScope,
    tenantOptions,
    currentTenant,
    resolvedTenantIds,
    scopeKey,
  }
}
