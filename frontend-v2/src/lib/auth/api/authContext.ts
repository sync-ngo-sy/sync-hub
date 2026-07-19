import { z } from 'zod'

/**
 * A membership row as the backend already assembles it
 * (`supabase/functions/_shared/auth.ts`'s `getAuthContext`/`mapTenant`) —
 * camelCase, one shape, no known legacy variant. Serves as both the wire
 * and canonical shape for this nested object; there is nothing to adapt.
 */
export const tenantMembershipSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  iconUrl: z.string().nullable(),
  // Verified against the `tenant_memberships` check constraint
  // (`supabase/migrations/20260417140000_init.sql`) plus the synthesized
  // `"platform-admin"` role `getAuthContext` assigns for platform admins.
  role: z.enum(['owner', 'admin', 'recruiter', 'viewer', 'platform-admin']),
  status: z.enum(['active', 'invited', 'disabled']),
})

export type TenantMembership = z.infer<typeof tenantMembershipSchema>

/**
 * Private wire schema for the `platform` Edge Function's `auth_context`
 * action. The only casing quirk on this endpoint is the top-level
 * `is_platform_admin` key — everything nested is already canonical. No
 * alias/fallback chain exists for this endpoint today (confirmed against
 * backend source), so there is nothing to hedge for.
 */
const wireAuthContextSchema = z.object({
  memberships: z.array(tenantMembershipSchema),
  is_platform_admin: z.boolean(),
})

export const authContextSchema = z.object({
  memberships: z.array(tenantMembershipSchema),
  isPlatformAdmin: z.boolean(),
})

export type AuthContext = z.infer<typeof authContextSchema>

const authContextAdapterSchema = wireAuthContextSchema
  .transform((wire) => ({
    memberships: wire.memberships,
    isPlatformAdmin: wire.is_platform_admin,
  }))
  .pipe(authContextSchema)

/**
 * Parses+transforms a raw `auth_context` response into the canonical shape.
 * Throws a `z.ZodError` on anything malformed — a missing required field, an
 * unrecognized `role`/`status` value, or an unexpected top-level shape all
 * fail loud rather than silently defaulting (this endpoint governs access
 * control, so a silent default here would be a privilege bug).
 */
export function parseAuthContext(raw: unknown): AuthContext {
  return authContextAdapterSchema.parse(raw)
}
