import { http, HttpResponse } from 'msw'
import { isRecord } from '@/lib/isRecord'

const FUNCTIONS_BASE_URL = 'https://test.supabase.co/functions/v1'

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
 * Base handler set for the `platform` aggregator Edge Function, composed
 * per-action. Feature test suites add their own action branches here (or
 * override a single action per-test with `server.use(...)`) rather than
 * standing up a separate handler file per feature — there is one endpoint,
 * so one place routes by `action`.
 */
export const handlers = [
  http.post(`${FUNCTIONS_BASE_URL}/platform`, async ({ request }) => {
    const body: unknown = await request.json()
    const action = isRecord(body) ? body.action : null

    if (action === 'auth_context') {
      return HttpResponse.json(defaultAuthContextResponse)
    }

    return HttpResponse.json({ error: 'unknown_action', details: String(action) }, { status: 400 })
  }),
]
