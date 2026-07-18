import type { SupabaseClient } from "@supabase/supabase-js";

export async function getCurrentUserId(
  supabase: SupabaseClient,
): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Authentication is required.");
  return user.id;
}

export async function getAuthContext(supabase: SupabaseClient) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return { memberships: [], is_platform_admin: false };

  const [membershipResult, platformAdminResult] = await Promise.all([
    supabase.from("tenant_memberships").select("tenant_id, role, status").eq(
      "user_id",
      user.id,
    ).eq("status", "active"),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (membershipResult.error) throw membershipResult.error;

  const adminError = platformAdminResult.error;
  if (
    adminError && !/platform_admins/i.test(adminError.message) &&
    adminError.code !== "PGRST205"
  ) {
    throw adminError;
  }

  type MembershipRow = { tenant_id: string; role: string; status: string };
  type TenantRow = {
    id: string;
    slug: string;
    name: string;
    icon_url: string | null;
  };

  const membershipRows = (membershipResult.data as MembershipRow[]) ?? [];
  const isPlatformAdmin = Boolean(platformAdminResult.data?.user_id);

  if (!membershipRows.length && !isPlatformAdmin) {
    return { memberships: [], is_platform_admin: false };
  }

  const tenantIds = membershipRows.map((m) => m.tenant_id).filter(Boolean);
  const tenantQuery = supabase.from("tenants").select(
    "id, slug, name, icon_url",
  );
  const tenantResult = isPlatformAdmin
    ? await tenantQuery.order("name")
    : await tenantQuery.in("id", tenantIds);

  if (tenantResult.error) throw tenantResult.error;

  const tenantRows = (tenantResult.data as TenantRow[]) ?? [];
  const tenantMap = new Map(tenantRows.map((t) => [t.id, t]));

  const mapTenant = (t: TenantRow, role: string, status: string) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    iconUrl: t.icon_url,
    role,
    status,
  });

  const memberships = membershipRows.flatMap((m) => {
    const t = tenantMap.get(m.tenant_id);
    return t ? [mapTenant(t, m.role, m.status)] : [];
  });

  if (isPlatformAdmin) {
    memberships.push(
      ...tenantRows.map((t) => mapTenant(t, "platform-admin", "active")),
    );
  }

  return { memberships, is_platform_admin: isPlatformAdmin };
}
