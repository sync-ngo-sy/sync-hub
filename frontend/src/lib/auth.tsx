import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { appQueryClient } from "@/lib/queryClient";
import { invokePlatform } from "@/lib/api/platformClient";
import { hasSupabaseConfig, supabaseAuth } from "@/lib/supabaseClient";

const SELECTED_TENANT_KEY = "cv-intelligence.selected-tenant-id";

export type TenantMembership = {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  role: string;
  status: string;
};

type AuthContextValue = {
  enabled: boolean;
  loading: boolean;
  session: Session | null;
  userEmail: string | null;
  memberships: TenantMembership[];
  adminMemberships: TenantMembership[];
  isAdmin: boolean;
  currentTenant: TenantMembership | null;
  authError: string | null;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectTenant: (tenantId: string) => void;
  refreshTenantState: () => Promise<void>;
};

type MembershipRow = {
  tenant_id: string;
  role: string;
  status: string;
};

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  icon_url: string | null;
};

type PlatformAdminRow = {
  user_id: string;
};

type AuthContextPayload = {
  memberships?: TenantMembership[];
  is_platform_admin?: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function resolvePasswordResetRedirect() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return `${window.location.origin}${window.location.pathname}`;
}

function readStoredTenantId() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(SELECTED_TENANT_KEY);
}

function storeTenantId(tenantId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!tenantId) {
    window.localStorage.removeItem(SELECTED_TENANT_KEY);
    return;
  }

  window.localStorage.setItem(SELECTED_TENANT_KEY, tenantId);
}

function resolveCurrentTenant(memberships: TenantMembership[]) {
  const storedTenantId = readStoredTenantId();
  const storedMembership = memberships.find((membership) => membership.id === storedTenantId);
  return storedMembership ?? memberships[0] ?? null;
}

function dedupeTenantMemberships(memberships: TenantMembership[]) {
  const membershipByTenantId = new Map<string, TenantMembership>();

  for (const membership of memberships) {
    const current = membershipByTenantId.get(membership.id);
    if (!current || current.role === "platform-admin") {
      membershipByTenantId.set(membership.id, membership);
    }
  }

  return Array.from(membershipByTenantId.values());
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [currentTenant, setCurrentTenant] = useState<TenantMembership | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const lastSessionAccessTokenRef = useRef<string | null>(null);

  const refreshTenantState = useCallback(async () => {
    if (!supabaseAuth) {
      setLoading(false);
      setSession(null);
      setMemberships([]);
      setCurrentTenant(null);
      setIsPlatformAdmin(false);
      return;
    }

    const {
      data: { session: nextSession },
      error: sessionError,
    } = await supabaseAuth.auth.getSession();

    if (sessionError) {
      setAuthError(sessionError.message);
      setLoading(false);
      return;
    }

    setSession(nextSession);
    lastSessionAccessTokenRef.current = nextSession?.access_token ?? null;

    if (!nextSession) {
      appQueryClient.clear();
      setMemberships([]);
      setCurrentTenant(null);
      setIsPlatformAdmin(false);
      setAuthError(null);
      setPasswordRecovery(false);
      storeTenantId(null);
      setLoading(false);
      return;
    }

    const authContext = await invokePlatform<AuthContextPayload>("auth_context").catch((error) => {
      setAuthError(error instanceof Error ? error.message : "Unable to load tenant access.");
      return null;
    });
    if (!authContext) {
      setLoading(false);
      return;
    }

    const nextIsPlatformAdmin = Boolean(authContext.is_platform_admin);
    setIsPlatformAdmin(nextIsPlatformAdmin);
    const merged = dedupeTenantMemberships(authContext.memberships ?? [])
      .sort((left, right) => left.name.localeCompare(right.name));

    if (!merged.length && !nextIsPlatformAdmin) {
      setMemberships([]);
      setCurrentTenant(null);
      setAuthError(null);
      storeTenantId(null);
      setLoading(false);
      return;
    }

    const nextTenant = resolveCurrentTenant(merged);
    setMemberships(merged);
    setCurrentTenant(nextTenant);
    setAuthError(null);
    storeTenantId(nextTenant?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabaseAuth) {
      setLoading(false);
      return;
    }

    let active = true;
    void refreshTenantState();

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((event, nextSession) => {
      if (!active) {
        return;
      }

      if (event === "INITIAL_SESSION") {
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        setSession(nextSession);
        lastSessionAccessTokenRef.current = nextSession?.access_token ?? null;
        return;
      }

      if (event === "SIGNED_OUT") {
        appQueryClient.clear();
        setSession(null);
        setMemberships([]);
        setCurrentTenant(null);
        setIsPlatformAdmin(false);
        setAuthError(null);
        setPasswordRecovery(false);
        storeTenantId(null);
        setLoading(false);
        lastSessionAccessTokenRef.current = null;
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        setSession(nextSession);
        lastSessionAccessTokenRef.current = nextSession?.access_token ?? null;
        setPasswordRecovery(true);
        setLoading(false);
        return;
      }

      const nextAccessToken = nextSession?.access_token ?? null;
      if (nextAccessToken && nextAccessToken === lastSessionAccessTokenRef.current) {
        setSession(nextSession);
        return;
      }

      lastSessionAccessTokenRef.current = nextAccessToken;
      setSession(nextSession);
      setLoading(true);
      void refreshTenantState();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [refreshTenantState]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabaseAuth) {
      return;
    }

    const { error } = await supabaseAuth.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }

    setPasswordRecovery(false);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabaseAuth) {
      return;
    }

    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: resolvePasswordResetRedirect(),
    });

    if (error) {
      throw error;
    }
  }, []);

  const updatePassword = useCallback(
    async (password: string) => {
      if (!supabaseAuth) {
        return;
      }

      const { error } = await supabaseAuth.auth.updateUser({ password });
      if (error) {
        throw error;
      }

      setPasswordRecovery(false);
      await refreshTenantState();
    },
    [refreshTenantState],
  );

  const signOut = useCallback(async () => {
    if (!supabaseAuth) {
      return;
    }

    const { error } = await supabaseAuth.auth.signOut();
    if (error) {
      throw error;
    }

    setMemberships([]);
    setCurrentTenant(null);
    setPasswordRecovery(false);
    storeTenantId(null);
    appQueryClient.clear();
  }, []);

  const selectTenant = useCallback(
    (tenantId: string) => {
      const nextTenant = memberships.find((membership) => membership.id === tenantId) ?? null;
      setCurrentTenant(nextTenant);
      storeTenantId(nextTenant?.id ?? null);
    },
    [memberships],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled: hasSupabaseConfig,
      loading,
      session,
      userEmail: session?.user.email ?? null,
      memberships,
      adminMemberships: isPlatformAdmin ? memberships : [],
      isAdmin: isPlatformAdmin,
      currentTenant,
      authError,
      passwordRecovery,
      signIn,
      requestPasswordReset,
      updatePassword,
      signOut,
      selectTenant,
      refreshTenantState,
    }),
    [
      authError,
      currentTenant,
      isPlatformAdmin,
      loading,
      memberships,
      passwordRecovery,
      refreshTenantState,
      requestPasswordReset,
      selectTenant,
      session,
      signIn,
      signOut,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
