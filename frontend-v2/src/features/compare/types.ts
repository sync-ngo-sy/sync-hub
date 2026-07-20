import { z } from 'zod'

/** How the backend produced this comparison (`compare/index.ts:40,104`). */
export const comparisonSourceSchema = z.enum(['cached_artifact', 'deterministic_fallback'])

/**
 * Dossier detail for one compared candidate. Only the freshly computed
 * backend path joins `candidate_dossier_v1`, so a cached artifact's items
 * carry no detail at all — hence `comparisonItemSchema.detail` is nullable
 * rather than these fields being individually optional.
 */
export const comparisonDetailSchema = z
  .object({
    tenantId: z.string().min(1),
    name: z.string().min(1),
    currentTitle: z.string().nullable(),
    yearsExperience: z.number().min(0).max(80),
    seniority: z.string(),
    strengths: z.array(z.string()),
    risks: z.array(z.string()),
    summary: z.string(),
  })
  .strict()

export const comparisonItemSchema = z
  .object({
    candidateId: z.string().min(1),
    score: z.number(),
    matchedSkills: z.array(z.string()),
    gaps: z.array(z.string()),
    detail: comparisonDetailSchema.nullable(),
  })
  .strict()

export const comparisonSchema = z
  .object({
    source: comparisonSourceSchema,
    overlap: z.array(z.string()),
    recommendedCandidateId: z.string().min(1).nullable(),
    /** Written by the worker only; the fresh backend path has no equivalent. */
    overallSummary: z.string().nullable(),
    items: z.array(comparisonItemSchema),
  })
  .strict()

/** The backend rejects a comparison of fewer than two candidates. */
export const MINIMUM_COMPARED_CANDIDATES = 2
export const MAXIMUM_COMPARED_CANDIDATES = 8

export const compareParamsSchema = z
  .object({
    candidateIds: z.array(z.string().min(1)).max(MAXIMUM_COMPARED_CANDIDATES),
    requiredSkills: z.array(z.string().trim().min(1)).max(20),
  })
  .strict()

export type ComparisonSource = z.infer<typeof comparisonSourceSchema>
export type ComparisonDetail = z.infer<typeof comparisonDetailSchema>
export type ComparisonItem = z.infer<typeof comparisonItemSchema>
export type Comparison = z.infer<typeof comparisonSchema>
export type CompareParams = z.infer<typeof compareParamsSchema>
