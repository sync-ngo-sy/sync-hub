import {
  getRuntimeSetting,
  type RuntimeSettingKey,
} from "./platformRuntimeSettings.ts";
import { envNumber, envText, isLocalRuntime } from "./utils.ts";

type JsonSchema = Record<string, unknown>;

export type LlmProvider = "openai" | "gemini" | "ollama";

export type StructuredGenerationRequest = {
  schemaName: string;
  schema: JsonSchema;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
};

export type StructuredGenerationResult<T> = {
  object: T;
  provider: LlmProvider;
  model: string;
};

export type TextGenerationRequest = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
};

export type TextGenerationResult = {
  text: string;
  provider: LlmProvider;
  model: string;
};

type LlmConfig =
  | {
    provider: "openai";
    apiKey: string;
    model: string;
    baseUrl: string;
    timeoutMs: number;
  }
  | {
    provider: "gemini";
    apiKey: string;
    model: string;
    baseUrl: string;
    timeoutMs: number;
  }
  | {
    provider: "ollama";
    model: string;
    baseUrl: string;
    timeoutMs: number;
  };

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

async function resolveRuntimeOrEnv(key: RuntimeSettingKey, envName: string) {
  return (await getRuntimeSetting(key)) ?? envText(envName);
}

async function resolveGeminiModelId() {
  return await resolveRuntimeOrEnv("gemini_model_id", "GEMINI_MODEL_ID");
}

async function buildGeminiConfig(
  timeoutMs: number,
): Promise<Extract<LlmConfig, { provider: "gemini" }> | null> {
  const apiKey = envText("GEMINI_API_KEY");
  const modelId = await resolveGeminiModelId();
  if (!apiKey || !modelId) {
    return null;
  }

  return {
    provider: "gemini",
    apiKey,
    model: modelId,
    baseUrl: normalizeBaseUrl(
      envText("GEMINI_BASE_URL") ??
        "https://generativelanguage.googleapis.com/v1beta",
    ),
    timeoutMs,
  };
}

async function resolveLlmTimeoutMs() {
  const fromRuntime = await getRuntimeSetting("llm_timeout_ms");
  if (fromRuntime) {
    const parsed = Number(fromRuntime);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return envNumber("LLM_TIMEOUT_MS", 12000);
}

async function resolveLlmConfig(): Promise<LlmConfig | null> {
  const provider =
    (await resolveRuntimeOrEnv("llm_provider", "LLM_PROVIDER")) ?? null;
  const timeoutMs = await resolveLlmTimeoutMs();
  const defaultLocalOllamaModel = isLocalRuntime() ? "qwen3:30b-a3b" : null;
  const geminiConfig = await buildGeminiConfig(timeoutMs);
  const openaiModel =
    (await resolveRuntimeOrEnv("openai_model", "OPENAI_MODEL")) ??
      "gpt-4.1-mini";
  const ollamaModel =
    (await resolveRuntimeOrEnv("ollama_model", "OLLAMA_MODEL")) ??
      defaultLocalOllamaModel;

  if (
    (provider?.toLowerCase() === "openai" || !provider) &&
    envText("OPENAI_API_KEY")
  ) {
    return {
      provider: "openai",
      apiKey: envText("OPENAI_API_KEY") as string,
      model: openaiModel,
      baseUrl: normalizeBaseUrl(
        envText("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
      ),
      timeoutMs,
    };
  }

  if ((provider?.toLowerCase() === "gemini" || !provider) && geminiConfig) {
    return geminiConfig;
  }

  if ((provider?.toLowerCase() === "ollama" || !provider) && ollamaModel) {
    return {
      provider: "ollama",
      model: ollamaModel,
      baseUrl: normalizeBaseUrl(
        envText("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434",
      ),
      timeoutMs,
    };
  }

  return null;
}

export async function isLlmConfigured() {
  return (await resolveLlmConfig()) !== null;
}

function extractOpenAiText(payload: Record<string, unknown>) {
  if (
    typeof payload.output_text === "string" &&
    payload.output_text.trim().length > 0
  ) {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        return text;
      }
    }
  }

  return null;
}

function extractGeminiText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
    : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const content = (candidate as { content?: Record<string, unknown> })
      .content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        return text;
      }
    }
  }

  return null;
}

function extractOllamaText(payload: Record<string, unknown>) {
  const message = payload.message;
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

async function parseResponseBody(response: Response) {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { raw: text };
  }
}

function geminiUrl(baseUrl: string, model: string, apiKey: string) {
  return `${baseUrl}/models/${model}:generateContent?key=${
    encodeURIComponent(apiKey)
  }`;
}

