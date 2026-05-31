import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { ParserProfile, ParserProfileInput } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { createDefaultProfile, slugifyProfile } from "@/features/parsing/utils/parserProfiles";

export function useParsingLab() {
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
    setForm({
      ...createDefaultProfile(seed),
      id: undefined,
      name: seed ? `${seed.name} Draft` : "New parser draft",
      slug: seed ? `${seed.slug}-draft` : "new-parser-draft",
      description: seed?.description ?? "",
      notes: seed ? `Forked from ${seed.name} (${workspaceNameById.get(seed.tenantId) ?? "Unknown workspace"}).` : "",
    });
    setNotice(null);
    setError(null);
  }

  async function handleSave() {
    if (!resolvedWorkspaceId || !canEdit) {
      return;
    }

    const payload: ParserProfileInput = {
      ...form,
      slug: slugifyProfile(form.slug || form.name),
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

  return {
    activeProfile,
    adminMemberships,
    canEdit,
    enabled,
    error,
    fetching,
    form,
    handleCreateDraft,
    handlePublish,
    handleSave,
    handleSelectProfile,
    isAdmin,
    loading,
    notice,
    profiles,
    publishing,
    resolvedWorkspaceName,
    saving,
    selectedId,
    selectedProfile,
    setForm,
    workspaceNameById,
    workspacesRepresented,
  };
}
