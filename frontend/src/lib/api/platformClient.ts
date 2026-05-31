import { supabase } from "@/lib/supabaseClient";
import type { JsonRecord } from "@/lib/api/json";

export async function invokeFunction<T>(name: string, body: JsonRecord): Promise<T> {
  if (!supabase) {
    throw new Error("Missing Supabase browser client configuration.");
  }

  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    const response = typeof error === "object" && error !== null && "context" in error ? (error as { context?: Response }).context : null;
    if (response instanceof Response) {
      try {
        const payload = await response.clone().json() as JsonRecord;
        const detail = String(payload.details ?? payload.error ?? payload.message ?? response.statusText).trim();
        throw new Error(detail || `Function ${name} failed with status ${response.status}.`);
      } catch {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Function ${name} failed with status ${response.status}.`);
      }
    }
    if (error instanceof Error && error.name === "FunctionsFetchError") {
      throw new Error("Supabase Edge Functions are unreachable. Start or redeploy the local functions runtime, then try again.");
    }
    throw error;
  }

  return data as T;
}

export async function invokePlatform<T>(action: string, body: JsonRecord = {}): Promise<T> {
  return invokeFunction<T>("platform", { action, ...body });
}
