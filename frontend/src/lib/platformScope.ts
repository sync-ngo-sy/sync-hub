import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";

const PLATFORM_SCOPE_KEY = "cv-intelligence.platform-scope-mode";

export type PlatformScopeMode = "current" | "all";

function readStoredScopeMode(): PlatformScopeMode {
  if (typeof window === "undefined") {
    return "current";
  }

  const raw = window.localStorage.getItem(PLATFORM_SCOPE_KEY);
  return raw === "all" ? "all" : "current";
}

function storeScopeMode(mode: PlatformScopeMode) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PLATFORM_SCOPE_KEY, mode);
}

export function usePlatformScope() {
  const { adminMemberships, currentTenant, isAdmin, selectTenant } = useAuth();
  const [scopeMode, setScopeModeState] = useState<PlatformScopeMode>(() => readStoredScopeMode());

  useEffect(() => {
    if (!isAdmin) {
      setScopeModeState("current");
      return;
    }

    const stored = readStoredScopeMode();
    setScopeModeState(stored);
  }, [isAdmin]);

  const workspaceOptions = adminMemberships;
  const resolvedTenantIds = useMemo(() => {
    if (!currentTenant?.id) {
      return [];
    }

    if (isAdmin && scopeMode === "all") {
      return workspaceOptions.map((membership) => membership.id);
    }

    return [currentTenant.id];
  }, [currentTenant?.id, isAdmin, scopeMode, workspaceOptions]);

  const setScopeMode = (mode: PlatformScopeMode) => {
    const nextMode = isAdmin ? mode : "current";
    setScopeModeState(nextMode);
    storeScopeMode(nextMode);
  };

  const setWorkspaceId = (tenantId: string) => {
    selectTenant(tenantId);
  };

  return {
    isPlatformAdmin: isAdmin,
    scopeMode: isAdmin ? scopeMode : ("current" as const),
    setScopeMode,
    workspaceOptions,
    currentWorkspace: currentTenant,
    setWorkspaceId,
    resolvedTenantIds,
    isAllScope: isAdmin && scopeMode === "all",
  };
}
