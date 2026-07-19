import { useMutation, useQuery } from '@tanstack/react-query'
import {
  encodePublicApplication,
  parsePublicJobDetail,
  parsePublicJobList,
  parsePublicJobReceipt,
} from '@/features/careers/api/careersApi'
import type { PublicApplicationForm } from '@/features/careers/types'
import { invokeFunction } from '@/lib/api/client'

export function usePublicJobsQuery() {
  return useQuery({
    queryKey: ['careers', 'public-jobs'],
    queryFn: async () =>
      parsePublicJobList(await invokeFunction('public-jobs', { action: 'list' })),
  })
}

export function usePublicJobQuery(slug: string | null) {
  return useQuery({
    queryKey: ['careers', 'public-job', slug],
    queryFn: async () =>
      parsePublicJobDetail(await invokeFunction('public-jobs', { action: 'detail', slug })),
    enabled: slug !== null,
  })
}

export function useApplyToPublicJobMutation() {
  return useMutation({
    mutationFn: async ({
      slug,
      application,
      onProgress,
    }: {
      slug: string
      application: PublicApplicationForm
      onProgress?: (progress: number) => void
    }) => {
      const encoded = await encodePublicApplication(application, onProgress)
      return parsePublicJobReceipt(
        await invokeFunction('public-jobs', { action: 'apply', slug, application: encoded }),
      )
    },
  })
}
