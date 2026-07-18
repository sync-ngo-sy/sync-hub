export function normalizeTextSet(values: string[] | null | undefined) {
  return new Set((values ?? []).map((value) => value.toLowerCase()));
}
