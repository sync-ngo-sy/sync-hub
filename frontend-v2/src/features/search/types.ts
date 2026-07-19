import { z } from 'zod'

export const searchSortSchema = z.enum(['matchRate', 'name', 'yearsExperience'])
export const searchDirectionSchema = z.enum(['asc', 'desc'])

export const searchParamsSchema = z
  .object({
    query: z.string().trim().max(300),
    skills: z.array(z.string().trim().min(1)).max(20),
    location: z.string().trim().max(180),
    seniority: z.string().trim().max(80),
    company: z.string().trim().max(180),
    sort: searchSortSchema,
    direction: searchDirectionSchema,
    page: z.number().int().positive().max(10_000),
    pageSize: z.union([z.literal(20), z.literal(50)]),
  })
  .strict()

export const searchResultSchema = z
  .object({
    tenantId: z.string().min(1),
    candidateId: z.string().min(1),
    name: z.string().min(1),
    currentTitle: z.string(),
    location: z.string(),
    yearsExperience: z.number().min(0).max(80),
    seniority: z.string(),
    primaryRole: z.string(),
    matchRate: z.number().int().min(0).max(100),
    scoreRaw: z.number(),
    topSkills: z.array(z.string()),
    matchSignals: z
      .object({ semantic: z.number(), skill: z.number(), experience: z.number() })
      .strict(),
    summary: z.string(),
  })
  .strict()

export const searchResponseSchema = z
  .object({
    results: z.array(searchResultSchema),
    nextCursor: z.number().int().nonnegative().nullable(),
    meta: z
      .object({
        pageCount: z.number().int().nonnegative(),
        rankVersion: z.string().min(1),
        intentSource: z.enum(['llm', 'explicit']),
      })
      .strict(),
  })
  .strict()

export const searchFilterOptionsSchema = z
  .object({
    seniority: z.array(z.string()),
    skills: z.array(z.string()),
    companies: z.array(z.string()),
    locations: z.array(z.string()),
  })
  .strict()

export const searchCsvRowSchema = searchResultSchema.pick({
  name: true,
  currentTitle: true,
  location: true,
  yearsExperience: true,
  seniority: true,
  primaryRole: true,
  matchRate: true,
  topSkills: true,
})

export type SearchParams = z.infer<typeof searchParamsSchema>
export type SearchResult = z.infer<typeof searchResultSchema>
export type SearchResponse = z.infer<typeof searchResponseSchema>
export type SearchFilterOptions = z.infer<typeof searchFilterOptionsSchema>
export type SearchCsvRow = z.infer<typeof searchCsvRowSchema>
