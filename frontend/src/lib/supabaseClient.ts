import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Browser auth client only. Do not use for PostgREST, RPC, or Storage —
 * all application data must flow through Edge Functions (see platformClient).
 */
export const supabaseAuth = hasSupabaseConfig
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      global: {
        headers: {
          "X-Client-Info": "cv-intelligence-frontend",
        },
      },
    })
  : null;

/** @deprecated Use supabaseAuth for session management only. */
export const supabase = supabaseAuth;
