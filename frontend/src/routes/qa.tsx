import { useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  flexRender, getCoreRowModel, getSortedRowModel,
  useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from 'lucide-react'
import { defectsQuery } from '@/api/queries'
import { CATS, PRI_LABEL, TODAY, type Defect, type DefectStatus, type Priority } from '@/data/domain'
import { useSession } from '@/lib/session'
import { PageHeader } from '@/components/page-header'
import { Chip } from '@/components/ui/chip'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DefectDialog } from '@/components/defect-dialog'
import { NewDefectDialog } from '@/components/new-defect-dialog'
import { cn } from '@/lib/utils'

const STATUSES: DefectStatus[] = ['ღია', 'მიმდინარე', 'შემოწმებაზე', 'დახურული']

// Typed search params — filters live in the URL, so filtered views are linkable.
interface QaSearch {
  st?: DefectStatus
  pri?: Priority
  overdue?: boolean
  cat?: string
}

export const Route = createFileRoute('/qa')({
  validateSearch: (search: Record<string, unknown>): QaSearch => ({
    st: STATUSES.includes(search.st as DefectStatus) ? (search.st as DefectStatus) : undefined,
    pri: ['high', 'med', 'low'].includes(search.pri as string) ? (search.pri as Priority) : undefined,
    overdue: search.overdue === true || undefined,
    cat: (CATS as readonly string[]).includes(search.cat as string) ? (search.cat as string) : undefined,
  }),
  component: QaPage,
})

const PRI_DOT: Record<Priority, string> = { high: '#C0361F', med: '#92670A', low: '#8A949B' }

const GRID_COLS = 'grid-cols-[135px_105px_150px_minmax(200px,1fr)_100px_120px_170px_70px]'

function QaPage() {
  const { project, role } = useSession()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: all } = useSuspenseQuery(defectsQuery(project.id))
  const [selected, setSelected] = useState<Defect | null>(null)
  const [creating, setCreating] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])

  const isSub = role?.id === 'sub'

  const rows = useMemo(() => {
    let list = all
    if (isSub) list = list.filter((d) => d.sub === 'შპს ალიანს-მშენი')
    if (search.st) list = list.filter((d) => d.st === search.st)
    if (search.pri) list = list.filter((d) => d.pri === search.pri)
    if (search.overdue) list = list.filter((d) => d.due < TODAY && d.st !== 'დახურული')
    if (search.cat) list = list.filter((d) => d.cat === search.cat)
    return list
  }, [all, search, isSub])

  const columns = useMemo<ColumnDef<Defect>[]>(
    () => [
      { accessorKey: 'id', header: 'ID', cell: (c) => <span className="font-bold">{c.getValue<string>()}</span> },
      { accessorKey: 'cat', header: 'კატეგორია' },
      {
        id: 'loc',
        header: 'ლოკაცია',
        accessorFn: (d) => `${d.apt} · ${d.room}`,
        cell: (c) => <span className="text-mut-3">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'desc',
        header: 'აღწერა',
        enableSorting: false,
        cell: (c) => <span className="line-clamp-1 max-w-md text-mut-3">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'pri',
        header: 'პრიორ.',
        sortingFn: (a, b) => {
          const w: Record<Priority, number> = { high: 0, med: 1, low: 2 }
          return w[a.original.pri] - w[b.original.pri]
        },
        cell: (c) => {
          const p = c.getValue<Priority>()
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRI_DOT[p] }} />
              {PRI_LABEL[p]}
            </span>
          )
        },
      },
      { accessorKey: 'st', header: 'სტატუსი', cell: (c) => <StatusBadge status={c.getValue<string>()} /> },
      { accessorKey: 'sub', header: 'შემსრულებელი', cell: (c) => <span className="text-mut-3">{c.getValue<string>()}</span> },
      {
        accessorKey: 'due',
        header: 'ვადა',
        cell: (c) => {
          const d = c.row.original
          const late = d.due < TODAY && d.st !== 'დახურული'
          return <span className={late ? 'font-bold text-danger' : 'text-mut-3'}>{d.due.slice(5)}</span>
        },
      },
    ],
    [],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const parentRef = useRef<HTMLDivElement>(null)
  const tableRows = table.getRowModel().rows
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  })

  const setFilter = (patch: Partial<QaSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  const noFilter = !search.st && !search.pri && !search.overdue && !search.cat

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="QA/QC ხარვეზები"
        subtitle={`${rows.length} ჩანაწერი${isSub ? ' · ნაჩვენებია მხოლოდ თქვენი სამუშაოები' : ''}`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> ახალი ხარვეზი
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Chip active={noFilter} onClick={() => navigate({ search: {}, replace: true })}>
          ყველა
        </Chip>
        {STATUSES.map((s) => (
          <Chip
            key={s}
            active={search.st === s}
            onClick={() => setFilter({ st: search.st === s ? undefined : s, overdue: undefined, pri: undefined })}
          >
            {s}
          </Chip>
        ))}
        <Chip
          active={search.pri === 'high'}
          onClick={() => setFilter({ pri: search.pri === 'high' ? undefined : 'high' })}
        >
          მაღალი
        </Chip>
        <Chip
          active={!!search.overdue}
          onClick={() => setFilter({ overdue: search.overdue ? undefined : true })}
        >
          ვადაგადაცილებული
        </Chip>
        {search.cat && (
          <Chip active onClick={() => setFilter({ cat: undefined })}>
            კატეგორია: {search.cat} ✕
          </Chip>
        )}
      </div>

      <Card className="flex-1 overflow-hidden">
        {/* Virtualized list — header and rows share one grid template so columns stay aligned */}
        <div ref={parentRef} className="h-[calc(100vh-16rem)] overflow-auto">
          <div className="min-w-[960px] text-sm">
            <div className={cn('sticky top-0 z-10 grid bg-card shadow-[0_1px_0_var(--color-line)]', GRID_COLS)}>
              {table.getHeaderGroups().map((hg) =>
                hg.headers.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    disabled={!h.column.getCanSort()}
                    className={cn(
                      'flex h-10 items-center gap-1 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-mut-2',
                      h.column.getCanSort() && 'cursor-pointer select-none hover:text-ink',
                    )}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getCanSort() &&
                      ({ asc: <ArrowUp className="h-3 w-3" />, desc: <ArrowDown className="h-3 w-3" /> }[
                        h.column.getIsSorted() as string
                      ] ?? <ArrowUpDown className="h-3 w-3 opacity-40" />)}
                  </button>
                )),
              )}
            </div>
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const row = tableRows[vi.index]!
                return (
                  <div
                    key={row.id}
                    className={cn(
                      'absolute left-0 grid w-full cursor-pointer items-center border-b border-line hover:bg-soft/60',
                      GRID_COLS,
                    )}
                    style={{ transform: `translateY(${vi.start}px)`, height: vi.size }}
                    onClick={() => setSelected(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div key={cell.id} className="truncate px-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
          {rows.length === 0 && (
            <div className="p-10 text-center text-sm text-mut">
              ფილტრით ჩანაწერი ვერ მოიძებნა.{' '}
              <button className="font-bold text-brand cursor-pointer" onClick={() => navigate({ search: {}, replace: true })}>
                ფილტრის გასუფთავება
              </button>
            </div>
          )}
        </div>
      </Card>

      <DefectDialog defect={selected} onClose={() => setSelected(null)} />
      {creating && <NewDefectDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
