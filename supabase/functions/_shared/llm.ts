import { getRuntimeSetting, type RuntimeSettingKey } from "./platformRuntimeSettings.ts";

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

function envText(name: string) {
  const value = Deno.env.get(name)?.trim();
  return value && value.length > 0 ? value : null;
}

function isLocalRuntime() {
  const supabaseUrl = envText("SUPABASE_URL") ?? "";
  return supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
}

function envNumber(name: string, fallback: number) {
  const value = envText(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function resolveRuntimeOrEnv(key: RuntimeSettingKey, envName: string) {
  return (await getRuntimeSetting(key)) ?? envText(envName);
}

async function resolveGeminiModelId() {
  return await resolveRuntimeOrEnv("gemini_model_id", "GEMINI_MODEL_ID");
}

async function buildGeminiConfig(timeoutMs: number): Promise<Extract<LlmConfig, { provider: "gemini" }> | null> {
  const apiKey = envText("GEMINI_API_KEY");
  const modelId = await resolveGeminiModelId();
  if (!apiKey || !modelId) {
    return null;
  }

  return {
    provider: "gemini",
    apiKey,
    model: modelId,
    baseUrl: envText("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta",
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
  const provider = (await resolveRuntimeOrEnv("llm_provider", "LLM_PROVIDER")) ?? null;
  const timeoutMs = await resolveLlmTimeoutMs();
  const defaultLocalOllamaModel = isLocalRuntime() ? "qwen3:30b-a3b" : null;
  const geminiConfig = await buildGeminiConfig(timeoutMs);
  const openaiModel = (await resolveRuntimeOrEnv("openai_model", "OPENAI_MODEL")) ?? "gpt-4.1-mini";
  const ollamaModel = (await resolveRuntimeOrEnv("ollama_model", "OLLAMA_MODEL")) ?? defaultLocalOllamaModel;

  if ((provider === "openai" || !provider) && envText("OPENAI_API_KEY")) {
    return {
      provider: "openai",
      apiKey: envText("OPENAI_API_KEY") as string,
      model: openaiModel,
      baseUrl: envText("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
      timeoutMs,
    };
  }

  if ((provider === "gemini" || !provider) && geminiConfig) {
    return geminiConfig;
  }

  if ((provider === "ollama" || !provider) && ollamaModel) {
    return {
      provider: "ollama",
      model: ollamaModel,
      baseUrl: envText("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434",
      timeoutMs,
    };
  }

  if (provider === "openai" && envText("OPENAI_API_KEY")) {
    return {
      provider: "openai",
      apiKey: envText("OPENAI_API_KEY") as string,
      model: openaiModel,
      baseUrl: envText("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
      timeoutMs,
    };
  }

  if (provider === "gemini" && geminiConfig) {
    return geminiConfig;
  }

  if (provider === "ollama" && ollamaModel) {
    return {
      provider: "ollama",
      model: ollamaModel,
      baseUrl: envText("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434",
      timeoutMs,
    };
  }

  return null;
}

export async function isLlmConfigured() {
  return (await resolveLlmConfig()) !== null;
}

function extractOpenAiText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
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
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const content = (candidate as { content?: Record<string, unknown> }).content;
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

async function parseResponseBody(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    return { raw: text };
  }
}

async function callOpenAiText(
  config: Extract<LlmConfig, { provider: "openai" }>,
  request: TextGenerationRequest,
): Promise<TextGenerationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        instructions: request.systemPrompt,
        input: request.userPrompt,
        temperature: request.temperature ?? 0.2,
      }),
      signal: controller.signal,
    });

    const payload = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(`openai_error:${response.status}:${JSON.stringify(payload)}`);
    }

    const text = extractOpenAiText(payload)?.trim();
    if (!text) {
      throw new Error("openai_error:missing_output_text");
    }

    return {
      text,
      provider: "openai",
      model: config.model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiText(
  config: Extract<LlmConfig, { provider: "gemini" }>,
  request: TextGenerationRequest,
): Promise<TextGenerationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/$/, "")}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${request.systemPrompt}\n\n${request.userPrompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: request.temperature ?? 0.2,
          },
        }),
        signal: controller.signal,
      },
    );

    const payload = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(`gemini_error:${response.status}:${JSON.stringify(payload)}`);
    }

    const text = extractGeminiText(payload)?.trim();
    if (!text) {
      throw new Error("gemini_error:missing_output_text");
    }

    return {
      text,
      provider: "gemini",
      model: config.model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOllamaText(
  config: Extract<LlmConfig, { provider: "ollama" }>,
  request: TextGenerationRequest,
): Promise<TextGenerationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.2,
        },
        messages: [
          {
            role: "system",
            content: request.systemPrompt,
          },
          {
            role: "user",
            content: request.userPrompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(`ollama_error:${response.status}:${JSON.stringify(payload)}`);
    }

    const message = payload.message;
    const text =
      message && typeof message === "object" && typeof (message as { content?: unknown }).content === "string"
        ? (message as { content: string }).content.trim()
        : null;
    if (!text) {
      throw new Error("ollama_error:missing_output_text");
    }

    return {
      text,
      provider: "ollama",
      model: config.model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAi<T>(config: Extract<LlmConfig, { provider: "openai" }>, request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
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
      }),
      signal: controller.signal,
    });

    const payload = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(`openai_error:${response.status}:${JSON.stringify(payload)}`);
    }

    const text = extractOpenAiText(payload);
    if (!text) {
      throw new Error("openai_error:missing_output_text");
    }

    return {
      object: JSON.parse(text) as T,
      provider: "openai",
      model: config.model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini<T>(config: Extract<LlmConfig, { provider: "gemini" }>, request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/$/, "")}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${request.systemPrompt}\n\n${request.userPrompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: request.temperature ?? 0,
            responseMimeType: "application/json",
            responseJsonSchema: request.schema,
          },
        }),
        signal: controller.signal,
      },
    );

    const payload = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(`gemini_error:${response.status}:${JSON.stringify(payload)}`);
    }

    const text = extractGeminiText(payload);
    if (!text) {
      throw new Error("gemini_error:missing_output_text");
    }

    return {
      object: JSON.parse(text) as T,
      provider: "gemini",
      model: config.model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOllama<T>(config: Extract<LlmConfig, { provider: "ollama" }>, request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        format: request.schema,
        options: {
          temperature: request.temperature ?? 0,
        },
        messages: [
          {
            role: "system",
            content: request.systemPrompt,
          },
          {
            role: "user",
            content: `${request.userPrompt}\n\nReturn valid JSON that matches the provided schema.`,
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(`ollama_error:${response.status}:${JSON.stringify(payload)}`);
    }

    const message = payload.message;
    const text =
      message && typeof message === "object" && typeof (message as { content?: unknown }).content === "string"
        ? (message as { content: string }).content
        : null;
    if (!text) {
      throw new Error("ollama_error:missing_output_text");
    }

    return {
      object: JSON.parse(text) as T,
      provider: "ollama",
      model: config.model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateStructuredObject<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T> | null> {
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

export async function generateText(request: TextGenerationRequest): Promise<TextGenerationResult | null> {
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
