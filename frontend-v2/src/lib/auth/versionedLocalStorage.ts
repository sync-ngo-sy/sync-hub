import type { z } from 'zod'
import { isRecord } from '@/lib/isRecord'

/**
 * Reads a `{ version, value }` envelope from `localStorage` and validates
 * `value` against `schema`. Returns `null` on anything untrustworthy —
 * missing key, unparsable JSON, a version mismatch (the shape changed since
 * this was written), or a `value` that fails validation. Never partially
 * trusts raw `localStorage` content, per ticket 05.
 */
export function readVersionedLocalStorage<T>(key: string, version: number, schema: z.ZodType<T>): T | null {
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return null
  }

  let envelope: unknown
  try {
    envelope = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(envelope) || envelope.version !== version) {
    return null
  }

  const result = schema.safeParse(envelope.value)
  return result.success ? result.data : null
}

export function writeVersionedLocalStorage<T>(key: string, version: number, value: T): void {
  window.localStorage.setItem(key, JSON.stringify({ version, value }))
}

export function clearVersionedLocalStorage(key: string): void {
  window.localStorage.removeItem(key)
}
