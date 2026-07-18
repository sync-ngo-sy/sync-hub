export type JsonRecord = Record<string, unknown>;

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.map((item) => typeof item === "string" ? item.trim() : "").filter(
        Boolean,
      ),
    ),
  );
}

export function uniqueStrings(
  values: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    const normalized = typeof v === "string" ? v.trim() : "";
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function dedupeSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

export function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export function envText(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value && value.length > 0 ? value : null;
}

export function isLocalRuntime(): boolean {
  const supabaseUrl = envText("SUPABASE_URL") ?? "";
  return supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
}

export function envNumber(name: string, fallback: number): number {
  const value = envText(name);
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// alias for backward compat with platform/index.ts
export const asInteger = clampInteger;

export function isMissingRpcError(error: unknown): boolean {
  const record = asRecord(error);
  const code = String(record.code ?? "");
  const message = describeError(error).toLowerCase();
  return code === "PGRST202" ||
    message.includes("could not find the function") ||
    message.includes("schema cache");
}

export function isBrowserOpenableSource(sourceUri: string | null): boolean {
  return Boolean(sourceUri && /^(https?:)?\/\//i.test(sourceUri));
}

export function parseIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(Deno.env.get(name));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
