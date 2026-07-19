import type { JsonRecord } from "@/lib/api/json";
import { hasSupabaseConfig, supabaseAuth } from "@/lib/supabaseClient";

function functionsBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL.");
  }

  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1`;
}

function publishableKey() {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY.");
  }
  return key;
}

async function resolveFunctionAuthHeaders(requireSession = false) {
  const apikey = publishableKey();
  const session = supabaseAuth
    ? (await supabaseAuth.auth.getSession()).data.session
    : null;
  const accessToken = session?.access_token ?? null;

  if (requireSession && !accessToken) {
    throw new Error("Authentication is required.");
  }

  return {
    apikey,
    Authorization: `Bearer ${accessToken ?? apikey}`,
  };
}

export async function invokeFunction<T>(
  name: string,
  body: JsonRecord,
  options: { requireSession?: boolean } = { requireSession: true },
): Promise<T> {
  if (!hasSupabaseConfig) {
    throw new Error("Missing Supabase browser client configuration.");
  }

  const headers = await resolveFunctionAuthHeaders(options.requireSession ?? false);
  const response = await fetch(`${functionsBaseUrl()}/${name}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    try {
      const payload = (await response.clone().json()) as JsonRecord;
      const detail = String(
        payload.details ?? payload.error ?? payload.message ?? response.statusText,
      ).trim();
      throw new Error(detail || `Function ${name} failed with status ${response.status}.`);
    } catch (error) {
      if (error instanceof Error && error.message && !error.message.startsWith("Function ")) {
        throw error;
      }
      const text = await response.text().catch(() => "");
      throw new Error(text || `Function ${name} failed with status ${response.status}.`);
    }
  }

  return (await response.json()) as T;
}

export async function invokePlatform<T>(
  action: string,
  body: JsonRecord = {},
): Promise<T> {
  return invokeFunction<T>("platform", { action, ...body }, { requireSession: true });
}
