import type { Dispatch, SetStateAction } from "react";
import { Wand2 } from "lucide-react";
import { Panel, Tag } from "@/components/ui";
import type { ParserProfile, ParserProfileInput } from "@/lib/contracts";
import {
  CHUNKING_PROFILES,
  EMBEDDING_PROVIDERS,
  EXTRACTION_PROVIDERS,
  parserProfileStatusTone,
} from "@/features/parsing/utils/parserProfiles";

type StringProfileField = {
  [Key in keyof ParserProfileInput]-?: NonNullable<ParserProfileInput[Key]> extends string ? Key : never;
}[keyof ParserProfileInput];

type ProfileSetting =
  | {
      kind: "text";
      label: string;
      name: StringProfileField;
      full?: boolean;
    }
  | {
      kind: "select";
      label: string;
      name: StringProfileField;
      options: Array<{ value: string; label: string }>;
    };

const PROFILE_SETTINGS: ProfileSetting[] = [
  { kind: "text", label: "Name", name: "name" },
  { kind: "text", label: "Slug", name: "slug" },
  { kind: "text", label: "Description", name: "description", full: true },
  { kind: "select", label: "Extraction provider", name: "extractionProvider", options: EXTRACTION_PROVIDERS },
  { kind: "text", label: "Extraction model", name: "extractionModel" },
  { kind: "text", label: "Parser version", name: "parserVersion" },
  { kind: "text", label: "Model version", name: "modelVersion" },
  { kind: "text", label: "Prompt version", name: "promptVersion" },
  { kind: "text", label: "Chunk version", name: "chunkVersion" },
  { kind: "select", label: "Embedding provider", name: "embeddingProvider", options: EMBEDDING_PROVIDERS },
  { kind: "text", label: "Embedding model", name: "embeddingModel" },
  { kind: "text", label: "Embedding version", name: "embeddingVersion" },
  { kind: "select", label: "Chunking profile", name: "chunkingProfile", options: CHUNKING_PROFILES },
];

type ParserProfileFormProps = {
  canEdit: boolean;
  form: ParserProfileInput;
  onPublish: () => void;
  onSave: () => void;
  publishing: boolean;
  resolvedWorkspaceName: string;
  saving: boolean;
  selectedProfile: ParserProfile | null;
  setForm: Dispatch<SetStateAction<ParserProfileInput>>;
};

export function ParserProfileForm({
  canEdit,
  form,
  onPublish,
  onSave,
  publishing,
  resolvedWorkspaceName,
  saving,
  selectedProfile,
  setForm,
}: ParserProfileFormProps) {
  function updateStringField(name: StringProfileField, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <Panel className="table-card">
      <div className="stack">
        <div className="signal-row">
          <div>
            <h3>{selectedProfile ? "Edit profile" : "Create profile"}</h3>
            <p>These settings define what the worker should run. Save a draft first, then publish the best validated profile.</p>
          </div>
          <div className="skill-list">
            {selectedProfile ? <Tag tone={parserProfileStatusTone(selectedProfile.status)}>{selectedProfile.status}</Tag> : null}
            {canEdit ? <Tag tone="success">Admin write enabled</Tag> : <Tag tone="warning">Read-only</Tag>}
          </div>
        </div>

        <div className="evidence-card">
          <span className="parsing-profile-grid__label">Workspace</span>
          <strong>{resolvedWorkspaceName}</strong>
          <p>{selectedProfile ? "This profile belongs to the selected workspace." : "New drafts will be created under this workspace."}</p>
        </div>

        <div className="parser-form-grid">
          {PROFILE_SETTINGS.map((setting) => (
            <label key={setting.name} className={setting.kind === "text" && setting.full ? "parser-field parser-field--full" : "parser-field"}>
              <span>{setting.label}</span>
              {setting.kind === "select" ? (
                <select
                  className="form-select"
                  value={form[setting.name]}
                  onChange={(event) => updateStringField(setting.name, event.target.value)}
                  disabled={!canEdit}
                >
                  {setting.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-input"
                  value={form[setting.name]}
                  onChange={(event) => updateStringField(setting.name, event.target.value)}
                  disabled={!canEdit}
                />
              )}
            </label>
          ))}
        </div>

        <div className="parser-toggle-grid">
          <label className="parser-toggle">
            <input
              type="checkbox"
              checked={form.ocrEnabled}
              onChange={(event) => setForm((current) => ({ ...current, ocrEnabled: event.target.checked }))}
              disabled={!canEdit}
            />
            <div>
              <strong>Enable OCR path</strong>
              <p>Use a profile designed for scanned or image-heavy PDFs.</p>
            </div>
          </label>
          <label className="parser-toggle">
            <input
              type="checkbox"
              checked={false}
              onChange={() => setForm((current) => ({ ...current, allowHeuristicFallback: false }))}
              disabled
            />
            <div>
              <strong>Heuristic fallback disabled</strong>
              <p>Model extraction failures retry and then fail the run instead of writing deterministic output.</p>
            </div>
          </label>
        </div>

        <label className="parser-field parser-field--full">
          <span>Prompt template</span>
          <textarea
            className="form-textarea"
            value={form.promptTemplate}
            onChange={(event) => setForm((current) => ({ ...current, promptTemplate: event.target.value }))}
            disabled={!canEdit}
          />
        </label>

        <label className="parser-field parser-field--full">
          <span>Notes</span>
          <textarea
            className="form-textarea"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            disabled={!canEdit}
          />
        </label>

        <div className="parser-lab-actions">
          <button className="button button--secondary" type="button" onClick={onSave} disabled={!canEdit || saving}>
            {saving ? "Saving..." : "Save Draft"}
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={onPublish}
            disabled={!canEdit || !selectedProfile?.id || publishing || selectedProfile?.status === "active"}
          >
            {publishing ? "Publishing..." : "Publish Active"}
          </button>
        </div>

        <div className="evidence-card">
          <div className="skill-list">
            <Wand2 size={16} />
            <strong>Activation rule</strong>
          </div>
          <p>Only one profile should be active per workspace. Save experimental changes as drafts, validate them against low-quality documents, then publish the one profile the worker should follow for that workspace.</p>
        </div>
      </div>
    </Panel>
  );
}
