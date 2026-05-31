export type JsonRecord = Record<string, unknown>;

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

export function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
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
