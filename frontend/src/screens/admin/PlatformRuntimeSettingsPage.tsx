import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { EmptyState, PageIntro, Panel, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { PlatformRuntimeConfigField } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";

const FIELD_LABELS: Record<string, string> = {
  gemini_model_id: "Gemini model (search / ask / agent)",
  llm_provider: "LLM provider",
  llm_timeout_ms: "LLM timeout (ms)",
  openai_model: "OpenAI model",
  ollama_model: "Ollama model",
  gemini_embedding_model: "Gemini embedding model (search vectors)",
};

const FIELD_HELP: Record<string, string> = {
  gemini_model_id: "Example: gemini-3.5-flash. Used for intent extraction, ask synthesis, and the agent.",
  llm_provider: "Leave on Auto to use the first provider with credentials (OpenAI, then Gemini, then Ollama locally).",
  llm_timeout_ms: "Milliseconds before the edge function aborts an LLM call (1000–120000).",
  openai_model: "Used when LLM provider is OpenAI or Auto selects OpenAI.",
  ollama_model: "Used when LLM provider is Ollama or Auto selects Ollama (local dev).",
  gemini_embedding_model: "Used for semantic search query embeddings when GEMINI_API_KEY is set.",
};

const LLM_PROVIDER_OPTIONS = ["", "gemini", "openai", "ollama"];

function sourceTone(source: PlatformRuntimeConfigField["source"]) {
  if (source === "database") {
    return "success" as const;
  }
  if (source === "environment") {
    return "primary" as const;
  }
  return "neutral" as const;
}

function sourceLabel(source: PlatformRuntimeConfigField["source"]) {
  if (source === "database") {
    return "Saved in platform";
  }
  if (source === "environment") {
    return "Supabase secret";
  }
  return "Not set";
}

export function PlatformRuntimeSettingsPage() {
  const { enabled, isAdmin, loading } = useAuth();
  const [configLoading, setConfigLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [fields, setFields] = useState<PlatformRuntimeConfigField[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const geminiModelField = fields.find((field) => field.key === "gemini_model_id");

  useEffect(() => {
    if (enabled && loading) {
      return;
    }
    if (enabled && !isAdmin) {
      setConfigLoading(false);
      return;
    }

    let active = true;
    setConfigLoading(true);
    setError(null);

    platformApi
      .getPlatformRuntimeConfig()
      .then((config) => {
        if (!active) {
          return;
        }
        setFields(config.settings);
        setUpdatedAt(config.updatedAt);
        setDraft(
          Object.fromEntries(
            config.settings.map((field) => [field.key, field.value ?? ""]),
          ),
        );
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load runtime settings.");
        }
      })
      .finally(() => {
        if (active) {
          setConfigLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [enabled, isAdmin, loading]);

  const hasChanges = useMemo(() => {
    return fields.some((field) => (draft[field.key] ?? "") !== (field.value ?? ""));
  }, [draft, fields]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const updates = Object.fromEntries(
        fields
          .map((field) => {
            const nextValue = (draft[field.key] ?? "").trim();
            const currentValue = (field.value ?? "").trim();
            if (nextValue === currentValue) {
              return null;
            }
            return [field.key, nextValue.length > 0 ? nextValue : null];
          })
          .filter((entry): entry is [string, string | null] => entry !== null),
      );

      if (Object.keys(updates).length === 0) {
        setNotice("No changes to save.");
        return;
      }

      const config = await platformApi.savePlatformRuntimeConfig(updates);
      setFields(config.settings);
      setUpdatedAt(config.updatedAt);
      setDraft(
        Object.fromEntries(
          config.settings.map((field) => [field.key, field.value ?? ""]),
        ),
      );
      setNotice("Runtime settings saved. Edge functions pick up changes within about 30 seconds.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save runtime settings.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setDraft(
      Object.fromEntries(
        fields.map((field) => [field.key, field.value ?? ""]),
      ),
    );
    setError(null);
    setNotice(null);
  }

  if (enabled && !loading && !isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Platform admin required"
          detail="Only platform administrators can manage runtime AI settings."
          action={
            <Link className="button button--secondary" to="/search">
              Return to Search
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Admin"
        title="Runtime settings"
        description="Change AI model IDs and provider settings without redeploying edge functions. API keys stay in Supabase secrets; only non-secret runtime values are stored in the platform database."
        actions={
          <Link className="button button--secondary" to="/admin">
            Platform dashboard
          </Link>
        }
      />

      {error ? <div className="status-banner">{error}</div> : null}
      {notice ? <div className="status-banner">{notice}</div> : null}

      <div className="admin-grid">
        <Panel className="table-card">
          {configLoading ? (
            <p>Loading runtime settings…</p>
          ) : (
            <form className="stack" onSubmit={handleSubmit}>
              <div className="skill-list">
                <Settings2 size={16} />
                <h3>Live AI configuration</h3>
              </div>

              <div className="signal-row">
                <p className="muted">
                  Values saved here override the matching Supabase secret for edge functions. Clear a field and save to fall back to the secret.
                </p>
                {updatedAt ? <Tag tone="neutral">Last saved {new Date(updatedAt).toLocaleString()}</Tag> : null}
              </div>

              {geminiModelField?.value ? (
                <div className="evidence-card">
                  <div className="signal-row">
                    <strong>Active Gemini model</strong>
                    <Tag tone={sourceTone(geminiModelField.source)}>{sourceLabel(geminiModelField.source)}</Tag>
                  </div>
                  <p>
                    <code>{geminiModelField.value}</code> is used for search intent, ask, and agent flows.
                  </p>
                </div>
              ) : (
                <div className="evidence-card">
                  <div className="signal-row">
                    <strong>Gemini model not configured</strong>
                    <Tag tone="warning">Action needed</Tag>
                  </div>
                  <p>Set <code>gemini_model_id</code> below or add <code>GEMINI_MODEL_ID</code> as a Supabase secret.</p>
                </div>
              )}

              <div className="parser-form-grid">
                {fields.map((field) => (
                  <label
                    key={field.key}
                    className={field.key === "gemini_model_id" || field.key === "gemini_embedding_model" ? "parser-field parser-field--full" : "parser-field"}
                  >
                    <span>{FIELD_LABELS[field.key] ?? field.key}</span>
                    {field.key === "llm_provider" ? (
                      <select
                        className="form-input"
                        value={draft[field.key] ?? ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                      >
                        {LLM_PROVIDER_OPTIONS.map((option) => (
                          <option key={option || "auto"} value={option}>
                            {option ? option : "Auto (first configured provider)"}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="form-input"
                        type={field.key === "llm_timeout_ms" ? "number" : "text"}
                        min={field.key === "llm_timeout_ms" ? 1000 : undefined}
                        max={field.key === "llm_timeout_ms" ? 120000 : undefined}
                        value={draft[field.key] ?? ""}
                        placeholder={field.envName}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                    )}
                    <span className="muted">{FIELD_HELP[field.key] ?? `Maps to secret ${field.envName}.`}</span>
                    <span className="skill-list">
                      <Tag tone={sourceTone(field.source)}>{sourceLabel(field.source)}</Tag>
                      <code>{field.envName}</code>
                    </span>
                  </label>
                ))}
              </div>

              <div className="skill-list">
                <button className="button button--primary" type="submit" disabled={submitting || !hasChanges}>
                  {submitting ? "Saving…" : "Save runtime settings"}
                </button>
                <button className="button button--secondary" type="button" disabled={submitting || !hasChanges} onClick={handleReset}>
                  Reset changes
                </button>
              </div>
            </form>
          )}
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <h3>What stays in Supabase secrets</h3>
            <p className="muted">Never put API keys in this screen. Configure these in the dashboard or with the CLI:</p>
            <ul className="stack muted">
              <li>
                <code>GEMINI_API_KEY</code> — required for Gemini search and embeddings
              </li>
              <li>
                <code>OPENAI_API_KEY</code> — optional OpenAI provider
              </li>
              <li>
                <code>LLM_PROVIDER</code> — optional default when not set above
              </li>
            </ul>
            <Link to="/admin/parsing/lab" className="inline-cta">
              <div>
                <strong>Parsing Lab</strong>
                <p>Tenant-level parser profiles (extraction model, embeddings, prompts) for CV ingestion.</p>
              </div>
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
