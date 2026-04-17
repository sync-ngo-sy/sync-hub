import { corsHeaders } from "./cors.ts";

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function errorResponse(status: number, message: string, details?: unknown): Response {
  return jsonResponse(
    {
      error: {
        message,
        details: details ?? null,
      },
    },
    { status },
  );
}

export function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  return request.json() as Promise<Record<string, unknown>>;
}

export function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeStringArray(value: unknown): string[] | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : null;
}

export function normalizeEmbedding(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const numbers = value.map((item) => {
    if (typeof item === "number" && Number.isFinite(item)) {
      return item;
    }
    if (typeof item === "string" && item.trim().length > 0) {
      const parsed = Number(item);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  });

  if (numbers.some((item) => item === null)) {
    return null;
  }

  return `[${numbers.join(",")}]`;
}
