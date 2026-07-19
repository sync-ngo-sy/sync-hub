import { ArrowRight, BriefcaseBusiness, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { CareersQueryError } from '@/features/careers/components/CareersQueryError'
import { CareersShell } from '@/features/careers/components/CareersShell'
import { usePublicJobsQuery } from '@/features/careers/api/useCareersApi'
import { usePageMetadata } from '@/features/careers/hooks/usePageMetadata'

function formatDeadline(value: string | null) {
  if (!value) {
    return 'Open'
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function CareersListSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading open roles">
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
    </div>
  )
}

export function CareersListPage() {
  const jobsQuery = usePublicJobsQuery()
  usePageMetadata(
    'Open roles | SYNC Careers',
    'Explore open roles at SYNC and apply to help build dependable talent intelligence products.',
  )

  return (
    <CareersShell>
      <header className="mb-10 max-w-2xl">
        <p className="caption-label mb-3">Careers</p>
        <h1 className="text-3xl font-medium leading-[1.08] tracking-[-0.045em]">Open roles</h1>
        <p className="mt-4 text-base text-muted-foreground">
          Join a small team building clear, dependable tools for modern recruiting work.
        </p>
      </header>

      {jobsQuery.isPending ? <CareersListSkeleton /> : null}
      {jobsQuery.isError ? (
        <CareersQueryError error={jobsQuery.error} retry={() => void jobsQuery.refetch()} />
      ) : null}
      {jobsQuery.isSuccess && jobsQuery.data.length === 0 ? (
        <EmptyState
          title="No open jobs"
          detail="There are no public roles accepting applications right now."
        />
      ) : null}

      {jobsQuery.isSuccess && jobsQuery.data.length > 0 ? (
        <section className="grid gap-4" aria-label="Open positions">
          {jobsQuery.data.map((job) => (
            <Link key={job.slug} to={`/careers/${job.slug}`} className="group block">
              <Card className="transition-colors group-hover:border-primary/40">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-medium tracking-[-0.02em]">{job.title}</h2>
                        <ArrowRight
                          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                        {job.summary || job.description.slice(0, 180)}
                      </p>
                    </div>
                    <Badge variant={job.applyEnabled ? 'default' : 'secondary'}>
                      {job.applyEnabled ? 'Apply' : 'Closed'}
                    </Badge>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Badge variant="outline">
                      <MapPin aria-hidden="true" /> {job.location || 'Location flexible'}
                    </Badge>
                    <Badge variant="outline">
                      <BriefcaseBusiness aria-hidden="true" /> {job.employmentType}
                    </Badge>
                    <Badge variant="outline">{job.seniorityLevel}</Badge>
                    <Badge variant="outline">
                      Deadline {formatDeadline(job.applicationDeadline)}
                    </Badge>
                    {job.requiredSkills.slice(0, 4).map((skill) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      ) : null}
    </CareersShell>
  )
}
