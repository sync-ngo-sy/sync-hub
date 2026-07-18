import {
  buildDeterministicQueryEmbedding,
  DETERMINISTIC_EMBEDDING_VERSION,
} from "./deterministicEmbedding.ts";
import { getRuntimeSetting } from "./platformRuntimeSettings.ts";
import { envNumber, envText, isLocalRuntime } from "./utils.ts";

function normalizeGeminiModelName(model: string) {
  return model.startsWith("models/") ? model : `models/${model}`;
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

  const geminiApiKey = envText("GEMINI_API_KEY");
  if (geminiApiKey) {
    const geminiModel = (await getRuntimeSetting("gemini_embedding_model")) ??
      envText("GEMINI_EMBEDDING_MODEL") ??
      envText("CV_EMBEDDING_MODEL") ??
      "gemini-embedding-001";
    const outputDimensionality = envNumber(
      "GEMINI_EMBEDDING_DIMENSION",
      envNumber("CV_EMBEDDING_DIMENSION", 768),
    );
    const normalizedModel = normalizeGeminiModelName(geminiModel);
    try {
      const geminiBaseUrl = envText("GEMINI_BASE_URL") ??
        "https://generativelanguage.googleapis.com/v1beta";
      const response = await fetch(
        `${
          geminiBaseUrl.replace(/\/$/, "")
        }/${normalizedModel}:embedContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: normalizedModel,
            content: {
              parts: [{ text: normalized }],
            },
            taskType: "RETRIEVAL_QUERY",
            outputDimensionality,
          }),
        },
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          `gemini_embed_error:${response.status}:${JSON.stringify(payload)}`,
        );
      }

      const values = Array.isArray(payload?.embedding?.values)
        ? payload.embedding.values
        : null;
      if (!values) {
        throw new Error("gemini_embed_error:missing_embedding");
      }

      return {
        embedding: values as number[],
        embeddingVersion: envText("GEMINI_EMBEDDING_VERSION") ??
          envText("CV_EMBEDDING_VERSION") ??
          `${geminiModel}-${outputDimensionality}-v1`,
        provider: "gemini",
      };
    } catch {
      // Fall through to local/deterministic embedding so search still responds.
    }
  }

  const ollamaModel = envText("OLLAMA_EMBEDDING_MODEL") ??
    (isLocalRuntime() ? "nomic-embed-text" : null);
  if (!ollamaModel) {
    return {
      embedding: buildDeterministicQueryEmbedding(query),
      embeddingVersion: DETERMINISTIC_EMBEDDING_VERSION,
      provider: "deterministic",
    };
  }

  try {
    const ollamaBaseUrl = envText("OLLAMA_BASE_URL") ??
      "http://host.docker.internal:11434";
    const response = await fetch(
      `${ollamaBaseUrl.replace(/\/$/, "")}/api/embed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ollamaModel,
          input: normalized,
        }),
      },
    );

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        `ollama_embed_error:${response.status}:${JSON.stringify(payload)}`,
      );
    }

    const embeddings = Array.isArray(payload.embeddings)
      ? payload.embeddings
      : [];
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
