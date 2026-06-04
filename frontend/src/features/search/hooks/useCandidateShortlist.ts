import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TenantMembership } from "@/lib/auth";
import type { CandidateSearchResult, CandidateShortlistInput, CandidateShortlistItem } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { shortlistKey } from "@/features/search/searchState";

type UseCandidateShortlistOptions = {
  currentTenant: TenantMembership | null;
  currentWorkspace: TenantMembership | null;
  draftQuery: string;
  requestQuery?: string;
  resolvedTenantIds: string[];
  scopeKey: string;
};

export function useCandidateShortlist({
  currentTenant,
  currentWorkspace,
  draftQuery,
  requestQuery,
  resolvedTenantIds,
  scopeKey,
}: UseCandidateShortlistOptions) {
  const queryClient = useQueryClient();
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const queryKey = useMemo(() => ["shortlist", scopeKey] as const, [scopeKey]);
  const shortlistQuery = useQuery({
    queryKey,
    queryFn: () => platformApi.getShortlist(resolvedTenantIds),
    staleTime: 60 * 1000,
  });
  const items = shortlistQuery.data ?? [];
  const loading = shortlistQuery.isLoading && !shortlistQuery.data;
  const keys = useMemo(() => new Set(items.map((item) => shortlistKey(item.tenantId, item.candidateId))), [items]);
  const clearing = pendingKeys.has("clear-shortlist");

  const saveMutation = useMutation({
    mutationFn: (item: CandidateShortlistInput) => platformApi.saveShortlistItem(item),
    onSuccess: (saved) => {
      queryClient.setQueryData<CandidateShortlistItem[]>(queryKey, (current = []) => {
        const key = shortlistKey(saved.tenantId, saved.candidateId);
        const withoutExisting = current.filter((item) => shortlistKey(item.tenantId, item.candidateId) !== key);
        return [saved, ...withoutExisting];
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (item: { candidateId: string; tenantId: string }) => platformApi.removeShortlistItem(item.candidateId, item.tenantId),
    onSuccess: (_result, item) => {
      queryClient.setQueryData<CandidateShortlistItem[]>(queryKey, (current = []) =>
        current.filter((shortlistItem) => shortlistKey(shortlistItem.tenantId, shortlistItem.candidateId) !== shortlistKey(item.tenantId, item.candidateId)),
      );
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => platformApi.clearShortlist(resolvedTenantIds),
    onSuccess: () => {
      queryClient.setQueryData<CandidateShortlistItem[]>(queryKey, []);
    },
  });

  useEffect(() => {
    if (!items.length && !error) {
      setDrawerOpen(false);
    }
  }, [error, items.length]);

  useEffect(() => {
    setDrawerOpen(false);
    setError(null);
  }, [scopeKey]);

  useEffect(() => {
    if (shortlistQuery.error) {
      setError(String(shortlistQuery.error));
    } else if (!pendingKeys.size) {
      setError(null);
    }
  }, [pendingKeys.size, shortlistQuery.error]);

  function resolveCandidateTenantId(candidate: CandidateSearchResult) {
    return candidate.tenantId ?? currentWorkspace?.id ?? currentTenant?.id ?? resolvedTenantIds[0] ?? null;
  }

  function buildShortlistInput(candidate: CandidateSearchResult, tenantId: string): CandidateShortlistInput {
    return {
      tenantId,
      candidateId: candidate.candidateId,
      candidateName: candidate.name,
      currentTitle: candidate.currentTitle,
      location: candidate.location,
      yearsExperience: candidate.yearsExperience,
      seniority: candidate.seniority,
      primaryRole: candidate.primaryRole,
      topSkills: candidate.topSkills,
      matchRate: candidate.backendMatchRate,
      sourceQuery: requestQuery ?? draftQuery.trim(),
      searchSnapshot: {
        headline: candidate.headline,
        shortSummary: candidate.shortSummary,
        matchSignals: candidate.matchSignals,
        matchNarrative: candidate.matchNarrative,
        stage: candidate.stage,
      },
    };
  }

  async function toggleCandidate(candidate: CandidateSearchResult) {
    const tenantId = resolveCandidateTenantId(candidate);
    if (!tenantId) {
      setError("Select a workspace before adding candidates to your shortlist.");
      return;
    }

    const key = shortlistKey(tenantId, candidate.candidateId);
    const isShortlisted = keys.has(key);
    setError(null);
    setPendingKeys((current) => new Set(current).add(key));

    try {
      if (isShortlisted) {
        await removeMutation.mutateAsync({ candidateId: candidate.candidateId, tenantId });
      } else {
        await saveMutation.mutateAsync(buildShortlistInput(candidate, tenantId));
      }
    } catch (nextError) {
      setError(`Shortlist update failed: ${String(nextError)}`);
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function removeItem(item: CandidateShortlistItem) {
    const key = shortlistKey(item.tenantId, item.candidateId);
    setError(null);
    setPendingKeys((current) => new Set(current).add(key));
    try {
      await removeMutation.mutateAsync({ candidateId: item.candidateId, tenantId: item.tenantId });
    } catch (nextError) {
      setError(`Shortlist update failed: ${String(nextError)}`);
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function openCv(item: CandidateShortlistItem) {
    const key = `cv:${shortlistKey(item.tenantId, item.candidateId)}`;
    setError(null);
    setPendingKeys((current) => new Set(current).add(key));

    try {
      const documentUrl = await platformApi.getOriginalDocumentUrl(null, item.cvUrl, {
        candidateId: item.candidateId,
        tenantId: item.tenantId,
      });
      if (!documentUrl) {
        throw new Error("The original CV is not available from browser-accessible storage yet.");
      }
      window.open(documentUrl, "_blank", "noopener,noreferrer");
    } catch (nextError) {
      setError(`Could not open CV: ${String(nextError)}`);
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function clear() {
    if (!items.length) {
      return;
    }

    const pendingKey = "clear-shortlist";
    setError(null);
    setPendingKeys((current) => new Set(current).add(pendingKey));
    try {
      await clearMutation.mutateAsync();
      setDrawerOpen(false);
    } catch (nextError) {
      setError(`Could not clear shortlist: ${String(nextError)}`);
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(pendingKey);
        return next;
      });
    }
  }

  return {
    clearing,
    drawerOpen,
    error,
    items,
    keys,
    loading,
    pendingKeys,
    clear,
    openCv,
    removeItem,
    resolveCandidateTenantId,
    setDrawerOpen,
    toggleCandidate,
  };
}
