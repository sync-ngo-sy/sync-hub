import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Sparkles, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageIntro, Panel, StatCard, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type { ParserProfile, ParserProfileInput } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";

const EXTRACTION_PROVIDERS = [
  { value: "openai-compatible", label: "OpenAI-compatible" },
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
];

const EMBEDDING_PROVIDERS = [
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "deterministic", label: "Deterministic fallback" },
];

const CHUNKING_PROFILES = [
  { value: "standard", label: "Standard" },
  { value: "section-first", label: "Section-first" },
  { value: "dense-experience", label: "Dense experience" },
];

function createDefaultProfile(seed?: ParserProfile | null): ParserProfileInput {
  return {
    id: seed?.id,
    name: seed?.name ?? "New parser draft",
    slug: seed?.slug ?? "new-parser-draft",
    description: seed?.description ?? "",
    extractionProvider: seed?.extractionProvider ?? "openai-compatible",
    extractionModel: seed?.extractionModel ?? "gemini-2.5-flash",
    parserVersion: seed?.parserVersion ?? "pdftotext-raw-v2",
    modelVersion: seed?.modelVersion ?? "gemini-2.5-flash-v1",
    promptVersion: seed?.promptVersion ?? "openai-json-v1",
    chunkVersion: seed?.chunkVersion ?? "section-first-v1",
    embeddingProvider: seed?.embeddingProvider ?? "openai",
    embeddingModel: seed?.embeddingModel ?? "gemini-embedding-001",
    embeddingVersion: seed?.embeddingVersion ?? "gemini-embedding-001-768-v1",
    chunkingProfile: seed?.chunkingProfile ?? "section-first",
    ocrEnabled: seed?.ocrEnabled ?? false,
    allowHeuristicFallback: false,
    promptTemplate:
      seed?.promptTemplate ??
      [
        "You are extracting a recruiter-ready candidate profile from a CV.",
        "Return valid JSON only.",
        "Preserve evidence-backed skills, companies, dates, and contact details.",
        "Do not invent missing facts.",
      ].join("\n"),
    notes: seed?.notes ?? "",
  };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 48);
}

function toneForStatus(status: ParserProfile["status"]) {
  if (status === "active") {
    return "success" as const;
  }
  if (status === "draft") {
    return "primary" as const;
  }
  return "warning" as const;
}

