/**
 * Splits one comma-delimited URL parameter value (e.g. `?skills=React,Go` or
 * `?ids=a,b`) into trimmed, de-duplicated, non-empty entries. Callers apply
 * their own length cap, since the acceptable count differs per parameter.
 */
export function commaSeparatedValues(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  )
}
