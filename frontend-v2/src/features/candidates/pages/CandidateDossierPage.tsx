import { useState, type KeyboardEvent } from 'react'
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FileText,
  Languages,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import {
  useCandidateDossierQuery,
  useOriginalDocumentMutation,
} from '@/features/candidates/api/useCandidatesApi'
import type { CandidateDossier } from '@/features/candidates/types'
import { ApiError } from '@/lib/api/client'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

type DossierTab = 'overview' | 'timeline' | 'skills' | 'evidence'

const tabs: { id: DossierTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'skills', label: 'Skills' },
  { id: 'evidence', label: 'Evidence' },
]

const externalProfileLabels: Record<string, string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio',
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function yearsLabel(years: number): string {
  return `${years.toLocaleString()} ${years === 1 ? 'year' : 'years'}`
}

function DossierSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading candidate dossier">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </header>
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row">
          <Skeleton className="size-16 rounded-2xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-64 max-w-full" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-5 w-80 max-w-full" />
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

function ProfileSummary({ candidate }: { candidate: CandidateDossier }) {
  const summary = candidate.aiProfileSummary ?? candidate.summary
  const salary = candidate.expectedSalary
    ? `${candidate.expectedSalary.currency} ${candidate.expectedSalary.amount.toLocaleString()}`
    : 'Not specified'
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Grounded profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="leading-relaxed text-muted-foreground">
              {summary || 'No profile summary is available.'}
            </p>
            {candidate.aiProfileSummary && candidate.summary !== candidate.aiProfileSummary ? (
              <p className="border-l border-border pl-3 text-sm leading-relaxed text-muted-foreground">
                {candidate.summary}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {candidate.primarySkills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
            {candidate.internalVettingNotes ? (
              <Alert>
                <CheckCircle2 aria-hidden="true" />
                <AlertTitle>Recruiter note</AlertTitle>
                <AlertDescription>{candidate.internalVettingNotes}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
        <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1" aria-label="Profile details">
          <Card size="sm">
            <CardContent className="space-y-1">
              <p className="caption-label">Readiness</p>
              <p className="text-xl font-medium">{candidate.jobReadinessLevel}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="space-y-1">
              <p className="caption-label">Work preference</p>
              <p className="text-base font-medium">
                {candidate.preferredWorkMode ?? 'Not specified'}
              </p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="space-y-1">
              <p className="caption-label">English</p>
              <p className="text-base font-medium">
                {candidate.englishProficiency ?? 'Not specified'}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Education</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {candidate.education.map((entry) => (
              <article key={entry.key}>
                <h3 className="font-medium">{entry.institution}</h3>
                <p className="text-sm text-muted-foreground">
                  {[entry.degree, entry.field].filter(Boolean).join(' · ') ||
                    'Program not specified'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[entry.start, entry.end].filter(Boolean).join(' – ') || 'Dates not specified'}
                </p>
              </article>
            ))}
            {candidate.education.length === 0 ? (
              <p className="text-sm text-muted-foreground">No education history was parsed.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {candidate.projects.map((project) => (
              <article key={project.key}>
                <h3 className="font-medium">{project.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {project.technologies.map((technology) => (
                    <Badge key={technology} variant="outline">
                      {technology}
                    </Badge>
                  ))}
                </div>
              </article>
            ))}
            {candidate.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects were parsed.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preferences and links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="caption-label">Expected salary</p>
              <p className="mt-1">{salary}</p>
            </div>
            <div>
              <p className="caption-label">Employment</p>
              <p className="mt-1">
                {candidate.employmentTypePreference.length
                  ? candidate.employmentTypePreference.join(', ').replaceAll('_', ' ')
                  : 'Not specified'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(candidate.externalProfiles).map(([provider, url]) =>
                url ? (
                  <a
                    key={provider}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    {externalProfileLabels[provider] ?? provider}
                  </a>
                ) : null,
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Timeline({ candidate }: { candidate: CandidateDossier }) {
  if (candidate.timeline.length === 0) {
    return (
      <EmptyState title="No timeline yet" detail="No career timeline was parsed from this CV." />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Career timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-5 border-l border-border pl-5">
          {candidate.timeline.map((entry) => (
            <li
              key={entry.key}
              className="relative space-y-1.5 before:absolute before:top-1.5 before:-left-[1.56rem] before:size-2 before:rounded-full before:bg-primary"
            >
              <h3 className="font-medium">{entry.role || 'Role not specified'}</h3>
              <p className="text-sm text-foreground">
                {entry.employer || 'Employer not specified'}
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays aria-hidden="true" className="size-3.5" />
                {entry.start ?? 'Start unknown'} – {entry.end ?? 'Present'}
                {entry.location ? ` · ${entry.location}` : ''}
              </p>
              {entry.scope ? (
                <p className="pt-1 text-sm text-muted-foreground">{entry.scope}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function Skills({ candidate }: { candidate: CandidateDossier }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills and supporting signals</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {candidate.skillMatrix.map((entry) => (
          <article key={entry.skill} className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="font-medium">{entry.skill}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {Math.round(entry.confidence * 100)}% extraction confidence
            </p>
            {entry.aliases.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Also found as {entry.aliases.join(', ')}
              </p>
            ) : null}
          </article>
        ))}
        {candidate.skillMatrix.length === 0 ? (
          <p className="text-sm text-muted-foreground">No skill evidence was parsed.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Evidence({ candidate }: { candidate: CandidateDossier }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Supporting evidence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {candidate.evidence.map((item) => (
          <article key={item.id} className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="caption-label">{item.chunkType.replaceAll('_', ' ')}</p>
            <p className="mt-2 leading-relaxed text-muted-foreground">{item.excerpt}</p>
          </article>
        ))}
        {candidate.evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No supporting evidence is available.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function CandidateDossierPage() {
  const { candidateId } = useParams()
  const [activeTab, setActiveTab] = useState<DossierTab>('overview')
  const query = useCandidateDossierQuery(candidateId)
  const originalDocument = useOriginalDocumentMutation(candidateId ?? '')

  async function openOriginalDocument() {
    const target = window.open('about:blank', '_blank')
    if (target) target.opener = null

    try {
      const url = await originalDocument.mutateAsync()
      if (target) target.location.replace(url)
      else window.location.assign(url)
    } catch (error) {
      target?.close()
      throw error
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabId: DossierTab) {
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = tabs[nextIndex]
    if (!nextTab) return
    setActiveTab(nextTab.id)
    document.getElementById(`candidate-dossier-tab-${nextTab.id}`)?.focus()
  }

  if (!candidateId) {
    return (
      <EmptyState
        title="Candidate not selected"
        detail="Open a dossier from candidates or search to inspect a grounded profile."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/candidates">Back to candidates</Link>
          </Button>
        }
      />
    )
  }

  if (query.isPending) {
    return <DossierSkeleton />
  }

  if (query.isError && query.error instanceof ApiError && query.error.status === 404) {
    return (
      <EmptyState
        title="Candidate not found"
        detail="This candidate may have been removed or is not available in your current company scope."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/candidates">Back to candidates</Link>
          </Button>
        }
      />
    )
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load candidate dossier</AlertTitle>
        <AlertDescription className="mt-2 space-y-3">
          <p>{getUserErrorMessage(query.error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const candidate = query.data

  return (
    <div className="mx-auto max-w-[90rem] space-y-6">
      <PageHeader
        eyebrow="Grounded candidate view"
        title={candidate.name}
        description={candidate.headline || candidate.currentTitle || 'Structured candidate dossier'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/candidates">Back to candidates</Link>
            </Button>
            {candidate.email ? (
              <Button asChild>
                <a href={`mailto:${candidate.email}`}>Contact candidate</a>
              </Button>
            ) : null}
            {candidate.originalDocumentAvailable ? (
              <Button
                type="button"
                variant="outline"
                disabled={originalDocument.isPending}
                onClick={() => void openOriginalDocument().catch(() => undefined)}
              >
                <FileText aria-hidden="true" />
                {originalDocument.isPending ? 'Opening…' : 'Open CV'}
              </Button>
            ) : null}
          </div>
        }
      />

      {originalDocument.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to open the original CV</AlertTitle>
          <AlertDescription>{getUserErrorMessage(originalDocument.error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-col justify-between gap-5 sm:flex-row">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Avatar className="size-16 rounded-2xl" size="lg">
              <AvatarFallback className="rounded-2xl text-lg font-medium">
                {initials(candidate.name)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge>{candidate.seniority.replace('-', ' ')}</Badge>
                {candidate.primaryRole ? (
                  <Badge variant="outline">{candidate.primaryRole}</Badge>
                ) : null}
                {candidate.status ? <Badge variant="secondary">{candidate.status}</Badge> : null}
                {candidate.isPreScreened ? <Badge variant="secondary">Pre-screened</Badge> : null}
              </div>
              <div>
                <h2 className="text-xl font-medium">
                  {candidate.currentTitle || 'Title not specified'}
                </h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <BriefcaseBusiness aria-hidden="true" className="size-4" />
                    {yearsLabel(candidate.yearsExperience)}
                  </span>
                  {candidate.location ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin aria-hidden="true" className="size-4" /> {candidate.location}
                    </span>
                  ) : null}
                  {candidate.email ? (
                    <a
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                      href={`mailto:${candidate.email}`}
                    >
                      <Mail aria-hidden="true" className="size-4" /> {candidate.email}
                    </a>
                  ) : null}
                  {candidate.phone ? (
                    <a
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                      href={`tel:${candidate.phone}`}
                    >
                      <Phone aria-hidden="true" className="size-4" /> {candidate.phone}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <FileText aria-hidden="true" className="mt-0.5 size-4 text-primary" />
            <span>{Math.round((candidate.confidence ?? 0) * 100)}% profile confidence</span>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="candidate-intelligence-heading" className="space-y-4">
        <div>
          <h2 id="candidate-intelligence-heading" className="text-xl font-medium">
            Candidate intelligence
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-grounded profile analysis and supporting evidence
          </p>
        </div>
        <div
          className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3"
          role="tablist"
          aria-label="Candidate dossier sections"
        >
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              id={`candidate-dossier-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-controls={`candidate-dossier-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div
          id={`candidate-dossier-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`candidate-dossier-tab-${activeTab}`}
          tabIndex={0}
        >
          {activeTab === 'overview' ? <ProfileSummary candidate={candidate} /> : null}
          {activeTab === 'timeline' ? <Timeline candidate={candidate} /> : null}
          {activeTab === 'skills' ? <Skills candidate={candidate} /> : null}
          {activeTab === 'evidence' ? <Evidence candidate={candidate} /> : null}
        </div>
      </section>

      <section
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        aria-label="Additional profile information"
      >
        <Card size="sm">
          <CardContent>
            <Languages aria-hidden="true" className="mb-2 size-4 text-primary" />
            <p className="caption-label">Languages</p>
            <p className="mt-1 text-sm">{candidate.languages.join(', ') || 'Not specified'}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="caption-label">Certifications</p>
            <p className="mt-1 text-sm">{candidate.certifications.join(', ') || 'Not specified'}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="caption-label">Notice period</p>
            <p className="mt-1 text-sm">
              {candidate.noticePeriod?.replaceAll('_', ' ') ?? 'Not specified'}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="caption-label">Relocation</p>
            <p className="mt-1 text-sm">
              {candidate.willingnessToRelocate === null
                ? 'Not specified'
                : candidate.willingnessToRelocate
                  ? 'Open to relocate'
                  : 'Not available'}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
