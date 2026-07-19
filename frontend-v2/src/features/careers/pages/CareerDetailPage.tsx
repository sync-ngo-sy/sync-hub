import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, BriefcaseBusiness, CheckCircle2, MapPin, Send } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/EmptyState'
import {
  useApplyToPublicJobMutation,
  usePublicJobQuery,
} from '@/features/careers/api/useCareersApi'
import { CareersQueryError } from '@/features/careers/components/CareersQueryError'
import { CareersShell } from '@/features/careers/components/CareersShell'
import { usePageMetadata } from '@/features/careers/hooks/usePageMetadata'
import {
  publicApplicationFormSchema,
  type PublicApplicationForm,
  type PublicApplicationFormFields,
  type PublicApplicationReceipt,
} from '@/features/careers/types'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

const routeParamsSchema = z.object({ slug: z.string().trim().min(1) }).strict()
const seniorityOptions = ['Intern', 'Junior', 'Mid', 'Senior', 'Lead', 'Principal', 'Executive']

function FormError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null
}

function DetailSkeleton() {
  return (
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,0.55fr)]"
      aria-label="Loading role"
    >
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-[36rem] rounded-xl" />
    </div>
  )
}

function ApplicationForm({ slug, enabled }: { slug: string; enabled: boolean }) {
  const [receipt, setReceipt] = useState<PublicApplicationReceipt | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const applyMutation = useApplyToPublicJobMutation()
  const form = useForm<PublicApplicationFormFields, unknown, PublicApplicationForm>({
    resolver: zodResolver(publicApplicationFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      location: '',
      currentTitle: '',
      yearsExperience: 0,
      seniority: '',
      topSkills: '',
      linkedinUrl: '',
      portfolioUrl: '',
      coverNote: '',
      consent: false,
      idempotencyKey: crypto.randomUUID(),
    },
  })

  const submit = form.handleSubmit(async (application) => {
    setUploadProgress(0)
    try {
      const nextReceipt = await applyMutation.mutateAsync({
        slug,
        application,
        onProgress: setUploadProgress,
      })
      setReceipt(nextReceipt)
    } catch (error) {
      toast.error(getUserErrorMessage(error))
    }
  })

  if (receipt) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center" aria-live="polite">
        <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
        <h2 className="text-xl font-medium">Application received</h2>
        <p className="text-sm text-muted-foreground">
          {receipt.duplicate
            ? 'We already received an application for this email and kept the original submission.'
            : 'Thanks for applying. Your profile is now in the candidate pool and your CV is queued for enrichment.'}
        </p>
      </div>
    )
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void submit(event)}>
      <fieldset className="grid gap-4" disabled={!enabled || applyMutation.isPending}>
        <legend className="sr-only">Application details</legend>
        <div className="space-y-2">
          <Label htmlFor="applicant-name">Name</Label>
          <Input id="applicant-name" autoComplete="name" {...form.register('name')} />
          <FormError message={form.formState.errors.name?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="applicant-email">Email</Label>
          <Input
            id="applicant-email"
            type="email"
            autoComplete="email"
            {...form.register('email')}
          />
          <FormError message={form.formState.errors.email?.message} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="applicant-phone">Phone</Label>
            <Input id="applicant-phone" autoComplete="tel" {...form.register('phone')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="applicant-location">Location</Label>
            <Input
              id="applicant-location"
              autoComplete="address-level2"
              {...form.register('location')}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="current-title">Current title</Label>
          <Input id="current-title" {...form.register('currentTitle')} />
          <FormError message={form.formState.errors.currentTitle?.message} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="years-experience">Years experience</Label>
            <Input
              id="years-experience"
              type="number"
              min="0"
              max="80"
              step="0.5"
              {...form.register('yearsExperience', { valueAsNumber: true })}
            />
            <FormError message={form.formState.errors.yearsExperience?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seniority">Seniority</Label>
            <select
              id="seniority"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              {...form.register('seniority')}
            >
              <option value="">Select seniority</option>
              {seniorityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <FormError message={form.formState.errors.seniority?.message} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="top-skills">Top skills</Label>
          <Input
            id="top-skills"
            placeholder="React, TypeScript, GraphQL"
            {...form.register('topSkills')}
          />
          <FormError message={form.formState.errors.topSkills?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="linkedin-url">LinkedIn</Label>
          <Input id="linkedin-url" type="url" {...form.register('linkedinUrl')} />
          <FormError message={form.formState.errors.linkedinUrl?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="portfolio-url">Portfolio</Label>
          <Input id="portfolio-url" type="url" {...form.register('portfolioUrl')} />
          <FormError message={form.formState.errors.portfolioUrl?.message} />
        </div>
        <Controller
          control={form.control}
          name="resumeFile"
          render={({ field: { onChange, onBlur, name, ref } }) => (
            <div className="space-y-2">
              <Label htmlFor="resume-file">CV upload</Label>
              <Input
                id="resume-file"
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                name={name}
                ref={ref}
                onBlur={onBlur}
                onChange={(event) => onChange(event.target.files?.item(0))}
              />
              <FormError message={form.formState.errors.resumeFile?.message} />
            </div>
          )}
        />
        <div className="space-y-2">
          <Label htmlFor="cover-note">Note</Label>
          <Textarea id="cover-note" rows={5} {...form.register('coverNote')} />
          <FormError message={form.formState.errors.coverNote?.message} />
        </div>
        <div className="flex items-start gap-3">
          <input
            id="application-consent"
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            {...form.register('consent')}
          />
          <Label htmlFor="application-consent" className="font-normal leading-relaxed">
            I consent to storing my application for recruiting review.
          </Label>
        </div>
        <FormError message={form.formState.errors.consent?.message} />
      </fieldset>

      {applyMutation.isPending ? (
        <div className="space-y-2" aria-live="polite">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Preparing CV upload</span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} />
        </div>
      ) : null}

      {!enabled ? (
        <Alert>
          <AlertTitle>Applications closed</AlertTitle>
          <AlertDescription>This role is not accepting new applications.</AlertDescription>
        </Alert>
      ) : null}

      <Button className="w-full" type="submit" disabled={!enabled || applyMutation.isPending}>
        <Send aria-hidden="true" />
        {applyMutation.isPending ? 'Submitting…' : 'Submit application'}
      </Button>
    </form>
  )
}

export function CareerDetailPage() {
  const parsedParams = routeParamsSchema.safeParse(useParams())
  const slug = parsedParams.success ? parsedParams.data.slug : null
  const jobQuery = usePublicJobQuery(slug)
  const pageTitle = jobQuery.data
    ? `${jobQuery.data.title} | SYNC Careers`
    : 'Open role | SYNC Careers'
  const pageDescription = jobQuery.data
    ? jobQuery.data.summary || jobQuery.data.description.slice(0, 155)
    : 'View an open role at SYNC Careers.'
  usePageMetadata(pageTitle, pageDescription)

  if (!slug) {
    return (
      <CareersShell>
        <EmptyState
          title="Role not available"
          detail="This job link is missing its public role identifier."
        />
      </CareersShell>
    )
  }

  return (
    <CareersShell>
      {jobQuery.isPending ? <DetailSkeleton /> : null}
      {jobQuery.isError ? (
        <CareersQueryError error={jobQuery.error} retry={() => void jobQuery.refetch()} />
      ) : null}
      {jobQuery.isSuccess ? (
        <>
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'JobPosting',
              title: jobQuery.data.title,
              description: jobQuery.data.description,
              datePosted: jobQuery.data.publishedAt,
              validThrough: jobQuery.data.applicationDeadline,
              employmentType: jobQuery.data.employmentType,
              jobLocation: {
                '@type': 'Place',
                address: {
                  '@type': 'PostalAddress',
                  addressLocality: jobQuery.data.location,
                },
              },
            })}
          </script>

          <Link
            to="/careers"
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to open roles
          </Link>
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,0.55fr)]">
            <article className="space-y-7 rounded-xl border border-border bg-card p-6 sm:p-8">
              <header>
                <p className="caption-label mb-3">Open role</p>
                <h1 className="text-3xl font-medium leading-[1.08] tracking-[-0.045em]">
                  {jobQuery.data.title}
                </h1>
                <p className="mt-4 text-base text-muted-foreground">{jobQuery.data.summary}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge variant="outline">
                    <BriefcaseBusiness aria-hidden="true" /> {jobQuery.data.employmentType}
                  </Badge>
                  <Badge variant="outline">
                    <MapPin aria-hidden="true" /> {jobQuery.data.location || 'Location flexible'}
                  </Badge>
                  <Badge variant="outline">{jobQuery.data.seniorityLevel}</Badge>
                  <Badge variant="secondary">{jobQuery.data.remotePolicy}</Badge>
                </div>
              </header>
              <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {jobQuery.data.description}
              </p>
              {jobQuery.data.keyResponsibilities.length > 0 ? (
                <section>
                  <h2 className="text-base font-medium">Key responsibilities</h2>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                    {jobQuery.data.keyResponsibilities.map((responsibility) => (
                      <li key={responsibility}>{responsibility}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </article>

            <aside>
              <Card>
                <CardHeader>
                  <CardTitle>Apply</CardTitle>
                </CardHeader>
                <CardContent>
                  <ApplicationForm slug={slug} enabled={jobQuery.data.applyEnabled} />
                </CardContent>
              </Card>
            </aside>
          </section>
        </>
      ) : null}
    </CareersShell>
  )
}
