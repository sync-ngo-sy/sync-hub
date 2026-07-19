import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAuthPreferences,
  readAuthPreferences,
  saveAuthPreferences,
} from '@/lib/auth/authPreferences'

describe('auth preferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('uses safe defaults for missing, malformed, or outdated storage', () => {
    expect(readAuthPreferences()).toEqual({ selectedTenantId: null, scopeMode: 'current' })

    window.localStorage.setItem('frontend-v2.auth.preferences', '{bad json')
    expect(readAuthPreferences()).toEqual({ selectedTenantId: null, scopeMode: 'current' })

    window.localStorage.setItem(
      'frontend-v2.auth.preferences',
      JSON.stringify({ version: 0, selectedTenantId: 'tenant-a', scopeMode: 'all' }),
    )
    expect(readAuthPreferences()).toEqual({ selectedTenantId: null, scopeMode: 'current' })
  })

  it('round-trips the exact versioned auth preference shape and clears it', () => {
    saveAuthPreferences({ selectedTenantId: 'tenant-a', scopeMode: 'all' })
    expect(readAuthPreferences()).toEqual({ selectedTenantId: 'tenant-a', scopeMode: 'all' })

    clearAuthPreferences()
    expect(readAuthPreferences()).toEqual({ selectedTenantId: null, scopeMode: 'current' })
  })
})
