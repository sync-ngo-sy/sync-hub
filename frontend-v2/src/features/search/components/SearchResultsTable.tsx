import { useCallback, useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { SearchParams, SearchResponse, SearchResult } from '@/features/search/types'
import { candidateRoleLabel } from '@/features/search/candidateRoleLabel'
import { shortlistItemKey } from '@/features/search/shortlistIdentity'

interface SearchResultsTableProps {
  response: SearchResponse
  params: SearchParams
  isFetching: boolean
  onChange: (patch: Partial<SearchParams>, resetPage?: boolean) => void
  onPreview: (candidate: SearchResult) => void
  onToggleShortlist: (candidate: SearchResult) => void
  shortlistKeys: ReadonlySet<string>
  pendingShortlistKeys: ReadonlySet<string>
}

const columnHelper = createColumnHelper<SearchResult>()

export function SearchResultsTable({
  response,
  params,
  isFetching,
  onChange,
  onPreview,
  onToggleShortlist,
  shortlistKeys,
  pendingShortlistKeys,
}: SearchResultsTableProps) {
  const sortableHeader = useCallback(
    (label: string, sort: SearchParams['sort']) => {
      const active = params.sort === sort
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-3"
          onClick={() =>
            onChange({
              sort,
              direction: active && params.direction === 'asc' ? 'desc' : 'asc',
            })
          }
        >
          {label}
          {active ? (
            params.direction === 'asc' ? (
              <ArrowUp aria-hidden="true" />
            ) : (
              <ArrowDown aria-hidden="true" />
            )
          ) : null}
        </Button>
      )
    },
    [onChange, params.direction, params.sort],
  )

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: () => sortableHeader('Candidate', 'name'),
        cell: ({ row }) => (
          <div className="flex min-w-52 flex-col gap-0.5">
            <button
              type="button"
              className="w-fit text-left font-medium text-foreground hover:text-primary"
              onClick={() => onPreview(row.original)}
            >
              {row.original.name}
            </button>
            <span className="text-xs text-muted-foreground">
              {candidateRoleLabel(row.original)}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor('matchRate', {
        header: () => sortableHeader('Match', 'matchRate'),
        cell: (info) => <Badge>{info.getValue()}%</Badge>,
      }),
      columnHelper.accessor('location', {
        header: 'Location',
        cell: (info) => info.getValue() || '—',
      }),
      columnHelper.accessor('yearsExperience', {
        header: () => sortableHeader('Experience', 'yearsExperience'),
        cell: (info) => `${info.getValue()} years`,
      }),
      columnHelper.accessor('topSkills', {
        header: 'Matching skills',
        enableSorting: false,
        cell: (info) => (
          <div className="flex max-w-80 flex-wrap gap-1">
            {info
              .getValue()
              .slice(0, 3)
              .map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
          </div>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const key = shortlistItemKey(row.original)
          const shortlisted = shortlistKeys.has(key)
          const pending = pendingShortlistKeys.has(key)
          return (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onPreview(row.original)}
              >
                <Eye aria-hidden="true" /> Open
              </Button>
              <Button
                type="button"
                variant={shortlisted ? 'secondary' : 'ghost'}
                size="sm"
                disabled={pending}
                onClick={() => onToggleShortlist(row.original)}
                aria-label={`${shortlisted ? 'Remove' : 'Add'} ${row.original.name} ${shortlisted ? 'from' : 'to'} shortlist`}
              >
                {shortlisted ? (
                  <BookmarkCheck aria-hidden="true" />
                ) : (
                  <Bookmark aria-hidden="true" />
                )}
                {pending ? 'Saving…' : shortlisted ? 'Saved' : 'Save'}
              </Button>
            </div>
          )
        },
      }),
    ],
    [onPreview, onToggleShortlist, pendingShortlistKeys, shortlistKeys, sortableHeader],
  )
  const sorting: SortingState = [{ id: params.sort, desc: params.direction === 'desc' }]
  // TanStack Table intentionally returns callable table methods; React Compiler
  // cannot memoize this third-party hook, but the table owns no compiler state.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: response.results,
    columns,
    state: { sorting },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: shortlistItemKey,
  })
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-row items-center justify-between border-b py-4">
        <div>
          <CardTitle>Search results</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
            {isFetching
              ? 'Refreshing…'
              : `${response.meta.pageCount.toLocaleString()} ${response.meta.pageCount === 1 ? 'candidate' : 'candidates'} on this page`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Per page
          <select
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            value={params.pageSize}
            onChange={(event) => {
              const pageSize = Number.parseInt(event.target.value, 10)
              if (pageSize === 20 || pageSize === 50) onChange({ pageSize })
            }}
            aria-label="Results per page"
          >
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="first:pl-4 last:pr-4">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="first:pl-4 last:pr-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Current page sorted by {params.sort.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={params.page <= 1}
            onClick={() => onChange({ page: params.page - 1 }, false)}
          >
            <ChevronLeft aria-hidden="true" /> Previous
          </Button>
          <span>Page {params.page}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={response.nextCursor === null}
            onClick={() => onChange({ page: params.page + 1 }, false)}
          >
            Next <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
