import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "@/lib/supabaseClient";

const SELECTED_TENANT_KEY = "cv-intelligence.selected-tenant-id";

export type TenantMembership = {
  id: string;
  slug: string;
  name: string;
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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  bootstrapTenant: (name: string, slug?: string) => Promise<void>;
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
};

type PlatformAdminRow = {
  user_id: string;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 48);
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

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [currentTenant, setCurrentTenant] = useState<TenantMembership | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshTenantState = useCallback(async () => {
    if (!supabase) {
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
    } = await supabase.auth.getSession();

    if (sessionError) {
      setAuthError(sessionError.message);
      setLoading(false);
      return;
    }

    setSession(nextSession);

    if (!nextSession) {
      setMemberships([]);
      setCurrentTenant(null);
      setIsPlatformAdmin(false);
      setAuthError(null);
      storeTenantId(null);
      setLoading(false);
      return;
    }

    const [membershipResult, platformAdminResult] = await Promise.all([
      supabase
        .from("tenant_memberships")
        .select("tenant_id, role, status")
        .eq("status", "active"),
      supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", nextSession.user.id)
        .maybeSingle(),
    ]);

    if (membershipResult.error) {
      setAuthError(membershipResult.error.message);
      setLoading(false);
      return;
    }
    const platformAdminQueryFailed =
      platformAdminResult.error &&
      !/platform_admins/i.test(platformAdminResult.error.message) &&
      platformAdminResult.error.code !== "PGRST205";

    if (platformAdminQueryFailed) {
      setAuthError(platformAdminResult.error.message);
      setLoading(false);
      return;
    }

    const membershipRows = (membershipResult.data ?? []) as MembershipRow[];
    const platformAdminRow = platformAdminResult.error ? null : (platformAdminResult.data as PlatformAdminRow | null);
    const nextIsPlatformAdmin = Boolean(platformAdminRow?.user_id);
    setIsPlatformAdmin(nextIsPlatformAdmin);

    if (!membershipRows.length && !nextIsPlatformAdmin) {
      setMemberships([]);
      setCurrentTenant(null);
      setAuthError(null);
      storeTenantId(null);
      setLoading(false);
      return;
    }

    const tenantResult = nextIsPlatformAdmin
      ? await supabase.from("tenants").select("id, slug, name").order("name")
      : await supabase.from("tenants").select("id, slug, name").in("id", membershipRows.map((membership) => membership.tenant_id));

    if (tenantResult.error) {
      setAuthError(tenantResult.error.message);
      setLoading(false);
      return;
    }

    const tenantRows = (tenantResult.data ?? []) as TenantRow[];
    const tenantMap = new Map(tenantRows.map((tenant) => [tenant.id, tenant]));
    const mergedMemberships = membershipRows
      .map((membership) => {
        const tenant = tenantMap.get(membership.tenant_id);
        if (!tenant) {
          return null;
        }

        return {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          role: membership.role,
          status: membership.status,
        } satisfies TenantMembership;
      })
      .filter((membership): membership is TenantMembership => Boolean(membership));

    const merged = nextIsPlatformAdmin
      ? [
          ...mergedMemberships,
          ...tenantRows
            .filter((tenant) => !mergedMemberships.some((membership) => membership.id === tenant.id))
            .map((tenant) => ({
              id: tenant.id,
              slug: tenant.slug,
              name: tenant.name,
              role: "platform-admin",
              status: "active",
            }) satisfies TenantMembership),
        ].sort((left, right) => left.name.localeCompare(right.name))
      : mergedMemberships;

    const nextTenant = resolveCurrentTenant(merged);
    setMemberships(merged);
    setCurrentTenant(nextTenant);
    setAuthError(null);
    storeTenantId(nextTenant?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    void refreshTenantState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }

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
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }

    if (!data.session) {
      return "Account created. Confirm the email if your auth configuration requires verification.";
    }

    return "Account created. You are signed in and can finish tenant setup.";
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }

    setMemberships([]);
    setCurrentTenant(null);
    storeTenantId(null);
  }, []);

  const bootstrapTenant = useCallback(
    async (name: string, slug?: string) => {
      if (!supabase) {
        return;
      }

      const normalizedName = name.trim();
      const normalizedSlug = slugify(slug?.trim() || normalizedName);

      if (!normalizedName) {
        throw new Error("Tenant name is required.");
      }

      const { error } = await supabase.rpc("bootstrap_tenant_v1", {
        p_name: normalizedName,
        p_slug: normalizedSlug,
      });

      if (error) {
        throw error;
      }

      await refreshTenantState();
    },
    [refreshTenantState],
  );

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
      signIn,
      signUp,
      signOut,
      bootstrapTenant,
      selectTenant,
      refreshTenantState,
    }),
    [authError, bootstrapTenant, currentTenant, isPlatformAdmin, loading, memberships, refreshTenantState, selectTenant, session, signIn, signOut, signUp],
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
