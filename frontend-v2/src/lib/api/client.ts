import { FunctionsHttpError } from '@supabase/supabase-js'
import { z } from 'zod'
import { getSupabaseClient, hasSupabaseConfig } from '@/lib/supabaseClient'

const errorPayloadSchema = z.object({
  details: z.string().trim().min(1).optional(),
  error: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1).optional(),
})

/**
 * Normalized shape for every transport failure: a network error, a relay
 * error, or an Edge Function returning a non-2xx status. `status` is `0`
 * when no HTTP response was ever received (network/relay failure or missing
 * config).
 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    const serialized = JSON.stringify(error)
    if (serialized) {
      return serialized
    }
  } catch {
    // A circular or otherwise unserializable value has no safe detail.
  }
  return 'Unknown error'
}

function extractErrorDetail(payload: unknown): string | null {
  const result = errorPayloadSchema.safeParse(payload)
  if (!result.success) {
    return null
  }
  return result.data.details ?? result.data.error ?? result.data.message ?? null
}

async function readHttpError(
  error: FunctionsHttpError,
): Promise<{ detail: string | null; status: number }> {
  const context: unknown = error.context
  if (!(context instanceof Response)) {
    return { detail: null, status: 0 }
  }

  const payload: unknown = await context.json().catch(() => null)
  return { detail: extractErrorDetail(payload), status: context.status }
}

/**
 * Invokes one Supabase Edge Function and returns its successful JSON body as
 * `unknown` — never a generic `<T>` cast, never a casing conversion, never a
 * domain schema, never a fallback value. Callers (feature `api/` adapters)
 * are responsible for parsing the result with their own wire schema.
 *
 * Auth is attached automatically by the Supabase client (the current
 * session's access token, or the publishable key when signed out) — nothing
 * extra to configure here.
 */
export async function invokeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (!hasSupabaseConfig) {
    throw new ApiError('The app is not configured.', 0)
  }

  const result = await getSupabaseClient().functions.invoke<unknown>(name, { body })
  const error: unknown = result.error

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const { detail, status } = await readHttpError(error)
      throw new ApiError(detail ?? `Request to "${name}" failed with status ${status}.`, status)
    }

    throw new ApiError(`Request to "${name}" failed: ${describeUnknownError(error)}`, 0)
  }

  return result.data
}

/** Invokes the `platform` aggregator Edge Function with the given action. */
export async function invokePlatform(
  action: string,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  return invokeFunction('platform', { action, ...body })
}
