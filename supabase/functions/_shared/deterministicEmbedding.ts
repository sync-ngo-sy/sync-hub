const EMBEDDING_DIMENSION = 768;

export const DETERMINISTIC_EMBEDDING_VERSION = "deterministic-fnv1a-768-v2";

function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(value);

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

export function buildDeterministicQueryEmbedding(query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);

  for (const token of normalized.split(/\s+/).filter(Boolean)) {
    const digest = fnv1a32(token);
    const index = digest % EMBEDDING_DIMENSION;
    const sign = ((digest >>> 1) & 1) === 0 ? 1 : -1;
    const weight = 1 / Math.max(1, token.length);
    vector[index] += sign * weight;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(8)));
}
