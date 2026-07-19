import { z } from 'zod'
import { invokeFunction, invokePlatform } from '@/lib/api/client'
import {
  searchFilterOptionsSchema,
  searchResponseSchema,
  type SearchFilterOptions,
  type SearchParams,
  type SearchResponse,
} from '@/features/search/types'

const wireSearchIntentSchema = z
  .object({
    role: z.string().nullable(),
    seniority: z.string().nullable(),
    min_years_experience: z.number().min(0).nullable(),
    location: z.string().nullable(),
    skills: z.array(z.string()),
    companies: z.array(z.string()),
  })
  .strict()

const wireSubscoresSchema = z
  .object({
    name_match: z.number(),
    contact_match: z.number(),
    company_match: z.number(),
    semantic_similarity: z.number(),
    role_match: z.number(),
    seniority_match: z.number().nullable(),
    skill_match: z.number(),
    experience_match: z.number(),
    max_chunk_rrf: z.number(),
    avg_top3_chunk_rrf: z.number(),
  })
  .strict()

const wireMatchedFiltersSchema = z
  .object({
    required_skills: z.array(z.string()),
    matched_skills: z.array(z.string()),
    required_companies: z.array(z.string()),
    matched_companies: z.array(z.string()),
    role: z.string().nullable(),
    seniority: z.string().nullable(),
    min_years_experience: z.number().min(0).nullable(),
    location: z.string().nullable(),
    tenant_ids: z.array(z.string()).optional(),
  })
  .strict()

const wireResultMetaSchema = z.union([
  z
    .object({
      rank_version: z.string().min(1),
      search_engine: z.string().min(1),
    })
    .strict(),
  z
    .object({
      rank_version: z.string().min(1),
      embedding_version: z.string().nullable(),
      parse_version: z.string().nullable(),
      normalization_version: z.string().nullable(),
      artifact_version: z.string().nullable(),
    })
    .strict(),
])

const wireEvidenceSchema = z
  .object({
    chunk_id: z.string().min(1),
    text: z.string(),
    rrf_score: z.number(),
    semantic_similarity: z.number(),
  })
  .strict()

const wireSearchResultSchema = z
  .object({
    tenant_id: z.string().min(1),
    candidate_id: z.string().min(1),
    name: z.string().min(1),
    current_title: z.string(),
    location: z.string(),
    years_experience: z.number().min(0).max(80),
    seniority: z.string(),
    primary_role: z.string(),
    score: z.number(),
    score_raw: z.number(),
    match_rate: z.number().int().min(0).max(100),
    subscores: wireSubscoresSchema,
    matched_filters: wireMatchedFiltersSchema,
    summary_short: z.string(),
    evidence: z.array(wireEvidenceSchema),
    meta: wireResultMetaSchema,
  })
  .strict()

const wireSearchResponseSchema = z
  .object({
    results: z.array(wireSearchResultSchema),
    next_cursor: z.number().int().nonnegative().nullable(),
    meta: z
      .object({
        count: z.number().int().nonnegative(),
        rank_version: z.string().min(1),
        intent_source: z.enum(['llm', 'explicit']),
        intent: wireSearchIntentSchema,
        explicit_filters: wireSearchIntentSchema,
        tenant_ids: z.array(z.string()),
        embedding_provider: z.string(),
        embedding_version: z.string().nullable(),
        search_engine: z.string().optional(),
      })
      .strict(),
  })
  .strict()

const wireSearchFilterOptionsSchema = z
  .object({
    seniority: z.array(z.string()),
    skills: z.array(z.string()),
    companies: z.array(z.string()),
    locations: z.array(z.string()),
  })
  .strict()

export function parseSearchResponse(raw: unknown): SearchResponse {
  const wire = wireSearchResponseSchema.parse(raw)
  return searchResponseSchema.parse({
    results: wire.results.map((result) => ({
      tenantId: result.tenant_id,
      candidateId: result.candidate_id,
      name: result.name,
      currentTitle: result.current_title,
      location: result.location,
      yearsExperience: result.years_experience,
      seniority: result.seniority,
      primaryRole: result.primary_role,
      matchRate: result.match_rate,
      scoreRaw: result.score_raw,
      topSkills: result.matched_filters.matched_skills,
      matchSignals: {
        semantic: result.subscores.semantic_similarity,
        skill: result.subscores.skill_match,
        experience: result.subscores.experience_match,
      },
      summary: result.summary_short,
    })),
    nextCursor: wire.next_cursor,
    meta: {
      pageCount: wire.meta.count,
      rankVersion: wire.meta.rank_version,
      intentSource: wire.meta.intent_source,
    },
  })
}

export function parseSearchFilterOptions(raw: unknown): SearchFilterOptions {
  return searchFilterOptionsSchema.parse(wireSearchFilterOptionsSchema.parse(raw))
}

function optionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function encodeSearchRequest(
  tenantIds: string[],
  params: SearchParams,
): Record<string, unknown> {
  return {
    q: params.query,
    tenant_ids: tenantIds,
    filters: {
      skills: params.skills,
      location: optionalText(params.location),
      seniority: optionalText(params.seniority),
      companies: params.company ? [params.company] : [],
    },
    limit: params.pageSize,
    offset: (params.page - 1) * params.pageSize,
    semantic: true,
  }
}

export async function fetchSearchResults(
  tenantIds: string[],
  params: SearchParams,
): Promise<SearchResponse> {
  return parseSearchResponse(await invokeFunction('search', encodeSearchRequest(tenantIds, params)))
}

export async function fetchSearchFilterOptions(tenantIds: string[]): Promise<SearchFilterOptions> {
  return parseSearchFilterOptions(
    await invokePlatform('search_filter_options', { tenant_ids: tenantIds }),
  )
}
