import type { Session, User } from '@supabase/supabase-js'

export function createTestUser(): User {
  return {
    id: 'user-1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-07-20T00:00:00.000Z',
    email: 'recruiter@example.com',
  }
}

export function createTestSession(): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: createTestUser(),
  }
}
