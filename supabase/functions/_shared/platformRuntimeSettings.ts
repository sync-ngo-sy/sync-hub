import { createServiceClient } from "./platformProvisioning.ts";
import { envText } from "./utils.ts";

const CACHE_TTL_MS = 30_000;

export const RUNTIME_SETTING_KEYS = [
  "gemini_model_id",
  "llm_provider",
  "llm_timeout_ms",
  "openai_model",
  "ollama_model",
  "gemini_embedding_model",
] as const;

export type RuntimeSettingKey = (typeof RUNTIME_SETTING_KEYS)[number];

const RUNTIME_SETTING_ENV: Record<RuntimeSettingKey, string> = {
  gemini_model_id: "GEMINI_MODEL_ID",
  llm_provider: "LLM_PROVIDER",
  llm_timeout_ms: "LLM_TIMEOUT_MS",
  openai_model: "OPENAI_MODEL",
  ollama_model: "OLLAMA_MODEL",
  gemini_embedding_model: "GEMINI_EMBEDDING_MODEL",
};

let cachedSettings: {
  expiresAt: number;
  values: Record<string, string>;
} | null = null;

function isValidModelId(value: string) {
  return /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value);
}

export function invalidatePlatformRuntimeSettingsCache() {
  cachedSettings = null;
}

export async function loadPlatformRuntimeSettings(): Promise<
  Record<string, string>
> {
  if (cachedSettings && Date.now() < cachedSettings.expiresAt) {
    return cachedSettings.values;
  }

  const values: Record<string, string> = {};
  try {
    const client = createServiceClient();
    const { data, error } = await client
      .from("platform_runtime_settings")
      .select("key, value");
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const key = typeof row.key === "string" ? row.key.trim() : "";
        const value = typeof row.value === "string" ? row.value.trim() : "";
        if (key && value) {
          values[key] = value;
        }
      }
    }
  } catch {
    // Fall back to environment-only configuration.
  }

  cachedSettings = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    values,
  };
  return values;
}

export async function getRuntimeSetting(
  key: RuntimeSettingKey,
): Promise<string | null> {
  const settings = await loadPlatformRuntimeSettings();
  const value = settings[key]?.trim();
  return value && value.length > 0 ? value : null;
}

export function validateRuntimeSettingValue(
  key: RuntimeSettingKey,
  value: string,
) {
  const normalized = value.trim();
  if (!normalized) {
    return "Value is required.";
  }

  if (key === "llm_provider") {
    if (!["openai", "gemini", "ollama"].includes(normalized)) {
      return "llm_provider must be openai, gemini, or ollama.";
    }
    return null;
  }

  if (key === "llm_timeout_ms") {
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 120_000) {
      return "llm_timeout_ms must be between 1000 and 120000.";
    }
    return null;
  }

  if (!isValidModelId(normalized)) {
    return "Invalid model identifier.";
  }

  return null;
}

type SettingSource = "database" | "environment" | "unset";

export type PlatformRuntimeConfigField = {
  key: RuntimeSettingKey;
  value: string | null;
  source: SettingSource;
  envName: string;
};

export async function buildPlatformRuntimeConfigView(): Promise<{
  settings: PlatformRuntimeConfigField[];
  updatedAt: string | null;
}> {
  const database = await loadPlatformRuntimeSettings();
  let updatedAt: string | null = null;

  try {
    const client = createServiceClient();
    const { data } = await client
      .from("platform_runtime_settings")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);
    const latest = Array.isArray(data) ? data[0] : null;
    updatedAt = typeof latest?.updated_at === "string"
      ? latest.updated_at
      : null;
  } catch {
    updatedAt = null;
  }

  const settings = RUNTIME_SETTING_KEYS.map((key) => {
    const envName = RUNTIME_SETTING_ENV[key];
    const databaseValue = database[key] ?? null;
    const environmentValue = envText(envName);
    const value = databaseValue ?? environmentValue;
    const source: SettingSource = databaseValue
      ? "database"
      : environmentValue
      ? "environment"
      : "unset";

    return {
      key,
      value,
      source,
      envName,
    };
  });

  return { settings, updatedAt };
}

export async function savePlatformRuntimeSettings(
  updates: Record<string, string | null | undefined>,
  updatedBy: string,
) {
  const client = createServiceClient();
  const errors: Record<string, string> = {};

  for (const key of RUNTIME_SETTING_KEYS) {
    if (!(key in updates)) {
      continue;
    }

    const raw = updates[key];
    if (
      raw === null ||
      raw === undefined ||
      (typeof raw === "string" && raw.trim().length === 0)
    ) {
      const { error } = await client
        .from("platform_runtime_settings")
        .delete()
        .eq("key", key);
      if (error) {
        errors[key] = error.message;
      }
      continue;
    }

    if (typeof raw !== "string") {
      errors[key] = "Invalid value.";
      continue;
    }

    const validationError = validateRuntimeSettingValue(key, raw);
    if (validationError) {
      errors[key] = validationError;
      continue;
    }

    const { error } = await client.from("platform_runtime_settings").upsert(
      {
        key,
        value: raw.trim(),
        updated_by: updatedBy,
      },
      { onConflict: "key" },
    );
    if (error) {
      errors[key] = error.message;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new Error(
      JSON.stringify({ code: "validation_error", fields: errors }),
    );
  }

  invalidatePlatformRuntimeSettingsCache();
  return buildPlatformRuntimeConfigView();
}
