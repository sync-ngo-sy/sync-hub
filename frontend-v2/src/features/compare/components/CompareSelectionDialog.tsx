import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { MAXIMUM_COMPARED_CANDIDATES, MINIMUM_COMPARED_CANDIDATES } from '@/features/compare/types'
import { candidateRoleLabel } from '@/features/search/candidateRoleLabel'
import type { ShortlistItem } from '@/features/search/types'

interface CompareSelectionDialogProps {
  isOpen: boolean
  isPending: boolean
  items: ShortlistItem[]
  /** The transient multi-select set, owned by the compare page until applied to the URL. */
  selectedIds: string[]
  onOpenChange: (open: boolean) => void
  onToggle: (candidateId: string) => void
  onApply: () => void
}

export function CompareSelectionDialog({
  isOpen,
  isPending,
  items,
  selectedIds,
  onOpenChange,
  onToggle,
  onApply,
}: CompareSelectionDialogProps) {
  const atLimit = selectedIds.length >= MAXIMUM_COMPARED_CANDIDATES

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 py-5 pr-14">
          <DialogTitle>Choose candidates to compare</DialogTitle>
          <DialogDescription>
            Pick between {MINIMUM_COMPARED_CANDIDATES} and {MAXIMUM_COMPARED_CANDIDATES} candidates
            from your saved shortlist. The comparison itself is kept in the address bar, so you can
            share or refresh it.
          </DialogDescription>
        </DialogHeader>

        <section className="min-h-0 flex-1 overflow-y-auto p-5" aria-label="Shortlisted candidates">
          {isPending ? (
            <div className="space-y-2" aria-label="Loading saved candidates">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : items.length ? (
            <ul className="space-y-1.5">
              {items.map((item) => {
                const isSelected = selectedIds.includes(item.candidateId)
                const inputId = `compare-candidate-${item.tenantId}-${item.candidateId}`
                return (
                  <li key={`${item.tenantId}:${item.candidateId}`}>
                    <label
                      htmlFor={inputId}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/60"
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={isSelected}
                        disabled={!isSelected && atLimit}
                        onChange={() => onToggle(item.candidateId)}
                      />
                      <span className="min-w-0 text-sm">{item.candidateName}</span>
                      <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">
                        {candidateRoleLabel(item)}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="grid min-h-32 place-items-center text-center">
              <div>
                <p className="font-medium">No saved candidates yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Shortlist candidates from talent search, then come back to compare them.
                </p>
              </div>
            </div>
          )}
        </section>

        <DialogFooter className="border-t px-5 py-4">
          <span className="mr-auto text-sm text-muted-foreground">
            {selectedIds.length} selected
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selectedIds.length < MINIMUM_COMPARED_CANDIDATES}
            onClick={onApply}
          >
            Compare selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
