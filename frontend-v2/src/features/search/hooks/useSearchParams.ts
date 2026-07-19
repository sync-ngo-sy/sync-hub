import { useCallback, useMemo } from 'react'
import { useSearchParams as useRouterSearchParams } from 'react-router-dom'
import { z } from 'zod'
import {
  searchDirectionSchema,
  searchParamsSchema,
  searchSortSchema,
  type SearchParams,
} from '@/features/search/types'

const skillsUrlSchema = z.string().transform((value) =>
  Array.from(
    new Set(
      value
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20),
)

const positiveIntegerSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(10_000))

const pageSizeUrlSchema = z
  .enum(['20', '50'])
  .transform(Number)
  .pipe(z.union([z.literal(20), z.literal(50)]))

export const searchUrlStateSchema = z
  .object({
    q: z.string().trim().max(300).catch(''),
    skills: skillsUrlSchema.catch([]),
    location: z.string().trim().max(180).catch(''),
    seniority: z.string().trim().max(80).catch(''),
    company: z.string().trim().max(180).catch(''),
    sort: searchSortSchema.catch('matchRate'),
    direction: searchDirectionSchema.catch('desc'),
    page: positiveIntegerSchema.catch(1),
    pageSize: pageSizeUrlSchema.catch(20),
  })
  .transform((value) =>
    searchParamsSchema.parse({
      query: value.q,
      skills: value.skills,
      location: value.location,
      seniority: value.seniority,
      company: value.company,
      sort: value.sort,
      direction: value.direction,
      page: value.page,
      pageSize: value.pageSize,
    }),
  )

const defaultParams = searchParamsSchema.parse({
  query: '',
  skills: [],
  location: '',
  seniority: '',
  company: '',
  sort: 'matchRate',
  direction: 'desc',
  page: 1,
  pageSize: 20,
})

function readSearchParams(searchParams: URLSearchParams): SearchParams {
  return searchUrlStateSchema.parse({
    q: searchParams.get('q') ?? '',
    skills: searchParams.get('skills') ?? '',
    location: searchParams.get('location') ?? '',
    seniority: searchParams.get('seniority') ?? '',
    company: searchParams.get('company') ?? '',
    sort: searchParams.get('sort') ?? 'matchRate',
    direction: searchParams.get('direction') ?? 'desc',
    page: searchParams.get('page') ?? '1',
    pageSize: searchParams.get('pageSize') ?? '20',
  })
}

function writeSearchParams(params: SearchParams): URLSearchParams {
  const next = new URLSearchParams()
  if (params.query) next.set('q', params.query)
  if (params.skills.length) next.set('skills', params.skills.join(','))
  if (params.location) next.set('location', params.location)
  if (params.seniority) next.set('seniority', params.seniority)
  if (params.company) next.set('company', params.company)
  if (params.sort !== defaultParams.sort) next.set('sort', params.sort)
  if (params.direction !== defaultParams.direction) next.set('direction', params.direction)
  if (params.page !== defaultParams.page) next.set('page', String(params.page))
  if (params.pageSize !== defaultParams.pageSize) next.set('pageSize', String(params.pageSize))
  return next
}

export function useSearchParams() {
  const [searchParams, setSearchParams] = useRouterSearchParams()
  const params = useMemo(() => readSearchParams(searchParams), [searchParams])

  const updateParams = useCallback(
    (patch: Partial<SearchParams>, resetPage = true) => {
      const next = searchParamsSchema.parse({
        ...params,
        ...patch,
        page: resetPage ? 1 : (patch.page ?? params.page),
      })
      setSearchParams(writeSearchParams(next))
    },
    [params, setSearchParams],
  )

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams())
  }, [setSearchParams])

  return { params, updateParams, clearFilters }
}
