import { useMemo, useState } from 'react'
import { ArrowRight, GitCompareArrows, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Combobox } from '@/components/Combobox'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { useComparisonQuery } from '@/features/compare/api/useCompareApi'
import { CompareSelectionDialog } from '@/features/compare/components/CompareSelectionDialog'
import { ComparisonCandidateCard } from '@/features/compare/components/ComparisonCandidateCard'
import { useCompareParams } from '@/features/compare/hooks/useCompareParams'
import { MAXIMUM_COMPARED_CANDIDATES, MINIMUM_COMPARED_CANDIDATES } from '@/features/compare/types'
import { useShortlistResource } from '@/features/search/api/useShortlistApi'
import { commaSeparatedValues } from '@/lib/url/commaSeparatedValues'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

function chatHref(candidateIds: string[], question: string): string {
  return `/chat?${new URLSearchParams({ ids: candidateIds.join(','), q: question })}`
}

function ComparisonSkeleton() {
  return (
    <div className="space-y-4" aria-label="Preparing comparison">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-96 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </div>
  )
}

export function ComparePage() {
  const { params, updateParams } = useCompareParams()
  const comparison = useComparisonQuery(params)
  const shortlist = useShortlistResource()
  const [isSelectionOpen, setSelectionOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<string[]>(params.candidateIds)

  const shortlistItems = useMemo(() => shortlist.query.data ?? [], [shortlist.query.data])
  const shortlistNames = useMemo(
    () => new Map(shortlistItems.map((item) => [item.candidateId, item.candidateName])),
    [shortlistItems],
  )
  const canAskAgent = params.candidateIds.length >= MINIMUM_COMPARED_CANDIDATES

  const data = comparison.data
  const recommended = data?.items.find((item) => item.candidateId === data.recommendedCandidateId)
  const recommendedName = recommended
    ? (recommended.detail?.name ?? shortlistNames.get(recommended.candidateId) ?? null)
    : null

  function toggleDraftId(candidateId: string) {
    setDraftIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : current.length < MAXIMUM_COMPARED_CANDIDATES
          ? [...current, candidateId]
          : current,
    )
  }

  function applyDraftSelection() {
    updateParams({ candidateIds: draftIds })
    setSelectionOpen(false)
  }

  return (
    <div className="mx-auto max-w-[90rem] space-y-6">
      <PageHeader
        eyebrow="Decision support"
        title="Intelligent comparison"
        description="Compare shortlisted candidates side by side on shared skills, composite score, and grounded gaps."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraftIds(params.candidateIds)
                setSelectionOpen(true)
              }}
            >
              <GitCompareArrows aria-hidden="true" /> Choose candidates
            </Button>
            {canAskAgent ? (
              <Button asChild variant="outline">
                <Link
                  to={chatHref(
                    params.candidateIds,
                    'Which candidate is the strongest overall fit and why?',
                  )}
                >
                  <Sparkles aria-hidden="true" /> Ask SYNC AI
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="py-0">
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-end">
          <div className="flex-1 space-y-1.5">
            <Label>Required skills for this comparison</Label>
            <Combobox
              multiple
              creatable
              ariaLabel="Required skills"
              value={params.requiredSkills}
              options={[]}
              placeholder="Add a skill, e.g. React"
              emptyLabel="Type a skill to add it"
              normalizeInput={commaSeparatedValues}
              onChange={(requiredSkills) => updateParams({ requiredSkills })}
            />
          </div>
          {data?.source === 'cached_artifact' ? (
            <Badge variant="secondary" className="self-start md:self-auto">
              Cached result
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {params.candidateIds.length < MINIMUM_COMPARED_CANDIDATES ? (
        <EmptyState
          title="Compare candidates side by side"
          detail={`Select at least ${MINIMUM_COMPARED_CANDIDATES} candidates from your shortlist or search results to generate a grounded, side-by-side comparison.`}
          action={
            <div className="flex flex-wrap gap-2.5">
              <Button asChild>
                <Link to="/search">Go to talent search</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraftIds(params.candidateIds)
                  setSelectionOpen(true)
                }}
              >
                Select from shortlist
              </Button>
            </div>
          }
        />
      ) : null}

      {comparison.isPending && params.candidateIds.length >= MINIMUM_COMPARED_CANDIDATES ? (
        <ComparisonSkeleton />
      ) : null}

      {comparison.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to compare these candidates</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>{getUserErrorMessage(comparison.error)}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void comparison.refetch()}
            >
              <RefreshCw aria-hidden="true" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {data && data.items.length < MINIMUM_COMPARED_CANDIDATES ? (
        <EmptyState
          title="Not enough comparable candidates"
          detail="The comparison came back with fewer candidates than selected — some may no longer be available in this company scope. Choose a different set to try again."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraftIds(params.candidateIds)
                setSelectionOpen(true)
              }}
            >
              Choose candidates
            </Button>
          }
        />
      ) : null}

      {data && data.items.length >= MINIMUM_COMPARED_CANDIDATES ? (
        <>
          {recommended ? (
            <section
              aria-label="Recommended candidate"
              className="flex flex-col gap-4 rounded-xl bg-primary px-5 py-5 text-primary-foreground sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-foreground/20">
                  <ShieldCheck aria-hidden="true" className="size-6" />
                </span>
                <div>
                  <span className="text-xs font-medium tracking-[0.12em] text-primary-foreground/70 uppercase">
                    Recommended candidate
                  </span>
                  <h2 className="mt-0.5 text-lg font-medium leading-tight">
                    {recommendedName ?? 'Top-scoring candidate'}
                  </h2>
                  <p className="mt-1 text-sm text-primary-foreground/80">
                    {recommended.detail?.currentTitle
                      ? `${recommended.detail.currentTitle} · Score ${recommended.score}`
                      : `Score ${recommended.score}`}
                  </p>
                  <p className="mt-1 text-xs text-primary-foreground/70">
                    Based on current structured data. It does not replace interviewing every
                    shortlisted candidate.
                  </p>
                </div>
              </div>
              <Button asChild variant="secondary">
                <Link to={`/dossier/${recommended.candidateId}`}>
                  View dossier <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </section>
          ) : null}

          <section
            aria-label="Compared candidates"
            className={
              data.items.length === 2
                ? 'grid gap-4 md:grid-cols-2'
                : 'grid gap-4 md:grid-cols-2 lg:grid-cols-3'
            }
          >
            {data.items.map((item) => (
              <ComparisonCandidateCard
                key={item.candidateId}
                item={item}
                isRecommended={item.candidateId === data.recommendedCandidateId}
                shortlistName={shortlistNames.get(item.candidateId)}
              />
            ))}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Shared overlap</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                {data.overlap.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {data.overlap.map((skill) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No overlapping skills across every selected candidate.
                  </p>
                )}
                <p className="mt-auto border-t pt-3 text-xs text-muted-foreground">
                  Overlap is derived from structured skills and cached summaries, then presented as
                  reusable recruiter-facing evidence.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Decision support</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {data.overallSummary ??
                    `Comparing ${data.items.length} candidates on shared skills, composite score, and gaps against the required skills you set above.`}
                </p>
                {data.recommendedCandidateId ? (
                  <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
                    <Button asChild>
                      <Link to={`/dossier/${data.recommendedCandidateId}`}>
                        Open recommended dossier <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                    {canAskAgent ? (
                      <Button asChild variant="outline">
                        <Link
                          to={chatHref(
                            params.candidateIds,
                            'What are the main risks or gaps across this shortlist?',
                          )}
                        >
                          <Sparkles aria-hidden="true" /> Ask about risks
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <CompareSelectionDialog
        isOpen={isSelectionOpen}
        isPending={shortlist.query.isPending}
        items={shortlistItems}
        selectedIds={draftIds}
        onOpenChange={setSelectionOpen}
        onToggle={toggleDraftId}
        onApply={applyDraftSelection}
      />
    </div>
  )
}
