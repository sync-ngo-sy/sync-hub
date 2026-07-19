/** Type-guard only — no coercion, no defaults. Narrows `unknown` JSON to a plain object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
