import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseClient(request: Request): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  const authorization = request.headers.get("Authorization") ?? "";

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function ensureAuthenticated(request: Request): void {
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    throw new Error("Missing Authorization header");
  }
}

export function isRpcAuthError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybe = error as { code?: string; message?: string };
  return maybe.code === "42501" || maybe.message === "tenant access denied";
}
