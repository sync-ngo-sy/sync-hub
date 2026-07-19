import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

let client: SupabaseClient | null = null
if (supabaseUrl && supabaseAnonKey) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
    global: {
      headers: {
        'X-Client-Info': 'frontend-v2',
      },
    },
  })
}

/**
 * True once `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are both present.
 * The one place this is meant to gate anything is the app shell's
 * "app is not configured" screen (ticket 06) — feature code should never
 * branch on it directly.
 */
export const hasSupabaseConfig = client !== null

/**
 * The single Supabase client: browser auth (session, sign-in/out, token
 * refresh) and Edge Function invocation only. Never call `.from(...)`,
 * `.storage`, or any other direct-database surface on it — all application
 * data flows through Edge Functions (`@/lib/api/client`).
 *
 * Throws if config is missing; callers only reach this after the app-shell
 * config gate has already confirmed `hasSupabaseConfig`, so this is an
 * invariant, not a recoverable branch.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    throw new Error('Supabase is not configured: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.')
  }
  return client
}
