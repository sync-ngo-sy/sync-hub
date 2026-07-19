import { createElement, type PropsWithChildren } from 'react'
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { TestAuthProvider } from '@/test/TestAuthProvider'
import { createTestAuthContextValue } from '@/test/createTestAuthContextValue'
import { useTenantScope } from '@/lib/auth/useTenantScope'
import type { AuthContextValue } from '@/lib/auth/authContextStore'
import type { TenantMembership } from '@/lib/auth/api/authContext'

const tenantA: TenantMembership = {
  id: 'tenant-a',
  slug: 'acme',
  name: 'Acme',
  iconUrl: null,
  role: 'recruiter',
  status: 'active',
}

const tenantB: TenantMembership = {
  id: 'tenant-b',
  slug: 'globex',
  name: 'Globex',
  iconUrl: null,
  role: 'platform-admin',
  status: 'active',
}

function renderTenantScope(authValue: AuthContextValue) {
  function wrapper({ children }: PropsWithChildren) {
    return createElement(TestAuthProvider, { value: authValue }, children)
  }
  return renderHook(() => useTenantScope(), { wrapper })
}

describe('useTenantScope', () => {
  it('scopes to the current tenant for a non-admin user', () => {
    const authValue = createTestAuthContextValue({ memberships: [tenantA], currentTenant: tenantA })
    const { result } = renderTenantScope(authValue)

    expect(result.current.resolvedTenantIds).toEqual(['tenant-a'])
    expect(result.current.scopeKey).toBe('tenant:tenant-a')
    expect(result.current.isAllScope).toBe(false)
    expect(result.current.workspaceOptions).toEqual([])
  })

  it('returns no resolved tenants and a "none" scope key when nothing is selected', () => {
    const authValue = createTestAuthContextValue({ memberships: [], currentTenant: null })
    const { result } = renderTenantScope(authValue)

    expect(result.current.resolvedTenantIds).toEqual([])
    expect(result.current.scopeKey).toBe('none')
  })

  it('defaults an admin to "current" scope, scoped to their current tenant, with all memberships as workspace options', () => {
    const authValue = createTestAuthContextValue({
      isAdmin: true,
      memberships: [tenantA, tenantB],
      currentTenant: tenantA,
    })
    const { result } = renderTenantScope(authValue)

    expect(result.current.scopeMode).toBe('current')
    expect(result.current.resolvedTenantIds).toEqual(['tenant-a'])
    expect(result.current.workspaceOptions).toEqual([tenantA, tenantB])
  })

  it('switches an admin to "all" scope, resolving every membership id with a sorted scope key', () => {
    const authValue = createTestAuthContextValue({
      isAdmin: true,
      memberships: [tenantB, tenantA],
      currentTenant: tenantA,
    })
    const { result } = renderTenantScope(authValue)

    act(() => {
      result.current.setScopeMode('all')
    })

    expect(result.current.isAllScope).toBe(true)
    expect(result.current.resolvedTenantIds.slice().sort()).toEqual(['tenant-a', 'tenant-b'])
    expect(result.current.scopeKey).toBe('all:tenant-a,tenant-b')
  })

  it('ignores an attempt to switch to "all" scope for a non-admin user', () => {
    const authValue = createTestAuthContextValue({ isAdmin: false, memberships: [tenantA], currentTenant: tenantA })
    const { result } = renderTenantScope(authValue)

    act(() => {
      result.current.setScopeMode('all')
    })

    expect(result.current.scopeMode).toBe('current')
    expect(result.current.isAllScope).toBe(false)
  })

  it('produces a different scopeKey for a different current tenant, proving prefixed query keys will refetch', () => {
    const resultForTenantA = renderTenantScope(
      createTestAuthContextValue({ memberships: [tenantA, tenantB], currentTenant: tenantA }),
    ).result
    const resultForTenantB = renderTenantScope(
      createTestAuthContextValue({ memberships: [tenantA, tenantB], currentTenant: tenantB }),
    ).result

    expect(resultForTenantA.current.scopeKey).toBe('tenant:tenant-a')
    expect(resultForTenantB.current.scopeKey).toBe('tenant:tenant-b')
    expect(resultForTenantA.current.scopeKey).not.toBe(resultForTenantB.current.scopeKey)
  })
})
