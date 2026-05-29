import type { JsonRecord } from "@/lib/platformApiTypes";

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function toStringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => String(item).trim())
    .filter(Boolean);
}

export function toNumber(value: unknown, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

export function tenantCacheKey(tenantIds?: string[]) {
  return (tenantIds ?? []).slice().sort().join("|") || "all";
}

export function hueFromId(seed: string) {
  return seed.split("").reduce((memo, character) => memo + character.charCodeAt(0), 0) % 360;
}

export function dedupeSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function percent(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

export function isBrowserOpenableSource(sourceUri?: string | null) {
  return Boolean(sourceUri && /^(https?:)?\/\//i.test(sourceUri));
}
