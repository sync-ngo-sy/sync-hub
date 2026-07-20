import { z } from 'zod'
import { invokeFunction } from '@/lib/api/client'
import { comparisonSchema, type Comparison, type CompareParams } from '@/features/compare/types'

/**
 * One compared candidate on the freshly computed path. Every field is a
 * straight passthrough of a `candidate_dossier_v1` column
 * (`supabase/functions/compare/index.ts:84-99`); only `current_title` is
 * nullable there, and `strengths`/`risks`/`summary` are coalesced by the
 * function itself.
 */
const wireFreshItemSchema = z
  .object({
    tenant_id: z.string().min(1),
    candidate_id: z.string().min(1),
    name: z.string().min(1),
    current_title: z.string().nullable(),
    years_experience: z.number().min(0).max(80),
    seniority: z.string(),
    score: z.number(),
    matched_skills: z.array(z.string()),
    gaps: z.array(z.string()),
    strengths: z.array(z.string()),
    risks: z.array(z.string()),
    summary: z.string(),
  })
  .strict()

const wireFreshComparisonSchema = z
  .object({
    source: z.literal('deterministic_fallback'),
    overlap: z.array(z.string()),
    recommended_candidate_id: z.string().nullable(),
    items: z.array(wireFreshItemSchema),
    /**
     * Validated but not mapped: `compared_count` is always `items.length`, so
     * carrying it into the canonical model would give the UI two sources for
     * one number.
     */
    meta: z.object({ compared_count: z.number().int().nonnegative() }).strict(),
  })
  .strict()

/**
 * The cached artifact body is `dataclass_to_dict(ComparisonArtifact)`
 * (`worker/src/cv_intelligence_worker/supabase.py:589-599`,
 * `schema.py:144-162`). Its items are scoring-only — no name, title,
 * experience, seniority, strengths, or risks.
 */
const wireArtifactItemSchema = z
  .object({
    candidate_id: z.string().min(1),
    score: z.number(),
    matched_skills: z.array(z.string()),
    gaps: z.array(z.string()),
    evidence_refs: z.array(z.string()),
  })
  .strict()

const wireArtifactSchema = z
  .object({
    tenant_id: z.string(),
    candidate_ids: z.array(z.string()),
    overall_summary: z.string(),
    items: z.array(wireArtifactItemSchema),
    overlap: z.array(z.string()),
    recommended_candidate_id: z.string(),
    evidence_refs: z.array(z.string()),
    artifact_version: z.string(),
  })
  .strict()

const wireCachedComparisonSchema = z
  .object({
    source: z.literal('cached_artifact'),
    artifact_key: z.string().min(1),
    artifact_version: z.string(),
    comparison: wireArtifactSchema,
  })
  .strict()

const wireComparisonSchema = z.discriminatedUnion('source', [
  wireFreshComparisonSchema,
  wireCachedComparisonSchema,
])

/** The worker writes `""` when an artifact has no ranked candidate. */
function recommendedCandidateId(value: string | null): string | null {
  if (value === null || value.length === 0) {
    return null
  }
  return value
}

export function parseComparison(raw: unknown): Comparison {
  const wire = wireComparisonSchema.parse(raw)

  if (wire.source === 'cached_artifact') {
    return comparisonSchema.parse({
      source: wire.source,
      overlap: wire.comparison.overlap,
      recommendedCandidateId: recommendedCandidateId(wire.comparison.recommended_candidate_id),
      overallSummary: wire.comparison.overall_summary,
      items: wire.comparison.items.map((item) => ({
        candidateId: item.candidate_id,
        score: item.score,
        matchedSkills: item.matched_skills,
        gaps: item.gaps,
        detail: null,
      })),
    })
  }

  return comparisonSchema.parse({
    source: wire.source,
    overlap: wire.overlap,
    recommendedCandidateId: recommendedCandidateId(wire.recommended_candidate_id),
    overallSummary: null,
    items: wire.items.map((item) => ({
      candidateId: item.candidate_id,
      score: item.score,
      matchedSkills: item.matched_skills,
      gaps: item.gaps,
      detail: {
        tenantId: item.tenant_id,
        name: item.name,
        currentTitle: item.current_title,
        yearsExperience: item.years_experience,
        seniority: item.seniority,
        strengths: item.strengths,
        risks: item.risks,
        summary: item.summary,
      },
    })),
  })
}

export function encodeCompareRequest(params: CompareParams): Record<string, unknown> {
  return {
    candidate_ids: params.candidateIds,
    required_skills: params.requiredSkills,
  }
}

export async function fetchComparison(params: CompareParams): Promise<Comparison> {
  return parseComparison(await invokeFunction('compare', encodeCompareRequest(params)))
}
