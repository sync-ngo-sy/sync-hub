import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

const MEMBERSHIP_ROLES = new Set(["owner", "admin", "recruiter", "viewer"]);

export function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 48);
}

export function createServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for account provisioning.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function assertPlatformAdmin(supabase: SupabaseClient) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }
  if (!user) {
    throw new Error("Authentication is required.");
  }

  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    error &&
    !/platform_admins/i.test(error.message) &&
    error.code !== "PGRST205"
  ) {
    throw error;
  }
  if (!data?.user_id) {
    throw new Error("Platform admin access is required.");
  }

  return user;
}

function normalizeRole(value: unknown, fallback = "owner") {
  const role = typeof value === "string" ? value.trim() : "";
  return MEMBERSHIP_ROLES.has(role) ? role : fallback;
}

async function createAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
  fullName: string,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (error) {
    throw error;
  }
  const userId = data.user?.id;
  if (!userId) {
    throw new Error("Supabase did not return a user id.");
  }
  return userId;
}

export async function listAdminTenants(admin: SupabaseClient) {
  const [tenantsResult, membershipsResult, candidatesResult, documentsResult] =
    await Promise.all([
      admin
        .from("tenants")
        .select("id, slug, name, icon_url, created_at")
        .order("created_at", { ascending: false })
        .limit(10000),
      admin.from("tenant_memberships").select("tenant_id").limit(10000),
      admin.from("candidates").select("tenant_id").limit(10000),
      admin.from("source_documents").select("tenant_id").limit(10000),
    ]);

  if (tenantsResult.error) {
    throw tenantsResult.error;
  }
  if (membershipsResult.error) {
    throw membershipsResult.error;
  }
  if (candidatesResult.error) {
    throw candidatesResult.error;
  }
  if (documentsResult.error) {
    throw documentsResult.error;
  }

  const membershipCounts = new Map<string, number>();
  const candidateCounts = new Map<string, number>();
  const documentCounts = new Map<string, number>();

  for (const row of membershipsResult.data ?? []) {
    const tenantId = String(row.tenant_id ?? "");
    membershipCounts.set(tenantId, (membershipCounts.get(tenantId) ?? 0) + 1);
  }
  for (const row of candidatesResult.data ?? []) {
    const tenantId = String(row.tenant_id ?? "");
    candidateCounts.set(tenantId, (candidateCounts.get(tenantId) ?? 0) + 1);
  }
  for (const row of documentsResult.data ?? []) {
    const tenantId = String(row.tenant_id ?? "");
    documentCounts.set(tenantId, (documentCounts.get(tenantId) ?? 0) + 1);
  }

  return (tenantsResult.data ?? []).map((tenant) => ({
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    iconUrl: tenant.icon_url ?? "",
    createdAt: tenant.created_at,
    membershipCount: membershipCounts.get(tenant.id) ?? 0,
    candidateCount: candidateCounts.get(tenant.id) ?? 0,
    documentCount: documentCounts.get(tenant.id) ?? 0,
  }));
}

export async function createTenantAccount(
  admin: SupabaseClient,
  body: JsonRecord,
) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const tenantName = typeof body.tenant_name === "string"
    ? body.tenant_name.trim()
    : "";
  const tenantSlugInput = typeof body.tenant_slug === "string"
    ? body.tenant_slug.trim()
    : "";
  const tenantIcon = typeof body.tenant_icon === "string"
    ? body.tenant_icon.trim()
    : "";
  const fullName = typeof body.full_name === "string"
    ? body.full_name.trim()
    : "";
  const role = normalizeRole(body.role, "owner");

  if (!email) {
    throw new Error("email is required");
  }
  if (!password) {
    throw new Error("password is required");
  }
  if (!tenantName) {
    throw new Error("tenant_name is required");
  }

  const tenantSlug = tenantSlugInput || slugify(tenantName);
  if (!tenantSlug) {
    throw new Error(
      "Could not derive a tenant slug. Pass tenant_slug explicitly.",
    );
  }

  const userId = await createAuthUser(admin, email, password, fullName);

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({
      name: tenantName,
      slug: tenantSlug,
      created_by: userId,
      icon_url: tenantIcon || null,
    })
    .select("id, slug, name, icon_url")
    .single();

  if (tenantError) {
    throw tenantError;
  }

  const { error: membershipError } = await admin
    .from("tenant_memberships")
    .insert({
      tenant_id: tenant.id,
      user_id: userId,
      role,
      status: "active",
    });
  if (membershipError) {
    throw membershipError;
  }

  return {
    userId,
    email,
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    tenantIcon: tenant.icon_url ?? "",
    role,
    folderName: tenant.slug,
  };
}

export async function addUserToTenant(admin: SupabaseClient, body: JsonRecord) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const tenantSlug = typeof body.tenant_slug === "string"
    ? body.tenant_slug.trim()
    : "";
  const fullName = typeof body.full_name === "string"
    ? body.full_name.trim()
    : "";
  const role = normalizeRole(body.role, "recruiter");

  if (!email) {
    throw new Error("email is required");
  }
  if (!password) {
    throw new Error("password is required");
  }
  if (!tenantSlug) {
    throw new Error("tenant_slug is required");
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id, slug, name, icon_url")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (tenantError) {
    throw tenantError;
  }
  if (!tenant) {
    throw new Error(`Could not find tenant with slug '${tenantSlug}'.`);
  }

  const userId = await createAuthUser(admin, email, password, fullName);

  const { error: membershipError } = await admin
    .from("tenant_memberships")
    .insert({
      tenant_id: tenant.id,
      user_id: userId,
      role,
      status: "active",
    });
  if (membershipError) {
    throw membershipError;
  }

  return {
    userId,
    email,
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    tenantIcon: tenant.icon_url ?? "",
    role,
    folderName: tenant.slug,
  };
}
