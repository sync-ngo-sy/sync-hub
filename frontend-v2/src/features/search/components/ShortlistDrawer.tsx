import {
  ArrowRight,
  BriefcaseBusiness,
  Download,
  FileText,
  MapPin,
  MessageSquareText,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { candidateRoleLabel } from '@/features/search/candidateRoleLabel'
import { ClearShortlistButton } from '@/features/search/components/ClearShortlistButton'
import { shortlistItemKey } from '@/features/search/shortlistIdentity'
import type { ShortlistItem, ShortlistRemoveCommand } from '@/features/search/types'

interface ShortlistDrawerProps {
  chatHref: string | null
  compareHref: string | null
  isOpen: boolean
  isPending: boolean
  isClearing: boolean
  items: ShortlistItem[]
  pendingRemove: ShortlistRemoveCommand | undefined
  pendingDocument: ShortlistRemoveCommand | undefined
  onClear: () => void
  onExport: () => void
  onOpenDocument: (item: ShortlistItem) => void
  onOpenChange: (open: boolean) => void
  onRemove: (item: ShortlistItem) => void
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function ShortlistDrawer({
  chatHref,
  compareHref,
  isOpen,
  isPending,
  isClearing,
  items,
  pendingRemove,
  pendingDocument,
  onClear,
  onExport,
  onOpenDocument,
  onOpenChange,
  onRemove,
}: ShortlistDrawerProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 right-0 bottom-0 left-auto flex max-w-full translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 py-5 pr-14">
          <DialogTitle>Saved shortlist</DialogTitle>
          <DialogDescription>
            {items.length} saved {items.length === 1 ? 'candidate' : 'candidates'} in the current
            company scope.
          </DialogDescription>
        </DialogHeader>

        <section className="min-h-0 flex-1 overflow-y-auto p-5" aria-label="Saved candidates">
          {isPending ? (
            <div className="space-y-3" aria-label="Loading saved candidates">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="grid min-h-48 place-items-center text-center">
              <div>
                <p className="font-medium">No candidates saved yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add candidates from talent search to build a shortlist.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const removing =
                  pendingRemove?.tenantId === item.tenantId &&
                  pendingRemove.candidateId === item.candidateId
                return (
                  <Card key={shortlistItemKey(item)} size="sm">
                    <CardHeader>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar size="lg">
                          <AvatarFallback>{initials(item.candidateName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <CardTitle className="truncate">{item.candidateName}</CardTitle>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {candidateRoleLabel(item)}
                          </p>
                        </div>
                      </div>
                      {item.matchRate !== null ? (
                        <CardAction>
                          <Badge>{item.matchRate}%</Badge>
                        </CardAction>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin aria-hidden="true" className="size-3.5" />
                          {item.location || 'Location not available'}
                        </span>
                        {item.yearsExperience !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <BriefcaseBusiness aria-hidden="true" className="size-3.5" />
                            {item.yearsExperience} years
                          </span>
                        ) : null}
                      </div>
                      {item.topSkills.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {item.topSkills.slice(0, 4).map((skill) => (
                            <Badge key={skill} variant="secondary">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                    <CardFooter className="justify-end">
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/dossier/${item.candidateId}`}>View dossier</Link>
                      </Button>
                      {item.cvUrl ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            pendingDocument?.tenantId === item.tenantId &&
                            pendingDocument.candidateId === item.candidateId
                          }
                          onClick={() => onOpenDocument(item)}
                        >
                          <FileText aria-hidden="true" />
                          {pendingDocument?.tenantId === item.tenantId &&
                          pendingDocument.candidateId === item.candidateId
                            ? 'Opening…'
                            : 'CV'}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={removing}
                        onClick={() => onRemove(item)}
                        aria-label={`Remove ${item.candidateName} from shortlist`}
                      >
                        <Trash2 aria-hidden="true" /> {removing ? 'Removing…' : 'Remove'}
                      </Button>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          )}
        </section>

        <footer className="flex flex-wrap justify-end gap-2 border-t bg-muted/30 p-4">
          {chatHref ? (
            <Button asChild variant="outline">
              <Link to={chatHref}>
                Ask Agent <MessageSquareText aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
          {compareHref ? (
            <Button asChild>
              <Link to={compareHref}>
                Compare <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={!items.length} onClick={onExport}>
            <Download aria-hidden="true" /> Export CSV
          </Button>
          <ClearShortlistButton count={items.length} isPending={isClearing} onConfirm={onClear} />
        </footer>
      </DialogContent>
    </Dialog>
  )
}
