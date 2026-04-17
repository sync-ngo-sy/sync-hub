import { buildDeterministicQueryEmbedding, DETERMINISTIC_EMBEDDING_VERSION } from "./deterministicEmbedding.ts";

function envText(name: string) {
  const value = Deno.env.get(name)?.trim();
  return value && value.length > 0 ? value : null;
}

function isLocalRuntime() {
  const supabaseUrl = envText("SUPABASE_URL") ?? "";
  return supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
}

export async function buildQueryEmbedding(query: string) {
  const normalized = query.trim();
  if (!normalized) {
    return {
      embedding: null,
      embeddingVersion: DETERMINISTIC_EMBEDDING_VERSION,
      provider: "none",
    };
  }

  const ollamaModel = envText("OLLAMA_EMBEDDING_MODEL") ?? (isLocalRuntime() ? "nomic-embed-text" : null);
  if (!ollamaModel) {
    return {
      embedding: buildDeterministicQueryEmbedding(query),
      embeddingVersion: DETERMINISTIC_EMBEDDING_VERSION,
      provider: "deterministic",
    };
  }

  try {
    const ollamaBaseUrl = envText("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434";
    const response = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/api/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ollamaModel,
        input: normalized,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`ollama_embed_error:${response.status}:${JSON.stringify(payload)}`);
    }

    const embeddings = Array.isArray(payload.embeddings) ? payload.embeddings : [];
    const first = Array.isArray(embeddings[0]) ? embeddings[0] : null;
    if (!first) {
      throw new Error("ollama_embed_error:missing_embedding");
    }

    return {
      embedding: first as number[],
      embeddingVersion: envText("OLLAMA_EMBEDDING_VERSION") ?? ollamaModel,
      provider: "ollama",
    };
  } catch {
    return {
      embedding: buildDeterministicQueryEmbedding(query),
      embeddingVersion: DETERMINISTIC_EMBEDDING_VERSION,
      provider: "deterministic",
    };
  }
}