export function ParsingLabPage() {
  const { adminMemberships, currentTenant, enabled, isAdmin, loading } = useAuth();
  const [profiles, setProfiles] = useState<ParserProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string | null>(null);
  const [form, setForm] = useState<ParserProfileInput>(createDefaultProfile());
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const adminTenantIds = useMemo(() => adminMemberships.map((membership) => membership.id), [adminMemberships]);
  const workspaceNameById = useMemo(
    () => new Map(adminMemberships.map((membership) => [membership.id, membership.name])),
    [adminMemberships],
  );
  const canEdit = adminTenantIds.length > 0;

  useEffect(() => {
    if (enabled && loading) {
      return;
    }
    if (enabled && !isAdmin) {
      return;
    }
    if (!adminTenantIds.length) {
      return;
    }

    let active = true;
    setFetching(true);
    setError(null);

    platformApi
      .getParserProfiles(adminTenantIds)
      .then((nextProfiles) => {
        if (!active) {
          return;
        }

        setProfiles(nextProfiles);
        const selected = nextProfiles.find((profile) => profile.id === selectedId) ?? nextProfiles[0] ?? null;
        setSelectedId(selected?.id ?? null);
        setForm(createDefaultProfile(selected));
        setTargetWorkspaceId(
          selected?.tenantId ??
            (currentTenant && adminTenantIds.includes(currentTenant.id) ? currentTenant.id : adminTenantIds[0] ?? null),
        );
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load parser profiles.");
        }
      })
      .finally(() => {
        if (active) {
          setFetching(false);
        }
      });

    return () => {
      active = false;
    };
  }, [adminTenantIds, currentTenant, enabled, isAdmin, loading, selectedId]);

  const activeProfile = useMemo(() => profiles.find((profile) => profile.status === "active") ?? null, [profiles]);
  const selectedProfile = useMemo(() => profiles.find((profile) => profile.id === selectedId) ?? null, [profiles, selectedId]);
  const workspacesRepresented = useMemo(() => new Set(profiles.map((profile) => profile.tenantId)).size, [profiles]);
  const resolvedWorkspaceId =
    targetWorkspaceId ??
    selectedProfile?.tenantId ??
    activeProfile?.tenantId ??
    (currentTenant && adminTenantIds.includes(currentTenant.id) ? currentTenant.id : adminTenantIds[0] ?? null);
  const resolvedWorkspaceName = resolvedWorkspaceId ? workspaceNameById.get(resolvedWorkspaceId) ?? "Unknown workspace" : "No workspace";

  function handleSelectProfile(profile: ParserProfile) {
    setSelectedId(profile.id);
    setForm(createDefaultProfile(profile));
    setTargetWorkspaceId(profile.tenantId);
    setNotice(null);
    setError(null);
  }

  function handleCreateDraft() {
    const seed = selectedProfile ?? activeProfile ?? null;
    const nextWorkspaceId =
      seed?.tenantId ??
      (currentTenant && adminTenantIds.includes(currentTenant.id) ? currentTenant.id : adminTenantIds[0] ?? null);
    setSelectedId(null);
    setTargetWorkspaceId(nextWorkspaceId);
    setForm(createDefaultProfile(seed));
    setForm((current) => ({
      ...current,
      id: undefined,
      name: seed ? `${seed.name} Draft` : "New parser draft",
      slug: seed ? `${seed.slug}-draft` : "new-parser-draft",
      description: seed?.description ?? "",
      notes: seed ? `Forked from ${seed.name} (${workspaceNameById.get(seed.tenantId) ?? "Unknown workspace"}).` : "",
    }));
    setNotice(null);
    setError(null);
  }

  async function handleSave() {
    if (!resolvedWorkspaceId || !canEdit) {
      return;
    }

    const payload: ParserProfileInput = {
      ...form,
      slug: slugify(form.slug || form.name),
      name: form.name.trim(),
      description: form.description.trim(),
      extractionModel: form.extractionModel.trim(),
      parserVersion: form.parserVersion.trim(),
      modelVersion: form.modelVersion.trim(),
      promptVersion: form.promptVersion.trim(),
      chunkVersion: form.chunkVersion.trim(),
      embeddingModel: form.embeddingModel.trim(),
      embeddingVersion: form.embeddingVersion.trim(),
      promptTemplate: form.promptTemplate.trim(),
      notes: form.notes.trim(),
    };

    if (!payload.name || !payload.slug || !payload.promptTemplate) {
      setError("Name, slug, and prompt template are required.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const saved = await platformApi.saveParserProfile(payload, resolvedWorkspaceId);
      const nextProfiles = profiles.some((profile) => profile.id === saved.id)
        ? profiles.map((profile) => (profile.id === saved.id ? saved : profile))
        : [saved, ...profiles];
      setProfiles(nextProfiles);
      setSelectedId(saved.id);
      setForm(createDefaultProfile(saved));
      setTargetWorkspaceId(saved.tenantId);
      setNotice(`${saved.name} saved as ${saved.status}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save parser profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!selectedProfile?.tenantId || !canEdit || !selectedProfile?.id) {
      return;
    }

    setPublishing(true);
    setError(null);
    setNotice(null);

    try {
      const published = await platformApi.publishParserProfile(selectedProfile.id, selectedProfile.tenantId);
      const nextProfiles = profiles.map((profile) => {
        if (profile.status === "archived" || profile.tenantId !== published.tenantId) {
          return profile;
        }
        if (profile.id === published.id) {
          return published;
        }
        return { ...profile, status: "draft" as const };
      });
      setProfiles(nextProfiles);
      setSelectedId(published.id);
      setForm(createDefaultProfile(published));
      setTargetWorkspaceId(published.tenantId);
      setNotice(`${published.name} is now the active parser profile.`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish parser profile.");
    } finally {
      setPublishing(false);
    }
  }

  if (enabled && !loading && !isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Admin access required"
          detail="Parsing Lab is restricted to platform admins."
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
        title="Parsing lab"
        description="Manage versioned parser profiles, prompt templates, and publish controls in one place. Profiles stay workspace-specific, but this lab is available across the full platform."
        actions={
          <>
            <Link className="button button--secondary" to="/admin/settings">
              Runtime settings (search / ask)
            </Link>
            <Link className="button button--secondary" to="/admin/parsing">
              View parsing quality
            </Link>
            <button className="button button--primary" onClick={handleCreateDraft} type="button" disabled={!canEdit}>
              <FlaskConical size={14} />
              New Draft
            </button>
          </>
        }
      />

      {error ? <div className="status-banner">{error}</div> : null}
      {notice ? <div className="status-banner">{notice}</div> : null}

      <div className="stats-grid">
        <StatCard label="Profiles" value={`${profiles.length}`} delta={fetching ? "Refreshing" : "versioned"} />
        <StatCard
          label="Active profile"
          value={activeProfile?.name ?? "None"}
          delta={activeProfile?.promptVersion ?? "not published"}
          tone="secondary"
        />
        <StatCard
          label="Evaluated docs"
          value={`${profiles.reduce((sum, profile) => sum + profile.documentsEvaluated, 0)}`}
          delta="across profiles"
          tone="tertiary"
        />
        <StatCard
          label="Workspaces"
          value={`${workspacesRepresented}`}
          delta={`${adminMemberships.length} total on platform`}
        />
      </div>

      <div className="page-stack">
        <Panel className="table-card">
          <div className="stack">
            <div className="signal-row">
              <div>
                <h3>Versioned profiles</h3>
                <p>Use profiles to change prompts and parser settings safely. One active profile should represent the worker default for each workspace.</p>
              </div>
              <Tag tone="primary">{profiles.length} profiles</Tag>
            </div>

            {profiles.length ? (
              <div className="parser-profile-list">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    className={cn("parser-profile-card", selectedId === profile.id && "parser-profile-card--active")}
                    onClick={() => handleSelectProfile(profile)}
                  >
                    <div className="signal-row">
                      <strong>{profile.name}</strong>
                      <Tag tone={toneForStatus(profile.status)}>{profile.status}</Tag>
                    </div>
                    <p>{workspaceNameById.get(profile.tenantId) ?? "Unknown workspace"}</p>
                    <p>{profile.description || "No description yet."}</p>
                    <div className="skill-list">
                      <Tag>{profile.extractionProvider}</Tag>
                      <Tag>{profile.extractionModel}</Tag>
                      <Tag>{profile.chunkingProfile}</Tag>
                    </div>
                    <div className="parser-profile-card__meta">
                      <span>{profile.documentsEvaluated} docs evaluated</span>
                      <span>
                        {profile.avgParsePercentage ?? "—"}% parse · {profile.avgConfidence ?? "—"}% confidence
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No parser profiles yet"
                detail="Create a draft profile before changing prompts or parser settings."
                action={
                  canEdit ? (
                    <button className="button button--primary" type="button" onClick={handleCreateDraft}>
                      Create first profile
                    </button>
                  ) : undefined
                }
              />
            )}

            <div className="evidence-card">
              <div className="skill-list">
                <Sparkles size={16} />
                <strong>Fine-tuning is intentionally disabled</strong>
              </div>
              <p>Do prompt, parser, OCR, and chunking experiments first. Fine-tuning only becomes worth it after you have a labeled evaluation set and repeated failure patterns.</p>
            </div>
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <div className="signal-row">
              <div>
                <h3>{selectedProfile ? "Edit profile" : "Create profile"}</h3>
                <p>These settings define what the worker should run. Save a draft first, then publish the best validated profile.</p>
              </div>
              <div className="skill-list">
                {selectedProfile ? <Tag tone={toneForStatus(selectedProfile.status)}>{selectedProfile.status}</Tag> : null}
                {canEdit ? <Tag tone="success">Admin write enabled</Tag> : <Tag tone="warning">Read-only</Tag>}
              </div>
            </div>

            <div className="evidence-card">
              <span className="parsing-profile-grid__label">Workspace</span>
              <strong>{resolvedWorkspaceName}</strong>
              <p>{selectedProfile ? "This profile belongs to the selected workspace." : "New drafts will be created under this workspace."}</p>
            </div>

            <div className="parser-form-grid">
              <label className="parser-field">
                <span>Name</span>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="parser-field">
                <span>Slug</span>
                <input
                  className="form-input"
                  value={form.slug}
                  onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="parser-field parser-field--full">
                <span>Description</span>
                <input
                  className="form-input"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="parser-field">
                <span>Extraction provider</span>
                <select
                  className="form-select"
                  value={form.extractionProvider}
                  onChange={(event) => setForm((current) => ({ ...current, extractionProvider: event.target.value }))}
                  disabled={!canEdit}
                >
                  {EXTRACTION_PROVIDERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="parser-field">
                <span>Extraction model</span>
                <input
                  className="form-input"
                  value={form.extractionModel}
                  onChange={(event) => setForm((current) => ({ ...current, extractionModel: event.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="parser-field">
                <span>Parser version</span>
                <input
                  className="form-input"
                  value={form.parserVersion}
                  onChange={(event) => setForm((current) => ({ ...current, parserVersion: event.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="parser-field">
                <span>Model version</span>
                <input
                  className="form-input"
                  value={form.modelVersion}
                  onChange={(event) => setForm((current) => ({ ...current, modelVersion: event.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="parser-field">
                <span>Prompt version</span>
                <input
                  className="form-input"
                  value={form.promptVersion}
                  onChange={(event) => setForm((current) => ({ ...current, promptVersion: event.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="parser-field">
                <span>Chunk version</span>
                <input
                  className="form-input"
                  value={form.chunkVersion}
                  onChange={(event) => setForm((current) => ({ ...current, chunkVersion: event.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="parser-field">
                <span>Embedding provider</span>
                <select
                  className="form-select"
                  value={form.embeddingProvider}
                  onChange={(event) => setForm((current) => ({ ...current, embeddingProvider: event.target.value }))}
                  disabled={!canEdit}
                >
                  {EMBEDDING_PROVIDERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="parser-field">
                <span>Embedding model</span>
                <input
                  className="form-input"
                  value={form.embeddingModel}
                  onChange={(event) => setForm((current) => ({ ...current, embeddingModel: event.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="parser-field">
                <span>Embedding version</span>
                <input
                  className="form-input"
                  value={form.embeddingVersion}
                  onChange={(event) => setForm((current) => ({ ...current, embeddingVersion: event.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label className="parser-field">
                <span>Chunking profile</span>
                <select
                  className="form-select"
                  value={form.chunkingProfile}
                  onChange={(event) => setForm((current) => ({ ...current, chunkingProfile: event.target.value }))}
                  disabled={!canEdit}
                >
                  {CHUNKING_PROFILES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
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
              <button className="button button--secondary" type="button" onClick={handleSave} disabled={!canEdit || saving}>
                {saving ? "Saving..." : "Save Draft"}
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={handlePublish}
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
      </div>
    </div>
  );
}
