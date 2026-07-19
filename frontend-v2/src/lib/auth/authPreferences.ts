import { z } from 'zod'

const AUTH_PREFERENCES_STORAGE_KEY = 'frontend-v2.auth.preferences'
const AUTH_PREFERENCES_VERSION = 1

export const scopeModeSchema = z.enum(['current', 'all'])
export type ScopeMode = z.infer<typeof scopeModeSchema>

const authPreferencesSchema = z.object({
  selectedTenantId: z.string().min(1).nullable(),
  scopeMode: scopeModeSchema,
})

export type AuthPreferences = z.infer<typeof authPreferencesSchema>

const storedAuthPreferencesSchema = authPreferencesSchema
  .extend({ version: z.literal(AUTH_PREFERENCES_VERSION) })
  .strict()

const defaultAuthPreferences: AuthPreferences = {
  selectedTenantId: null,
  scopeMode: 'current',
}

export function readAuthPreferences(): AuthPreferences {
  const raw = window.localStorage.getItem(AUTH_PREFERENCES_STORAGE_KEY)
  if (!raw) {
    return { ...defaultAuthPreferences }
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    const result = storedAuthPreferencesSchema.safeParse(parsed)
    if (result.success) {
      return {
        selectedTenantId: result.data.selectedTenantId,
        scopeMode: result.data.scopeMode,
      }
    }
  } catch {
    // Storage is an untrusted boundary. Invalid JSON uses safe defaults.
  }

  return { ...defaultAuthPreferences }
}

export function saveAuthPreferences(preferences: AuthPreferences): void {
  const stored = storedAuthPreferencesSchema.parse({
    version: AUTH_PREFERENCES_VERSION,
    ...preferences,
  })
  window.localStorage.setItem(AUTH_PREFERENCES_STORAGE_KEY, JSON.stringify(stored))
}

export function clearAuthPreferences(): void {
  window.localStorage.removeItem(AUTH_PREFERENCES_STORAGE_KEY)
}
