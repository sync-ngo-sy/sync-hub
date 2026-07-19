import { describe, expect, it } from 'vitest'
import { parseAuthContext } from '@/lib/auth/api/authContext'

describe('parseAuthContext', () => {
  it('parses a real single-tenant membership response into canonical shape', () => {
    const fixture = {
      memberships: [
        {
          id: 'tenant-1',
          slug: 'acme',
          name: 'Acme Recruiting',
          iconUrl: null,
          role: 'recruiter',
          status: 'active',
        },
      ],
      is_platform_admin: false,
    }

    expect(parseAuthContext(fixture)).toEqual({
      memberships: [
        {
          id: 'tenant-1',
          slug: 'acme',
          name: 'Acme Recruiting',
          iconUrl: null,
          role: 'recruiter',
          status: 'active',
        },
      ],
      isPlatformAdmin: false,
    })
  })

  it('parses a platform-admin response with a synthesized platform-admin role and an icon url', () => {
    const fixture = {
      memberships: [
        {
          id: 'tenant-1',
          slug: 'acme',
          name: 'Acme Recruiting',
          iconUrl: 'https://example.com/icon.png',
          role: 'platform-admin',
          status: 'active',
        },
      ],
      is_platform_admin: true,
    }

    const result = parseAuthContext(fixture)
    expect(result.isPlatformAdmin).toBe(true)
    expect(result.memberships[0]?.role).toBe('platform-admin')
    expect(result.memberships[0]?.iconUrl).toBe('https://example.com/icon.png')
  })

  it('parses the no-access response (no memberships, not a platform admin)', () => {
    const fixture = { memberships: [], is_platform_admin: false }

    expect(parseAuthContext(fixture)).toEqual({ memberships: [], isPlatformAdmin: false })
  })

  it('rejects a response missing the required is_platform_admin field', () => {
    const fixture = { memberships: [] }

    expect(() => parseAuthContext(fixture)).toThrow()
  })

  it('rejects a membership missing a required field', () => {
    const fixture = {
      memberships: [{ id: 'tenant-1', slug: 'acme', name: 'Acme Recruiting', iconUrl: null, status: 'active' }],
      is_platform_admin: false,
    }

    expect(() => parseAuthContext(fixture)).toThrow()
  })

  it('rejects an unrecognized role value instead of silently accepting it', () => {
    const fixture = {
      memberships: [
        {
          id: 'tenant-1',
          slug: 'acme',
          name: 'Acme Recruiting',
          iconUrl: null,
          role: 'superuser',
          status: 'active',
        },
      ],
      is_platform_admin: false,
    }

    expect(() => parseAuthContext(fixture)).toThrow()
  })

  it('rejects an unrecognized status value instead of silently accepting it', () => {
    const fixture = {
      memberships: [
        { id: 'tenant-1', slug: 'acme', name: 'Acme Recruiting', iconUrl: null, role: 'owner', status: 'pending' },
      ],
      is_platform_admin: false,
    }

    expect(() => parseAuthContext(fixture)).toThrow()
  })

  it('rejects null for a non-nullable required field (id)', () => {
    const fixture = {
      memberships: [{ id: null, slug: 'acme', name: 'Acme Recruiting', iconUrl: null, role: 'owner', status: 'active' }],
      is_platform_admin: false,
    }

    expect(() => parseAuthContext(fixture)).toThrow()
  })

  it('accepts null for the nullable iconUrl field', () => {
    const fixture = {
      memberships: [
        { id: 'tenant-1', slug: 'acme', name: 'Acme Recruiting', iconUrl: null, role: 'owner', status: 'active' },
      ],
      is_platform_admin: false,
    }

    expect(() => parseAuthContext(fixture)).not.toThrow()
  })
})
