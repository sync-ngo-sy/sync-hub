import { http, HttpResponse } from 'msw'
import { z } from 'zod'

const FUNCTIONS_BASE_URL = 'https://test.supabase.co/functions/v1'
const platformRequestSchema = z.object({ action: z.string() })

/**
 * Default `auth_context` response used by every test unless a test
 * overrides it with `server.use(...)` — one active membership, not a
 * platform admin. Shape matches `getAuthContext` in
 * `supabase/functions/_shared/auth.ts`.
 */
export const defaultAuthContextResponse = {
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

/**
 * Base handler set for the `platform` aggregator Edge Function. Future
 * feature handlers live in their feature test modules and are composed into
 * this exported array; this file does not become a central action switch.
 */
export const handlers = [
  http.post(`${FUNCTIONS_BASE_URL}/platform`, async ({ request }) => {
    const body: unknown = await request.json()
    const result = platformRequestSchema.safeParse(body)
    const action = result.success ? result.data.action : null

    if (action === 'auth_context') {
      return HttpResponse.json(defaultAuthContextResponse)
    }

    return HttpResponse.json({ error: 'unknown_action', details: String(action) }, { status: 400 })
  }),
]