async function callLlmEndpoint(options: {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs: number;
  providerName: string;
  extractText: (payload: Record<string, unknown>) => string | null;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(options.url, {
      method: "POST",
      headers: options.headers,
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });

    const payload = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(
        `${options.providerName}_error:${response.status}:${
          JSON.stringify(payload)
        }`,
      );
    }

    const text = options.extractText(payload)?.trim();
    if (!text) {
      throw new Error(`${options.providerName}_error:missing_output_text`);
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAiText(
  config: Extract<LlmConfig, { provider: "openai" }>,
  request: TextGenerationRequest,
): Promise<TextGenerationResult> {
  const text = await callLlmEndpoint({
    url: `${config.baseUrl}/responses`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: {
      model: config.model,
      instructions: request.systemPrompt,
      input: request.userPrompt,
      temperature: request.temperature ?? 0.2,
    },
    timeoutMs: config.timeoutMs,
    providerName: "openai",
    extractText: extractOpenAiText,
  });

  return { text, provider: "openai", model: config.model };
}

async function callGeminiText(
  config: Extract<LlmConfig, { provider: "gemini" }>,
  request: TextGenerationRequest,
): Promise<TextGenerationResult> {
  const text = await callLlmEndpoint({
    url: geminiUrl(config.baseUrl, config.model, config.apiKey),
    headers: { "Content-Type": "application/json" },
    body: {
      contents: [
        {
          parts: [{ text: `${request.systemPrompt}\n\n${request.userPrompt}` }],
        },
      ],
      generationConfig: { temperature: request.temperature ?? 0.2 },
    },
    timeoutMs: config.timeoutMs,
    providerName: "gemini",
    extractText: extractGeminiText,
  });

  return { text, provider: "gemini", model: config.model };
}

async function callOllamaText(
  config: Extract<LlmConfig, { provider: "ollama" }>,
  request: TextGenerationRequest,
): Promise<TextGenerationResult> {
  const text = await callLlmEndpoint({
    url: `${config.baseUrl}/api/chat`,
    headers: { "Content-Type": "application/json" },
    body: {
      model: config.model,
      stream: false,
      options: { temperature: request.temperature ?? 0.2 },
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
    },
    timeoutMs: config.timeoutMs,
    providerName: "ollama",
    extractText: extractOllamaText,
  });

  return { text, provider: "ollama", model: config.model };
}

async function callOpenAi<T>(
  config: Extract<LlmConfig, { provider: "openai" }>,
  request: StructuredGenerationRequest,
): Promise<StructuredGenerationResult<T>> {
  const text = await callLlmEndpoint({
    url: `${config.baseUrl}/responses`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: {
      model: config.model,
      instructions: request.systemPrompt,
      input: request.userPrompt,
      temperature: request.temperature ?? 0,
      text: {
        format: {
          type: "json_schema",
          name: request.schemaName,
          schema: request.schema,
          strict: true,
        },
      },
    },
    timeoutMs: config.timeoutMs,
    providerName: "openai",
    extractText: extractOpenAiText,
  });

  return {
    object: JSON.parse(text) as T,
    provider: "openai",
    model: config.model,
  };
}

async function callGemini<T>(
  config: Extract<LlmConfig, { provider: "gemini" }>,
  request: StructuredGenerationRequest,
): Promise<StructuredGenerationResult<T>> {
  const text = await callLlmEndpoint({
    url: geminiUrl(config.baseUrl, config.model, config.apiKey),
    headers: { "Content-Type": "application/json" },
    body: {
      contents: [
        {
          parts: [{ text: `${request.systemPrompt}\n\n${request.userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: request.temperature ?? 0,
        responseMimeType: "application/json",
        responseJsonSchema: request.schema,
      },
    },
    timeoutMs: config.timeoutMs,
    providerName: "gemini",
    extractText: extractGeminiText,
  });

  return {
    object: JSON.parse(text) as T,
    provider: "gemini",
    model: config.model,
  };
}

async function callOllama<T>(
  config: Extract<LlmConfig, { provider: "ollama" }>,
  request: StructuredGenerationRequest,
): Promise<StructuredGenerationResult<T>> {
  const text = await callLlmEndpoint({
    url: `${config.baseUrl}/api/chat`,
    headers: { "Content-Type": "application/json" },
    body: {
      model: config.model,
      stream: false,
      format: request.schema,
      options: { temperature: request.temperature ?? 0 },
      messages: [
        { role: "system", content: request.systemPrompt },
        {
          role: "user",
          content:
            `${request.userPrompt}\n\nReturn valid JSON that matches the provided schema.`,
        },
      ],
    },
    timeoutMs: config.timeoutMs,
    providerName: "ollama",
    extractText: extractOllamaText,
  });

  return {
    object: JSON.parse(text) as T,
    provider: "ollama",
    model: config.model,
  };
}

export async function generateStructuredObject<T>(
  request: StructuredGenerationRequest,
): Promise<StructuredGenerationResult<T> | null> {
  const config = await resolveLlmConfig();
  if (!config) {
    return null;
  }

  if (config.provider === "openai") {
    return callOpenAi<T>(config, request);
  }
  if (config.provider === "gemini") {
    return callGemini<T>(config, request);
  }

  return callOllama<T>(config, request);
}

export async function generateText(
  request: TextGenerationRequest,
): Promise<TextGenerationResult | null> {
  const config = await resolveLlmConfig();
  if (!config) {
    return null;
  }

  if (config.provider === "openai") {
    return callOpenAiText(config, request);
  }
  if (config.provider === "gemini") {
    return callGeminiText(config, request);
  }

  return callOllamaText(config, request);
}
