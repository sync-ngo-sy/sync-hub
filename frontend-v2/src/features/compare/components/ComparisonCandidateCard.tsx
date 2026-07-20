import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { ComparisonItem } from '@/features/compare/types'
import { cn } from '@/lib/utils'

interface ComparisonCandidateCardProps {
  item: ComparisonItem
  isRecommended: boolean
  /** Name from the saved shortlist, used when a cached artifact carries no dossier detail. */
  shortlistName?: string
}

/** Coverage of the overlapping skill set, capped so a long list stays readable. */
function matchedSkillsCoverage(count: number): number {
  return Math.min(100, count * 24 + 20)
}

export function ComparisonCandidateCard({
  item,
  isRecommended,
  shortlistName,
}: ComparisonCandidateCardProps) {
  const { detail } = item
  const displayName = detail?.name ?? shortlistName ?? null

  return (
    <Card
      className={cn('h-full', isRecommended ? 'ring-2 ring-primary' : 'hover:ring-foreground/20')}
    >
      <CardHeader className="border-b pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CardTitle className="truncate text-base">
              {displayName ?? 'Candidate detail unavailable'}
            </CardTitle>
            {isRecommended ? <Badge>Top</Badge> : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {detail?.currentTitle ?? 'Title not recorded'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {detail ? (
              <>
                <Badge variant="secondary">{detail.seniority}</Badge>
                <Badge variant="secondary">{detail.yearsExperience} years</Badge>
              </>
            ) : (
              <Badge variant="secondary">Scoring only</Badge>
            )}
          </div>
        </div>
        <CardAction>
          <div className="flex flex-col items-end rounded-lg bg-muted px-3 py-1.5">
            <strong className="dashboard-number">{item.score}</strong>
            <span className="caption-label">Composite</span>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <section aria-label={`Matched skills for ${displayName ?? item.candidateId}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="caption-label">Matched skills</span>
            <span className="text-sm font-medium">{item.matchedSkills.length}</span>
          </div>
          <Progress value={matchedSkillsCoverage(item.matchedSkills.length)} />
          {item.matchedSkills.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.matchedSkills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          ) : null}
        </section>

        {detail ? (
          <section>
            <span className="caption-label">Summary</span>
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {detail.summary || 'No grounded summary recorded for this candidate yet.'}
            </p>
          </section>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            This comparison was served from a cached artifact, which stores scoring only. Open the
            dossier for the full profile.
          </p>
        )}

        {detail?.strengths.length ? (
          <section>
            <span className="caption-label">Strengths</span>
            <ul className="mt-1.5 flex flex-col gap-1">
              {detail.strengths.slice(0, 2).map((strength) => (
                <li key={strength} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ShieldCheck
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                  />
                  {strength}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-auto">
          <span className="caption-label">Gaps</span>
          {item.gaps.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {item.gaps.map((gap) => (
                <Badge key={gap} variant="outline" className="gap-1">
                  <AlertTriangle aria-hidden="true" className="size-3" />
                  {gap}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">
              No explicit gaps for the required skills.
            </p>
          )}
        </section>
      </CardContent>

      <CardFooter className="justify-end">
        <Button asChild variant="outline" size="sm">
          <Link
            to={`/dossier/${item.candidateId}`}
            aria-label={displayName ? `View dossier for ${displayName}` : 'View dossier'}
          >
            View dossier
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
